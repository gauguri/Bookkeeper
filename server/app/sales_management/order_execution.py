from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, joinedload, selectinload

from app.inventory.service import (
    SOURCE_INVOICE,
    get_available_qty,
    get_reserved_qty,
    get_source_reserved_qty_map,
    release_reservations,
    sync_reservations_for_source,
)
from app.models import (
    Customer,
    Inventory,
    Invoice,
    Item,
    SalesAccount,
    SalesActivity,
    SalesOrder,
    SalesOrderLine,
)
from app.sales.service import create_invoice
from app.suppliers.service import get_supplier_link

SOURCE_SALES_ORDER = "sales_order"
ORDER_EXECUTION_FLOW = ["DRAFT", "CONFIRMED", "ALLOCATED", "INVOICED", "FULFILLED", "CLOSED"]
ORDER_TERMINAL_STATUSES = {"CLOSED"}
ZERO = Decimal("0.00")


def _to_decimal(value: Any, default: Decimal = ZERO) -> Decimal:
    if value is None:
        return default
    return Decimal(str(value))


def _status_rank(status: str) -> int:
    try:
        return ORDER_EXECUTION_FLOW.index(status)
    except ValueError:
        return -1


def should_reserve_inventory_for_order_status(status: str) -> bool:
    return status in {"CONFIRMED", "ALLOCATED"}


def sync_sales_order_reservations(db: Session, sales_order: SalesOrder) -> None:
    if not should_reserve_inventory_for_order_status(sales_order.status):
        sync_reservations_for_source(
            db,
            source_type=SOURCE_SALES_ORDER,
            source_id=sales_order.id,
            item_qty_map={},
        )
        return

    item_qty_map: dict[int, Decimal] = {}
    for line in sales_order.lines:
        if not line.item_id:
            continue
        item_qty_map[line.item_id] = item_qty_map.get(line.item_id, Decimal("0")) + _to_decimal(line.qty)
    sync_reservations_for_source(
        db,
        source_type=SOURCE_SALES_ORDER,
        source_id=sales_order.id,
        item_qty_map=item_qty_map,
    )


def get_allowed_sales_order_status_transitions(sales_order: SalesOrder) -> list[str]:
    status = sales_order.status
    if status in ORDER_TERMINAL_STATUSES:
        return []
    if status == "DRAFT":
        return ["CONFIRMED", "CLOSED"]
    if status == "CONFIRMED":
        return ["ALLOCATED", "INVOICED", "CLOSED"]
    if status == "ALLOCATED":
        return ["INVOICED", "CLOSED"]
    return []


def _ensure_customer_for_order(db: Session, sales_order: SalesOrder) -> Customer:
    account = sales_order.account or db.query(SalesAccount).filter(SalesAccount.id == sales_order.account_id).first()
    customer = account.customer if account and account.customer_id else None
    if customer:
        return customer

    customer = Customer(
        name=account.name if account else f"Customer for {sales_order.order_number}",
        phone=account.phone if account else None,
        billing_address=account.billing_address if account else None,
        shipping_address=account.shipping_address if account else sales_order.shipping_address,
        is_active=True,
    )
    db.add(customer)
    db.flush()
    if account:
        account.customer_id = customer.id
    return customer


def _default_supplier_cost(db: Session, item_id: int | None) -> Decimal | None:
    if not item_id:
        return None
    supplier_link = get_supplier_link(db, item_id, None)
    if supplier_link:
        return _to_decimal(supplier_link.landed_cost)
    inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inventory and inventory.landed_unit_cost is not None:
        return _to_decimal(inventory.landed_unit_cost)
    return None


def _build_default_invoice_payload(sales_order: SalesOrder) -> dict[str, Any]:
    return {
        "issue_date": date.today(),
        "due_date": date.today() + timedelta(days=30),
        "notes": f"Generated from {sales_order.order_number}",
        "terms": "Net 30",
        "markup_percent": Decimal("20.00"),
        "line_selections": [
            {
                "sales_order_line_id": line.id,
                "supplier_id": None,
                "unit_cost": None,
                "unit_price": _to_decimal(line.unit_price),
                "discount": ZERO,
                "tax_rate": Decimal("0.00"),
            }
            for line in sales_order.lines
        ],
    }


def generate_invoice_from_sales_order(db: Session, sales_order: SalesOrder, payload: dict[str, Any] | None = None) -> Invoice:
    if sales_order.status not in {"CONFIRMED", "ALLOCATED"}:
        raise ValueError("Invoice generation is only allowed when the sales order is CONFIRMED or ALLOCATED.")
    if sales_order.invoice_id:
        existing = db.query(Invoice).filter(Invoice.id == sales_order.invoice_id).first()
        if existing:
            raise ValueError(f"An invoice ({existing.invoice_number}) already exists for this sales order.")

    customer = _ensure_customer_for_order(db, sales_order)
    default_payload = _build_default_invoice_payload(sales_order)
    payload = {**default_payload, **(payload or {})}
    if not payload.get("line_selections"):
        payload["line_selections"] = default_payload["line_selections"]
    line_map = {line.id: line for line in sales_order.lines}
    markup = _to_decimal(payload.get("markup_percent") or 0) / Decimal("100")

    line_items: list[dict[str, Any]] = []
    for selection in payload.get("line_selections", []):
        order_line = line_map.get(selection["sales_order_line_id"])
        if not order_line:
            raise ValueError(f"Sales order line {selection['sales_order_line_id']} not found.")

        supplier_id = selection.get("supplier_id")
        unit_cost = selection.get("unit_cost")
        if unit_cost is None and supplier_id:
            supplier_link = get_supplier_link(db, order_line.item_id, supplier_id)
            if supplier_link:
                unit_cost = supplier_link.landed_cost
        if unit_cost is None:
            unit_cost = _default_supplier_cost(db, order_line.item_id)

        unit_price = selection.get("unit_price")
        if unit_price is None:
            if unit_cost is not None:
                unit_price = _to_decimal(unit_cost) * (Decimal("1") + markup)
            else:
                unit_price = _to_decimal(order_line.unit_price)

        line_items.append(
            {
                "item_id": order_line.item_id,
                "description": order_line.item.name if order_line.item else f"Order line {order_line.id}",
                "quantity": _to_decimal(order_line.qty),
                "unit_price": _to_decimal(unit_price),
                "unit_cost": _to_decimal(unit_cost) if unit_cost is not None else None,
                "landed_unit_cost": _to_decimal(unit_cost) if unit_cost is not None else ZERO,
                "supplier_id": supplier_id,
                "discount": _to_decimal(selection.get("discount") or 0),
                "tax_rate": _to_decimal(selection.get("tax_rate") or 0),
            }
        )

    release_reservations(db, source_type=SOURCE_SALES_ORDER, source_id=sales_order.id)
    invoice = create_invoice(
        db,
        {
            "customer_id": customer.id,
            "issue_date": payload["issue_date"],
            "due_date": payload["due_date"],
            "notes": payload.get("notes") or f"Generated from {sales_order.order_number}",
            "terms": payload.get("terms"),
            "line_items": line_items,
        },
        reserve_stock=True,
    )
    sales_order.invoice_id = invoice.id
    sales_order.status = "INVOICED"
    db.add(
        SalesActivity(
            entity_type="order",
            entity_id=sales_order.id,
            type="status_change",
            subject=f"Invoice {invoice.invoice_number} generated from order",
        )
    )
    return invoice


def _status_event_map(db: Session, sales_order_id: int) -> dict[str, datetime]:
    activities = (
        db.query(SalesActivity)
        .filter(SalesActivity.entity_type == "order", SalesActivity.entity_id == sales_order_id)
        .order_by(SalesActivity.created_at.asc())
        .all()
    )
    events: dict[str, datetime] = {"DRAFT": activities[0].created_at if activities else None}
    for activity in activities:
        subject = (activity.subject or "").upper()
        for status in ORDER_EXECUTION_FLOW:
            if status in subject and status not in events:
                events[status] = activity.created_at
    return {status: when for status, when in events.items() if when is not None}


def _build_timeline(db: Session, sales_order: SalesOrder, invoice: Invoice | None) -> list[dict[str, Any]]:
    labels = {
        "DRAFT": "Order drafted",
        "CONFIRMED": "Confirmed (stock reserved)",
        "ALLOCATED": "Allocated for fulfillment",
        "INVOICED": "Invoice generated",
        "FULFILLED": "Shipment completed",
        "CLOSED": "Closed",
    }
    events = _status_event_map(db=db, sales_order_id=sales_order.id)
    current_rank = _status_rank(sales_order.status)
    timeline = []
    for index, status in enumerate(ORDER_EXECUTION_FLOW):
        occurred_at = events.get(status)
        if status == "DRAFT":
            occurred_at = occurred_at or sales_order.created_at
        elif status == "INVOICED" and invoice:
            occurred_at = occurred_at or invoice.created_at
        elif status == "FULFILLED" and invoice and invoice.shipped_at:
            occurred_at = invoice.shipped_at
        elif index <= current_rank:
            occurred_at = occurred_at or sales_order.updated_at
        timeline.append(
            {
                "status": status,
                "label": labels[status],
                "occurred_at": occurred_at,
                "completed": index <= current_rank,
                "current": status == sales_order.status,
            }
        )
    return timeline


def _enriched_order_lines(db: Session, sales_order: SalesOrder, invoice: Invoice | None) -> list[dict[str, Any]]:
    invoice_lines_by_item: dict[int, list[Any]] = {}
    if invoice:
        for invoice_line in invoice.lines:
            if invoice_line.item_id is None:
                continue
            invoice_lines_by_item.setdefault(invoice_line.item_id, []).append(invoice_line)

    lines: list[dict[str, Any]] = []
    for line in sales_order.lines:
        item = line.item
        matched_invoice_line = None
        if line.item_id in invoice_lines_by_item and invoice_lines_by_item[line.item_id]:
            matched_invoice_line = invoice_lines_by_item[line.item_id].pop(0)

        supplier_options = []
        if item:
            for supplier_link in item.supplier_items:
                supplier_options.append(
                    {
                        "supplier_id": supplier_link.supplier_id,
                        "supplier_name": supplier_link.supplier.name if supplier_link.supplier else "Unknown",
                        "supplier_cost": _to_decimal(supplier_link.supplier_cost),
                        "freight_cost": _to_decimal(supplier_link.freight_cost),
                        "tariff_cost": _to_decimal(supplier_link.tariff_cost),
                        "landed_cost": _to_decimal(supplier_link.landed_cost),
                        "is_preferred": bool(supplier_link.is_preferred),
                        "lead_time_days": supplier_link.lead_time_days,
                    }
                )
        inventory = db.query(Inventory).filter(Inventory.item_id == line.item_id).first() if line.item_id else None
        on_hand_qty = _to_decimal(inventory.quantity_on_hand) if inventory else ZERO
        reserved_qty = get_reserved_qty(db, line.item_id) if line.item_id else ZERO
        lines.append(
            {
                "id": line.id,
                "item_id": line.item_id,
                "item_name": item.name if item else f"Order line {line.id}",
                "quantity": _to_decimal(line.qty),
                "unit_price": _to_decimal(line.unit_price),
                "line_total": _to_decimal(line.line_total),
                "mwb_unit_price": None,
                "mwb_confidence": None,
                "mwb_confidence_score": None,
                "mwb_explanation": None,
                "mwb_computed_at": None,
                "invoice_unit_price": _to_decimal(matched_invoice_line.unit_price) if matched_invoice_line else None,
                "invoice_line_total": _to_decimal(matched_invoice_line.line_total) if matched_invoice_line else None,
                "on_hand_qty": on_hand_qty,
                "reserved_qty": reserved_qty,
                "available_qty": get_available_qty(db, line.item_id) if line.item_id else ZERO,
                "supplier_options": supplier_options,
            }
        )
    return lines


def _estimate_margin(lines: list[dict[str, Any]]) -> tuple[Decimal | None, Decimal | None]:
    total_revenue = sum((_to_decimal(line.get("line_total")) for line in lines), ZERO)
    total_cost = ZERO
    for line in lines:
        supplier_options = line.get("supplier_options") or []
        preferred = next((option for option in supplier_options if option.get("is_preferred")), None)
        unit_cost = _to_decimal(preferred.get("landed_cost")) if preferred else ZERO
        total_cost += unit_cost * _to_decimal(line.get("quantity"))
    if total_revenue <= 0:
        return None, None
    margin_amount = total_revenue - total_cost
    margin_percent = (margin_amount / total_revenue) * Decimal("100")
    return margin_percent.quantize(Decimal("0.01")), margin_amount.quantize(Decimal("0.01"))


def get_sales_order_360(db: Session, order_id: int) -> dict[str, Any] | None:
    sales_order = (
        db.query(SalesOrder)
        .options(
            joinedload(SalesOrder.account).joinedload(SalesAccount.customer),
            selectinload(SalesOrder.lines)
            .selectinload(SalesOrderLine.item)
            .selectinload(Item.supplier_items),
            joinedload(SalesOrder.invoice).selectinload(Invoice.lines),
        )
        .filter(SalesOrder.id == order_id)
        .first()
    )
    if not sales_order:
        return None

    invoice = sales_order.invoice or (db.query(Invoice).filter(Invoice.id == sales_order.invoice_id).first() if sales_order.invoice_id else None)
    lines = _enriched_order_lines(db, sales_order, invoice)
    margin_percent, margin_amount = _estimate_margin(lines)
    customer = sales_order.account.customer if sales_order.account else None
    days_open = (date.today() - sales_order.created_at.date()).days
    fulfillment_days_remaining = (sales_order.requested_ship_date - date.today()).days if sales_order.requested_ship_date else None
    recent_orders = (
        db.query(SalesOrder)
        .filter(
            SalesOrder.account_id == sales_order.account_id,
            SalesOrder.id != sales_order.id,
        )
        .order_by(SalesOrder.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "id": sales_order.id,
        "order_number": sales_order.order_number,
        "account_id": sales_order.account_id,
        "account_name": sales_order.account.name if sales_order.account else None,
        "customer_id": customer.id if customer else None,
        "customer_name": customer.name if customer else None,
        "opportunity_id": sales_order.opportunity_id,
        "quote_id": sales_order.quote_id,
        "invoice_id": sales_order.invoice_id,
        "invoice_number": invoice.invoice_number if invoice else None,
        "status": sales_order.status,
        "order_date": sales_order.order_date,
        "requested_ship_date": sales_order.requested_ship_date,
        "fulfillment_type": sales_order.fulfillment_type,
        "shipping_address": sales_order.shipping_address,
        "subtotal": _to_decimal(sales_order.subtotal),
        "tax_total": _to_decimal(sales_order.tax_total),
        "total": _to_decimal(sales_order.total),
        "created_at": sales_order.created_at,
        "updated_at": sales_order.updated_at,
        "lines": lines,
        "linked_invoice_id": sales_order.invoice_id,
        "linked_invoice_number": invoice.invoice_number if invoice else None,
        "linked_invoice_status": invoice.status if invoice else None,
        "linked_invoice_shipped_at": invoice.shipped_at if invoice else None,
        "allowed_transitions": get_allowed_sales_order_status_transitions(sales_order),
        "timeline": _build_timeline(db, sales_order, invoice),
        "kpis": {
            "total_amount": _to_decimal(sales_order.total),
            "line_count": len(lines),
            "avg_line_value": (_to_decimal(sales_order.total) / Decimal(len(lines))).quantize(Decimal("0.01")) if lines else None,
            "estimated_margin_percent": float(margin_percent) if margin_percent is not None else None,
            "estimated_margin_amount": margin_amount,
            "days_open": days_open,
            "fulfillment_days_remaining": fulfillment_days_remaining,
        },
        "customer_recent_orders": [
            {
                "id": order.id,
                "request_number": order.order_number,
                "status": order.status,
                "total_amount": _to_decimal(order.total),
                "created_at": order.created_at,
            }
            for order in recent_orders
        ],
    }


def mark_sales_order_fulfilled_from_invoice(db: Session, invoice: Invoice) -> None:
    sales_order = db.query(SalesOrder).filter(SalesOrder.invoice_id == invoice.id).first()
    if not sales_order:
        return
    if sales_order.status not in {"FULFILLED", "CLOSED"}:
        sales_order.status = "FULFILLED"
        db.add(
            SalesActivity(
                entity_type="order",
                entity_id=sales_order.id,
                type="status_change",
                subject="Order fulfilled via invoice shipment",
            )
        )


def close_sales_order_if_paid(db: Session, invoice_id: int) -> bool:
    sales_order = db.query(SalesOrder).filter(SalesOrder.invoice_id == invoice_id).first()
    if not sales_order:
        return False
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice or invoice.status != "PAID":
        return False
    if sales_order.status != "CLOSED":
        sales_order.status = "CLOSED"
        db.add(
            SalesActivity(
                entity_type="order",
                entity_id=sales_order.id,
                type="status_change",
                subject="Order closed after invoice payment",
            )
        )
    return True


def reopen_sales_order_after_invoice_void(db: Session, invoice: Invoice) -> bool:
    sales_order = db.query(SalesOrder).filter(SalesOrder.invoice_id == invoice.id).first()
    if not sales_order:
        return False
    sales_order.invoice_id = None
    sales_order.status = "CONFIRMED"
    sync_sales_order_reservations(db, sales_order)
    db.add(
        SalesActivity(
            entity_type="order",
            entity_id=sales_order.id,
            type="status_change",
            subject="Invoice voided; order reopened to confirmed",
        )
    )
    return True



