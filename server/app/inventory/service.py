from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Inventory, InventoryTransaction, Item, PurchaseOrder


def create_inventory_transaction(
    db: Session,
    *,
    item: Item,
    txn_type: str,
    qty_delta: Decimal,
    reference_type: str | None = None,
    reference_id: int | None = None,
    notes: str | None = None,
) -> InventoryTransaction:
    txn = InventoryTransaction(
        item_id=item.id,
        txn_type=txn_type,
        qty_delta=qty_delta,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
    )
    db.add(txn)
    return txn


def adjust_inventory(
    db: Session,
    *,
    item: Item,
    qty_delta: Decimal,
    reason: str | None = None,
) -> InventoryTransaction:
    item.on_hand_qty = (Decimal(item.on_hand_qty or 0) + qty_delta)
    txn = create_inventory_transaction(
        db,
        item=item,
        txn_type="ADJUSTMENT",
        qty_delta=qty_delta,
        reference_type="ADJUSTMENT",
        reference_id=None,
        notes=reason,
    )
    return txn


def reserve_inventory(
    db: Session,
    *,
    item: Item,
    qty_delta: Decimal,
    reference_type: str,
    reference_id: int | None,
) -> InventoryTransaction:
    item.reserved_qty = Decimal(item.reserved_qty or 0) + qty_delta
    return create_inventory_transaction(
        db,
        item=item,
        txn_type="RESERVATION" if qty_delta >= 0 else "RELEASE",
        qty_delta=qty_delta,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def receive_inventory(
    db: Session,
    *,
    item: Item,
    qty_delta: Decimal,
    reference_type: str,
    reference_id: int | None,
) -> InventoryTransaction:
    item.on_hand_qty = Decimal(item.on_hand_qty or 0) + qty_delta
    return create_inventory_transaction(
        db,
        item=item,
        txn_type="RECEIPT",
        qty_delta=qty_delta,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def _get_or_create_inventory(db: Session, item_id: int) -> Inventory:
    inventory = db.query(Inventory).filter(Inventory.item_id == item_id).with_for_update().first()
    if inventory:
        return inventory
    inventory = Inventory(item_id=item_id, quantity_on_hand=Decimal("0"), landed_unit_cost=Decimal("0"))
    db.add(inventory)
    db.flush()
    return inventory


def land_inventory_from_purchase_order(db: Session, po: PurchaseOrder) -> None:
    total_units = sum((Decimal(line.qty_ordered or 0) for line in po.lines), Decimal("0"))
    per_unit_extra = Decimal("0")
    if total_units > 0:
        per_unit_extra = (Decimal(po.freight_cost or 0) + Decimal(po.tariff_cost or 0)) / total_units

    for line in po.lines:
        incoming_qty = Decimal(line.qty_ordered or 0)
        incoming_landed_unit_cost = Decimal(line.unit_cost or 0) + per_unit_extra

        inventory = _get_or_create_inventory(db, line.item_id)
        existing_qty = Decimal(inventory.quantity_on_hand or 0)
        existing_landed_cost = Decimal(inventory.landed_unit_cost or 0)
        existing_value = existing_qty * existing_landed_cost
        incoming_value = incoming_qty * incoming_landed_unit_cost
        new_qty = existing_qty + incoming_qty

        if new_qty > 0:
            inventory.landed_unit_cost = (existing_value + incoming_value) / new_qty
        inventory.quantity_on_hand = new_qty
        inventory.last_updated_at = datetime.utcnow()
