from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Dict, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.backlog import schemas
from app.models import (
    Customer,
    Inventory,
    InventoryReservation,
    Invoice,
    InvoiceLine,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesRequest,
    SalesRequestLine,
)

OPEN_INVOICE_STATUSES = {"DRAFT", "SENT", "PARTIALLY_PAID", "PAID"}
CLOSED_INVOICE_STATUSES = {"SHIPPED", "VOID"}
CLOSED_SR_STATUSES = {"SHIPPED", "CLOSED"}


def _today() -> datetime:
    return datetime.utcnow()


def _days_old(created_at: datetime | None) -> int:
    if not created_at:
        return 0
    return max((_today() - created_at).days, 0)


def _safe_decimal(value: Decimal | None) -> Decimal:
    return Decimal(value or 0)


def _line_rates_by_item(db: Session, line_model, source_id_column) -> dict[tuple[int, int], Decimal]:
    rows = (
        db.query(
            source_id_column,
            line_model.item_id,
            func.coalesce(func.sum(line_model.quantity), 0),
            func.coalesce(func.sum(line_model.line_total), 0),
        )
        .group_by(source_id_column, line_model.item_id)
        .all()
    )
    rates: dict[tuple[int, int], Decimal] = {}
    for source_id, item_id, qty, line_total in rows:
        qty_decimal = _safe_decimal(qty)
        rates[(int(source_id), int(item_id))] = (_safe_decimal(line_total) / qty_decimal) if qty_decimal > 0 else Decimal("0")
    return rates


def _active_backlog_reservations(db: Session) -> list[InventoryReservation]:
    reservations = (
        db.query(InventoryReservation)
        .filter(InventoryReservation.released_at.is_(None), InventoryReservation.qty_reserved > 0)
        .all()
    )
    invoice_status_by_id = {row.id: row.status for row in db.query(Invoice.id, Invoice.status).all()}
    sales_request_status_by_id = {row.id: row.status for row in db.query(SalesRequest.id, SalesRequest.status).all()}

    filtered: list[InventoryReservation] = []
    for reservation in reservations:
        if reservation.source_type == "invoice":
            status = invoice_status_by_id.get(reservation.source_id)
            if status and status not in CLOSED_INVOICE_STATUSES:
                filtered.append(reservation)
        elif reservation.source_type == "sales_request":
            status = sales_request_status_by_id.get(reservation.source_id)
            if status and status not in CLOSED_SR_STATUSES:
                filtered.append(reservation)
    return filtered


def get_backlog_summary(db: Session) -> schemas.BacklogSummaryResponse:
    reservations = _active_backlog_reservations(db)
    invoice_rates = _line_rates_by_item(db, InvoiceLine, InvoiceLine.invoice_id)
    sales_request_rates = _line_rates_by_item(db, SalesRequestLine, SalesRequestLine.sales_request_id)

    open_sr_ids = {r.source_id for r in reservations if r.source_type == "sales_request"}
    open_invoice_ids = {r.source_id for r in reservations if r.source_type == "invoice"}
    total_value = Decimal("0")
    for reservation in reservations:
        key = (reservation.source_id, reservation.item_id)
        unit_rate = invoice_rates.get(key, Decimal("0")) if reservation.source_type == "invoice" else sales_request_rates.get(key, Decimal("0"))
        total_value += _safe_decimal(reservation.qty_reserved) * unit_rate

    return schemas.BacklogSummaryResponse(
        total_backlog_value=total_value,
        open_sales_requests_count=len(open_sr_ids),
        open_invoices_count=len(open_invoice_ids),
    )


def _inbound_eta_by_item(db: Session, item_ids: Iterable[int]) -> dict[int, datetime.date]:
    item_ids = list(item_ids)
    if not item_ids:
        return {}

    rows = (
        db.query(PurchaseOrderLine.item_id, func.min(PurchaseOrder.expected_date))
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(
            PurchaseOrder.status.in_(["SENT", "PARTIALLY_RECEIVED"]),
            PurchaseOrder.expected_date.isnot(None),
            PurchaseOrderLine.item_id.in_(item_ids),
            PurchaseOrderLine.qty_ordered > PurchaseOrderLine.qty_received,
        )
        .group_by(PurchaseOrderLine.item_id)
        .all()
    )
    return {item_id: eta for item_id, eta in rows if eta is not None}


def get_backlog_items(db: Session) -> list[schemas.BacklogItemResponse]:
    reservations = _active_backlog_reservations(db)
    if not reservations:
        return []

    item_ids = sorted({r.item_id for r in reservations})
    inventory_by_item = {
        row.item_id: _safe_decimal(row.quantity_on_hand)
        for row in db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
    }
    item_name_by_id = {row.id: row.name for row in db.query(Item.id, Item.name).filter(Item.id.in_(item_ids)).all()}

    invoices = {row.id: row for row in db.query(Invoice).filter(Invoice.id.in_({r.source_id for r in reservations if r.source_type == "invoice"})).all()}
    sales_requests = {
        row.id: row for row in db.query(SalesRequest).filter(SalesRequest.id.in_({r.source_id for r in reservations if r.source_type == "sales_request"})).all()
    }
    customer_by_id = {row.id: row.name for row in db.query(Customer.id, Customer.name).all()}

    invoice_rates = _line_rates_by_item(db, InvoiceLine, InvoiceLine.invoice_id)
    sales_request_rates = _line_rates_by_item(db, SalesRequestLine, SalesRequestLine.sales_request_id)
    eta_by_item = _inbound_eta_by_item(db, item_ids)

    consumers_by_item: Dict[int, list[schemas.BacklogItemConsumerResponse]] = defaultdict(list)
    backlog_by_item: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))

    for reservation in reservations:
        key = (reservation.source_id, reservation.item_id)
        reserved_qty = _safe_decimal(reservation.qty_reserved)
        if reservation.source_type == "invoice":
            source = invoices.get(reservation.source_id)
            if not source:
                continue
            unit_rate = invoice_rates.get(key, Decimal("0"))
            source_number = source.invoice_number
            source_status = source.status
            source_created_at = source.created_at
            customer_name = customer_by_id.get(source.customer_id, f"Customer #{source.customer_id}")
        else:
            source = sales_requests.get(reservation.source_id)
            if not source:
                continue
            unit_rate = sales_request_rates.get(key, Decimal("0"))
            source_number = source.request_number
            source_status = source.status
            source_created_at = source.created_at
            customer_name = source.customer_name or (customer_by_id.get(source.customer_id) if source.customer_id else None) or "Unassigned"

        backlog_value = reserved_qty * unit_rate
        backlog_by_item[reservation.item_id] += reserved_qty
        consumers_by_item[reservation.item_id].append(
            schemas.BacklogItemConsumerResponse(
                source_type=reservation.source_type,
                source_id=reservation.source_id,
                source_number=source_number,
                source_status=source_status,
                customer=customer_name,
                reserved_qty=reserved_qty,
                backlog_value=backlog_value,
                age_days=_days_old(source_created_at),
            )
        )

    rows: list[schemas.BacklogItemResponse] = []
    for item_id in item_ids:
        on_hand = inventory_by_item.get(item_id, Decimal("0"))
        backlog_qty = backlog_by_item.get(item_id, Decimal("0"))
        available = on_hand - backlog_qty
        shortage = abs(available) if available < 0 else Decimal("0")
        consumers = sorted(consumers_by_item.get(item_id, []), key=lambda row: row.age_days, reverse=True)
        rows.append(
            schemas.BacklogItemResponse(
                item_id=item_id,
                item_name=item_name_by_id.get(item_id, f"Item #{item_id}"),
                on_hand_qty=on_hand,
                reserved_qty=backlog_qty,
                available_qty=available,
                backlog_qty=backlog_qty,
                shortage_qty=shortage,
                next_inbound_eta=eta_by_item.get(item_id),
                consumers=consumers,
            )
        )

    rows.sort(key=lambda row: (row.shortage_qty, row.backlog_qty), reverse=True)
    return rows


def get_backlog_customers(db: Session) -> list[schemas.BacklogCustomerResponse]:
    reservations = _active_backlog_reservations(db)
    if not reservations:
        return []

    invoices = {row.id: row for row in db.query(Invoice).filter(Invoice.id.in_({r.source_id for r in reservations if r.source_type == "invoice"})).all()}
    sales_requests = {
        row.id: row for row in db.query(SalesRequest).filter(SalesRequest.id.in_({r.source_id for r in reservations if r.source_type == "sales_request"})).all()
    }
    customer_by_id = {row.id: row.name for row in db.query(Customer.id, Customer.name).all()}

    invoice_rates = _line_rates_by_item(db, InvoiceLine, InvoiceLine.invoice_id)
    sales_request_rates = _line_rates_by_item(db, SalesRequestLine, SalesRequestLine.sales_request_id)

    bucket = defaultdict(lambda: {"value": Decimal("0"), "oldest": 0, "statuses": defaultdict(int), "shortage": Decimal("0")})
    item_rows = get_backlog_items(db)
    shortage_by_item = {row.item_id: row.shortage_qty for row in item_rows}

    for reservation in reservations:
        reserved_qty = _safe_decimal(reservation.qty_reserved)
        key = (reservation.source_id, reservation.item_id)
        if reservation.source_type == "invoice":
            source = invoices.get(reservation.source_id)
            if not source:
                continue
            customer_name = customer_by_id.get(source.customer_id, f"Customer #{source.customer_id}")
            status = source.status
            age_days = _days_old(source.created_at)
            unit_rate = invoice_rates.get(key, Decimal("0"))
        else:
            source = sales_requests.get(reservation.source_id)
            if not source:
                continue
            customer_name = source.customer_name or (customer_by_id.get(source.customer_id) if source.customer_id else None) or "Unassigned"
            status = source.status
            age_days = _days_old(source.created_at)
            unit_rate = sales_request_rates.get(key, Decimal("0"))

        customer_row = bucket[customer_name]
        customer_row["value"] += reserved_qty * unit_rate
        customer_row["oldest"] = max(customer_row["oldest"], age_days)
        customer_row["statuses"][status] += 1
        customer_row["shortage"] += shortage_by_item.get(reservation.item_id, Decimal("0"))

    results: list[schemas.BacklogCustomerResponse] = []
    for customer, info in bucket.items():
        status_mix = ", ".join(f"{status}:{count}" for status, count in sorted(info["statuses"].items()))
        risk_flag = "HIGH" if info["shortage"] > 0 else ("MEDIUM" if info["oldest"] >= 14 else "LOW")
        results.append(
            schemas.BacklogCustomerResponse(
                customer=customer,
                backlog_value=info["value"],
                oldest_request_age_days=info["oldest"],
                status_mix=status_mix,
                risk_flag=risk_flag,
            )
        )

    results.sort(key=lambda row: row.backlog_value, reverse=True)
    return results
