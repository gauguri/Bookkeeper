from datetime import datetime
from decimal import Decimal
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryMovement,
    InventoryReservation,
    InventoryTransaction,
    Item,
    PurchaseOrder,
)


logger = logging.getLogger(__name__)

SOURCE_SALES_REQUEST = "sales_request"
SOURCE_INVOICE = "invoice"


def get_reserved_qty(db: Session, item_id: int) -> Decimal:
    reserved = (
        db.query(func.coalesce(func.sum(InventoryReservation.qty_reserved), 0))
        .filter(InventoryReservation.item_id == item_id, InventoryReservation.released_at.is_(None))
        .scalar()
    )
    return Decimal(reserved or 0)


def get_reserved_qty_map(db: Session, item_ids: list[int]) -> dict[int, Decimal]:
    if not item_ids:
        return {}
    rows = (
        db.query(InventoryReservation.item_id, func.coalesce(func.sum(InventoryReservation.qty_reserved), 0))
        .filter(InventoryReservation.item_id.in_(item_ids), InventoryReservation.released_at.is_(None))
        .group_by(InventoryReservation.item_id)
        .all()
    )
    reserved_by_id = {item_id: Decimal(total or 0) for item_id, total in rows}
    for item_id in item_ids:
        reserved_by_id.setdefault(item_id, Decimal("0"))
    return reserved_by_id


def get_source_reserved_qty_map(db: Session, *, source_type: str, source_id: int) -> dict[int, Decimal]:
    rows = (
        db.query(InventoryReservation.item_id, func.coalesce(func.sum(InventoryReservation.qty_reserved), 0))
        .filter(
            InventoryReservation.source_type == source_type,
            InventoryReservation.source_id == source_id,
            InventoryReservation.released_at.is_(None),
        )
        .group_by(InventoryReservation.item_id)
        .all()
    )
    return {item_id: Decimal(total or 0) for item_id, total in rows}


def get_available_qty(db: Session, item_id: int, company_id: int | None = None) -> Decimal:
    """Single source of truth for available inventory used by sales requests."""
    scoped_company_id = company_id  # inventory records are currently global in this app.

    inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    on_hand = Decimal(inventory.quantity_on_hand or 0) if inventory else Decimal("0")
    reserved = get_reserved_qty(db, item_id)
    available_qty = on_hand - reserved
    logger.debug(
        "Inventory availability lookup: item_id=%s company_id=%s on_hand=%s reserved=%s available_qty=%s",
        item_id,
        scoped_company_id,
        on_hand,
        reserved,
        available_qty,
    )
    return available_qty


def get_available_qty_map(db: Session, item_ids: list[int], company_id: int | None = None) -> dict[int, Decimal]:
    scoped_company_id = company_id  # inventory records are currently global in this app.
    inventory_rows = db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
    on_hand_by_id = {row.item_id: Decimal(row.quantity_on_hand or 0) for row in inventory_rows}
    reserved_by_id = get_reserved_qty_map(db, item_ids)

    available_by_id: dict[int, Decimal] = {}
    for item_id in item_ids:
        available_by_id[item_id] = on_hand_by_id.get(item_id, Decimal("0")) - reserved_by_id.get(item_id, Decimal("0"))

    logger.debug(
        "Bulk inventory availability lookup: item_ids=%s company_id=%s available_by_id=%s",
        item_ids,
        scoped_company_id,
        available_by_id,
    )
    return available_by_id


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


def create_inventory_movement(
    db: Session,
    *,
    item_id: int,
    qty_delta: Decimal,
    reason: str,
    ref_type: str,
    ref_id: int,
) -> InventoryMovement:
    movement = InventoryMovement(
        item_id=item_id,
        qty_delta=qty_delta,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        created_at=datetime.utcnow(),
    )
    db.add(movement)
    return movement


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


def reserve_inventory_record(
    db: Session,
    *,
    item_id: int,
    qty_reserved: Decimal,
    source_type: str,
    source_id: int,
) -> InventoryReservation:
    sales_request_id = source_id if source_type == SOURCE_SALES_REQUEST else None
    invoice_id = source_id if source_type == SOURCE_INVOICE else None
    reservation = InventoryReservation(
        item_id=item_id,
        source_type=source_type,
        source_id=source_id,
        sales_request_id=sales_request_id,
        invoice_id=invoice_id,
        qty_reserved=qty_reserved,
        created_at=datetime.utcnow(),
    )
    db.add(reservation)
    return reservation


def release_reservations(
    db: Session,
    *,
    source_type: str | None = None,
    source_id: int | None = None,
    sales_request_id: int | None = None,
    invoice_id: int | None = None,
) -> list[InventoryReservation]:
    query = db.query(InventoryReservation).filter(InventoryReservation.released_at.is_(None))
    if source_type is not None and source_id is not None:
        query = query.filter(
            InventoryReservation.source_type == source_type,
            InventoryReservation.source_id == source_id,
        )
    if sales_request_id is not None:
        query = query.filter(InventoryReservation.sales_request_id == sales_request_id)
    if invoice_id is not None:
        query = query.filter(InventoryReservation.invoice_id == invoice_id)

    rows = query.with_for_update().all()
    released_at = datetime.utcnow()
    for row in rows:
        row.released_at = released_at
    return rows


def sync_reservations_for_source(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    item_qty_map: dict[int, Decimal],
) -> list[InventoryReservation]:
    active = (
        db.query(InventoryReservation)
        .filter(
            InventoryReservation.source_type == source_type,
            InventoryReservation.source_id == source_id,
            InventoryReservation.released_at.is_(None),
        )
        .with_for_update()
        .all()
    )
    active_by_item = {row.item_id: row for row in active}
    released_at = datetime.utcnow()

    for item_id, reservation in active_by_item.items():
        target = Decimal(item_qty_map.get(item_id, Decimal("0")) or 0)
        if target <= 0:
            reservation.released_at = released_at
        else:
            reservation.qty_reserved = target

    for item_id, qty in item_qty_map.items():
        qty_decimal = Decimal(qty or 0)
        if qty_decimal <= 0 or item_id in active_by_item:
            continue
        reserve_inventory_record(
            db,
            item_id=item_id,
            qty_reserved=qty_decimal,
            source_type=source_type,
            source_id=source_id,
        )
    return active


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
