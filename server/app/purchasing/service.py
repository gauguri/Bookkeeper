from datetime import date, datetime
from decimal import Decimal
import json

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.inventory.service import land_inventory_from_purchase_order, receive_inventory
from app.models import Item, PurchaseOrder, PurchaseOrderLine, PurchaseOrderSendLog, Supplier, SupplierItem


def _next_po_number(db: Session) -> str:
    count = db.query(func.count(PurchaseOrder.id)).scalar() or 0
    return f"PO-{count + 1:05d}"


def po_items_subtotal(po: PurchaseOrder) -> Decimal:
    return sum((Decimal(line.qty_ordered or 0) * Decimal(line.unit_cost or 0) for line in po.lines), Decimal("0"))


def po_extra_costs_total(po: PurchaseOrder) -> Decimal:
    return Decimal(po.freight_cost or 0) + Decimal(po.tariff_cost or 0)


def po_total(po: PurchaseOrder) -> Decimal:
    return po_items_subtotal(po) + po_extra_costs_total(po)


def _build_po_line(db: Session, supplier_id: int, payload: dict) -> PurchaseOrderLine:
    item = db.query(Item).filter(Item.id == payload["item_id"]).first()
    if not item:
        raise ValueError("Item not found.")
    link = (
        db.query(SupplierItem)
        .filter(SupplierItem.supplier_id == supplier_id, SupplierItem.item_id == item.id)
        .first()
    )
    if not link and payload.get("unit_cost") is None:
        raise ValueError("Supplier is not linked to item.")
    unit_cost = Decimal(payload.get("unit_cost") or (link.supplier_cost if link else 0))
    freight_cost = Decimal(payload.get("freight_cost") or (link.freight_cost if link else 0))
    tariff_cost = Decimal(payload.get("tariff_cost") or (link.tariff_cost if link else 0))
    landed_cost = unit_cost + freight_cost + tariff_cost
    return PurchaseOrderLine(
        item_id=item.id,
        qty_ordered=payload["quantity"],
        unit_cost=unit_cost,
        freight_cost=freight_cost,
        tariff_cost=tariff_cost,
        landed_cost=landed_cost,
    )


def create_purchase_order(db: Session, payload: dict) -> PurchaseOrder:
    lines_payload = payload.pop("lines")
    payload.setdefault("freight_cost", Decimal("0"))
    payload.setdefault("tariff_cost", Decimal("0"))
    if not payload.get("po_number"):
        payload["po_number"] = _next_po_number(db)
    po = PurchaseOrder(**payload)
    po.lines = [_build_po_line(db, po.supplier_id, line) for line in lines_payload]
    db.add(po)
    return po


def update_purchase_order(db: Session, po: PurchaseOrder, payload: dict) -> PurchaseOrder:
    if po.status not in {"DRAFT", "SENT"}:
        raise ValueError("Only DRAFT or SENT purchase orders can be edited.")

    lines_payload = payload.pop("lines", None)
    for key, value in payload.items():
        setattr(po, key, value)

    if lines_payload is not None:
        po.lines.clear()
        db.flush()
        po.lines = [_build_po_line(db, po.supplier_id, line) for line in lines_payload]
    return po


def send_purchase_order(db: Session, po: PurchaseOrder) -> PurchaseOrder:
    if not po.lines:
        raise ValueError("Purchase order must include at least one line item.")
    if any(Decimal(line.qty_ordered or 0) <= 0 for line in po.lines):
        raise ValueError("All line item quantities must be greater than zero.")

    supplier = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    if not supplier:
        raise ValueError("Supplier not found.")
    if not (supplier.email or supplier.phone):
        raise ValueError("Supplier must have contact info before sending.")

    log_payload = {
        "po_number": po.po_number,
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "email": supplier.email,
            "phone": supplier.phone,
        },
        "line_items": [
            {
                "item_id": line.item_id,
                "quantity": str(line.qty_ordered),
                "unit_cost": str(line.unit_cost),
            }
            for line in po.lines
        ],
        "items_subtotal": str(po_items_subtotal(po)),
        "extra_costs_total": str(po_extra_costs_total(po)),
        "total": str(po_total(po)),
    }
    db.add(
        PurchaseOrderSendLog(
            purchase_order_id=po.id,
            supplier_id=supplier.id,
            payload=json.dumps(log_payload),
        )
    )

    if not po.inventory_landed:
        land_inventory_from_purchase_order(db, po)
        po.inventory_landed = True
        po.landed_at = datetime.utcnow()

    po.status = "SENT"
    po.sent_at = datetime.utcnow()
    return po


def receive_purchase_order(db: Session, po: PurchaseOrder, payload: dict) -> PurchaseOrder:
    for line_payload in payload["lines"]:
        line = next((line for line in po.lines if line.id == line_payload["line_id"]), None)
        if not line:
            raise ValueError("Purchase order line not found.")
        qty_delta = Decimal(line_payload["qty_received"])
        line.qty_received = Decimal(line.qty_received or 0) + qty_delta
        item = db.query(Item).filter(Item.id == line.item_id).with_for_update().first()
        if item:
            receive_inventory(
                db,
                item=item,
                qty_delta=qty_delta,
                reference_type="PURCHASE_ORDER",
                reference_id=po.id,
            )
    if all(line.qty_received >= line.qty_ordered for line in po.lines):
        po.status = "RECEIVED"
    elif any(line.qty_received > 0 for line in po.lines):
        po.status = "PARTIALLY_RECEIVED"
    else:
        po.status = po.status or "DRAFT"
    if not po.order_date:
        po.order_date = date.today()
    return po
