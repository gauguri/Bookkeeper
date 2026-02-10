from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import InventoryTransaction, Item


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
