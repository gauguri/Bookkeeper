from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.inventory.service import receive_inventory
from app.models import Item, PurchaseOrder, PurchaseOrderLine, SupplierItem


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
        qty_ordered=payload["qty_ordered"],
        unit_cost=unit_cost,
        freight_cost=freight_cost,
        tariff_cost=tariff_cost,
        landed_cost=landed_cost,
    )


def create_purchase_order(db: Session, payload: dict) -> PurchaseOrder:
    lines_payload = payload.pop("lines")
    po = PurchaseOrder(**payload)
    po.lines = [_build_po_line(db, po.supplier_id, line) for line in lines_payload]
    db.add(po)
    return po


def update_purchase_order(db: Session, po: PurchaseOrder, payload: dict) -> PurchaseOrder:
    for key, value in payload.items():
        setattr(po, key, value)
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
