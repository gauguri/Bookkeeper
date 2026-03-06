from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import (
    Customer,
    GLEntry,
    Inventory,
    InventoryReservation,
    Invoice,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesRequest,
    SalesRequestLine,
)

OPEN_SALES_STATUSES = {"NEW", "QUOTED", "CONFIRMED", "INVOICED"}
OPEN_INVOICE_STATUSES = {"DRAFT", "SENT", "PARTIALLY_PAID", "PAID"}

RISK_RED_AGE_DAYS = 30
RISK_YELLOW_AGE_DAYS = 20
RISK_RED_AR_PAST_DUE = Decimal("25000")
RISK_YELLOW_AR_PAST_DUE = Decimal("10000")


@dataclass
class OperationalBacklogFilters:
    location_id: int | None = None
    customer_id: int | None = None
    sku: str | None = None
    product: str | None = None
    status: str | None = None
    include_draft: bool = False


def _to_decimal(value: Any) -> Decimal:
    return Decimal(value or 0)


def _risk_flag(oldest_age: int, shortage_qty: Decimal, ar_past_due: Decimal) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if shortage_qty > 0:
        reasons.append("shortage")
    if oldest_age > RISK_RED_AGE_DAYS:
        reasons.append("aged_requests")
    if ar_past_due >= RISK_RED_AR_PAST_DUE:
        reasons.append("ar_past_due")
    if reasons:
        return "red", reasons

    yellow_reasons: list[str] = []
    if oldest_age >= RISK_YELLOW_AGE_DAYS:
        yellow_reasons.append("aged_requests")
    if ar_past_due >= RISK_YELLOW_AR_PAST_DUE:
        yellow_reasons.append("ar_past_due")
    if yellow_reasons:
        return "yellow", yellow_reasons

    return "green", []


def get_operational_backlog(db: Session, start: date, end: date, range_label: str, filters: OperationalBacklogFilters) -> dict[str, Any]:
    demand_query = (
        db.query(
            SalesRequest.id.label("sales_request_id"),
            SalesRequest.request_number,
            SalesRequest.status.label("sales_status"),
            SalesRequest.created_at.label("request_created_at"),
            SalesRequest.customer_id,
            func.coalesce(SalesRequest.customer_name, Customer.name, "Unassigned").label("customer_name"),
            SalesRequestLine.item_id,
            Item.sku,
            Item.name.label("item_name"),
            func.sum(SalesRequestLine.quantity).label("demand_qty"),
            func.sum(SalesRequestLine.line_total).label("demand_value"),
        )
        .join(SalesRequestLine, SalesRequestLine.sales_request_id == SalesRequest.id)
        .join(Item, Item.id == SalesRequestLine.item_id)
        .outerjoin(Customer, Customer.id == SalesRequest.customer_id)
        .filter(SalesRequest.created_at >= datetime.combine(start, datetime.min.time()))
        .filter(SalesRequest.created_at <= datetime.combine(end, datetime.max.time()))
        .filter(SalesRequest.status.in_(OPEN_SALES_STATUSES))
    )

    if not filters.include_draft:
        demand_query = demand_query.filter(SalesRequest.status != "NEW")
    if filters.customer_id:
        demand_query = demand_query.filter(SalesRequest.customer_id == filters.customer_id)
    if filters.sku:
        demand_query = demand_query.filter(Item.sku == filters.sku)
    if filters.product:
        demand_query = demand_query.filter(Item.name.ilike(f"%{filters.product}%"))
    if filters.status == "OPEN":
        demand_query = demand_query.filter(SalesRequest.status.in_(["NEW", "QUOTED", "CONFIRMED"]))
    elif filters.status == "PARTIAL":
        demand_query = demand_query.filter(SalesRequest.status == "INVOICED")

    demand_rows = (
        demand_query.group_by(
            SalesRequest.id,
            SalesRequest.request_number,
            SalesRequest.status,
            SalesRequest.created_at,
            SalesRequest.customer_id,
            Customer.name,
            SalesRequest.customer_name,
            SalesRequestLine.item_id,
            Item.sku,
            Item.name,
        )
        .all()
    )

    if not demand_rows:
        return {
            "range": range_label,
            "filters": {
                "location_id": filters.location_id,
                "customer_id": filters.customer_id,
                "sku": filters.sku,
                "product": filters.product,
                "status": filters.status,
                "include_draft": filters.include_draft,
            },
            "kpis": {
                "total_backlog_value": Decimal("0"),
                "open_sales_requests": 0,
                "open_invoices": 0,
                "open_lines": 0,
            },
            "item_shortages": [],
            "customer_backlog": [],
            "debug": {
                "computed_at": datetime.utcnow(),
                "source_counts": {
                    "demand_rows": 0,
                    "reservations": 0,
                    "open_invoices": 0,
                    "gl_links": 0,
                },
            },
        }

    item_ids = sorted({int(row.item_id) for row in demand_rows})
    customer_ids = sorted({int(row.customer_id) for row in demand_rows if row.customer_id})

    reservation_rows = (
        db.query(
            InventoryReservation.item_id,
            func.coalesce(func.sum(InventoryReservation.qty_reserved), 0).label("reserved_qty"),
        )
        .filter(InventoryReservation.released_at.is_(None))
        .filter(InventoryReservation.item_id.in_(item_ids))
        .group_by(InventoryReservation.item_id)
        .all()
    )
    reservation_by_item = {int(row.item_id): _to_decimal(row.reserved_qty) for row in reservation_rows}

    inventory_rows = (
        db.query(Inventory.item_id, func.coalesce(func.sum(Inventory.quantity_on_hand), 0))
        .filter(Inventory.item_id.in_(item_ids))
        .group_by(Inventory.item_id)
        .all()
    )
    on_hand_by_item = {int(item_id): _to_decimal(on_hand) for item_id, on_hand in inventory_rows}

    inbound_rows = (
        db.query(PurchaseOrderLine.item_id, func.min(PurchaseOrder.expected_date))
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(PurchaseOrderLine.item_id.in_(item_ids))
        .filter(PurchaseOrder.status.in_(["SENT", "PARTIALLY_RECEIVED"]))
        .filter(PurchaseOrderLine.qty_ordered > PurchaseOrderLine.qty_received)
        .group_by(PurchaseOrderLine.item_id)
        .all()
    )
    inbound_by_item = {int(item_id): eta for item_id, eta in inbound_rows}

    today = datetime.utcnow().date()
    ar_rows = (
        db.query(
            Invoice.customer_id,
            func.coalesce(
                func.sum(
                    case(
                        (
                            (Invoice.amount_due > 0) & (Invoice.due_date < today) & Invoice.status.in_(OPEN_INVOICE_STATUSES),
                            Invoice.amount_due,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("past_due"),
            func.sum(
                case(
                    (
                        (Invoice.amount_due > 0) & Invoice.status.in_(OPEN_INVOICE_STATUSES),
                        1,
                    ),
                    else_=0,
                )
            ).label("open_invoice_count"),
        )
        .filter(Invoice.customer_id.in_(customer_ids or [-1]))
        .group_by(Invoice.customer_id)
        .all()
    )
    ar_by_customer = {int(row.customer_id): {"past_due": _to_decimal(row.past_due), "open_invoice_count": int(row.open_invoice_count or 0)} for row in ar_rows}

    open_invoice_count = sum(v["open_invoice_count"] for v in ar_by_customer.values())

    backlog_qty_by_item: dict[int, Decimal] = {}
    backlog_value_by_item: dict[int, Decimal] = {}
    item_dim: dict[int, dict[str, Any]] = {}
    open_sales_ids: set[int] = set()
    customer_rollup: dict[int, dict[str, Any]] = {}

    for row in demand_rows:
        item_id = int(row.item_id)
        customer_id = int(row.customer_id) if row.customer_id else -row.sales_request_id
        demand_qty = _to_decimal(row.demand_qty)
        demand_value = _to_decimal(row.demand_value)
        backlog_qty_by_item[item_id] = backlog_qty_by_item.get(item_id, Decimal("0")) + demand_qty
        backlog_value_by_item[item_id] = backlog_value_by_item.get(item_id, Decimal("0")) + demand_value
        item_dim[item_id] = {"sku": row.sku, "name": row.item_name}
        open_sales_ids.add(int(row.sales_request_id))

        if customer_id not in customer_rollup:
            customer_rollup[customer_id] = {
                "customer_id": row.customer_id,
                "customer_name": row.customer_name,
                "backlog_value": Decimal("0"),
                "oldest_date": row.request_created_at.date() if row.request_created_at else today,
                "status_mix": {"open": 0, "partial": 0, "backordered": 0},
                "item_ids": set(),
            }
        bucket = customer_rollup[customer_id]
        bucket["backlog_value"] += demand_value
        if row.request_created_at and row.request_created_at.date() < bucket["oldest_date"]:
            bucket["oldest_date"] = row.request_created_at.date()
        if row.sales_status in {"NEW", "QUOTED", "CONFIRMED"}:
            bucket["status_mix"]["open"] += 1
        elif row.sales_status in {"INVOICED"}:
            bucket["status_mix"]["partial"] += 1
        bucket["item_ids"].add(item_id)

    item_shortages = []
    shortage_by_item: dict[int, Decimal] = {}
    for item_id in item_ids:
        on_hand = on_hand_by_item.get(item_id, Decimal("0"))
        reserved = reservation_by_item.get(item_id, Decimal("0"))
        available_raw = on_hand - reserved
        available = max(available_raw, Decimal("0"))
        backlog_qty = backlog_qty_by_item.get(item_id, Decimal("0"))
        shortage = max(backlog_qty - available, Decimal("0"))
        shortage_by_item[item_id] = shortage
        item_shortages.append(
            {
                "item_id": item_id,
                "sku": item_dim[item_id]["sku"],
                "name": item_dim[item_id]["name"],
                "on_hand": on_hand,
                "reserved": reserved,
                "available": available,
                "backlog_qty": backlog_qty,
                "shortage_qty": shortage,
                "next_inbound_eta": inbound_by_item.get(item_id),
            }
        )

    item_shortages.sort(key=lambda row: (row["shortage_qty"], row["backlog_qty"]), reverse=True)

    customer_backlog = []
    for row in customer_rollup.values():
        customer_id = row["customer_id"]
        ar = ar_by_customer.get(int(customer_id), {"past_due": Decimal("0")}) if customer_id else {"past_due": Decimal("0")}
        shortage_total = sum(shortage_by_item.get(item_id, Decimal("0")) for item_id in row["item_ids"])
        if shortage_total > 0:
            row["status_mix"]["backordered"] += 1
        oldest_age = max((today - row["oldest_date"]).days, 0)
        risk_flag, reasons = _risk_flag(oldest_age, shortage_total, _to_decimal(ar["past_due"]))

        customer_backlog.append(
            {
                "customer_id": customer_id,
                "customer_name": row["customer_name"],
                "backlog_value": row["backlog_value"],
                "oldest_request_age_days": oldest_age,
                "status_mix": row["status_mix"],
                "risk_flag": risk_flag,
                "risk_reasons": reasons,
            }
        )

    customer_backlog.sort(key=lambda row: row["backlog_value"], reverse=True)

    backlog_invoice_ids = [
        invoice_id
        for (invoice_id,) in db.query(Invoice.id)
        .filter(Invoice.customer_id.in_(customer_ids or [-1]))
        .filter(Invoice.status.in_(OPEN_INVOICE_STATUSES))
        .all()
    ]
    gl_links = (
        db.query(func.count(GLEntry.id))
        .filter(GLEntry.reference_type == "invoice")
        .filter(GLEntry.reference_id.in_(backlog_invoice_ids or [-1]))
        .scalar()
    )

    return {
        "range": range_label,
        "filters": {
            "location_id": filters.location_id,
            "customer_id": filters.customer_id,
            "sku": filters.sku,
            "product": filters.product,
            "status": filters.status,
            "include_draft": filters.include_draft,
        },
        "kpis": {
            "total_backlog_value": sum((row["backlog_value"] for row in customer_backlog), Decimal("0")),
            "open_sales_requests": len(open_sales_ids),
            "open_invoices": int(open_invoice_count),
            "open_lines": len(demand_rows),
        },
        "item_shortages": item_shortages,
        "customer_backlog": customer_backlog,
        "debug": {
            "computed_at": datetime.utcnow(),
            "source_counts": {
                "demand_rows": len(demand_rows),
                "reservations": len(reservation_rows),
                "open_invoices": open_invoice_count,
                "gl_links": int(gl_links or 0),
            },
        },
    }
