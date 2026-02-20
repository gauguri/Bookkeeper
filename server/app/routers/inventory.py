from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.module_keys import ModuleKey
from app.db import get_db
from app.inventory import schemas
from app.inventory.service import adjust_inventory, get_available_qty, get_available_qty_map, get_reserved_qty_map
from app.models import Company, Inventory, InventoryReservation, Item, SalesRequest


router = APIRouter(prefix="/api/inventory", tags=["inventory"], dependencies=[Depends(require_module(ModuleKey.INVENTORY.value))])


def _get_default_company_id(db: Session) -> int:
    return db.query(Company.id).order_by(Company.id.asc()).scalar() or 1


@router.get("", response_model=List[schemas.InventoryRecordResponse])
def list_inventory_records(db: Session = Depends(get_db)):
    records = db.query(Inventory).options(selectinload(Inventory.item)).order_by(Inventory.last_updated_at.desc()).all()
    return [
        schemas.InventoryRecordResponse(
            id=record.id,
            item_id=record.item_id,
            item_name=record.item.name if record.item else f"Item #{record.item_id}",
            item_sku=record.item.sku if record.item else None,
            quantity_on_hand=record.quantity_on_hand,
            landed_unit_cost=record.landed_unit_cost,
            total_value=record.total_value,
            last_updated_at=record.last_updated_at,
        )
        for record in records
    ]


@router.post("", response_model=schemas.InventoryRecordResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_record(payload: schemas.InventoryRecordCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    record = Inventory(
        item_id=payload.item_id,
        quantity_on_hand=payload.quantity_on_hand,
        landed_unit_cost=payload.landed_unit_cost,
        total_value=Decimal(payload.quantity_on_hand) * Decimal(payload.landed_unit_cost),
        last_updated_at=datetime.utcnow(),
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Inventory record already exists for this item.")

    db.refresh(record)
    return schemas.InventoryRecordResponse(
        id=record.id,
        item_id=record.item_id,
        item_name=item.name,
        item_sku=item.sku,
        quantity_on_hand=record.quantity_on_hand,
        landed_unit_cost=record.landed_unit_cost,
        total_value=record.total_value,
        last_updated_at=record.last_updated_at,
    )


@router.put("/{inventory_id}", response_model=schemas.InventoryRecordResponse)
@router.patch("/{inventory_id}", response_model=schemas.InventoryRecordResponse)
def update_inventory_record(inventory_id: int, payload: schemas.InventoryRecordUpdate, db: Session = Depends(get_db)):
    record = db.query(Inventory).options(selectinload(Inventory.item)).filter(Inventory.id == inventory_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Inventory record not found.")

    record.quantity_on_hand = payload.quantity_on_hand
    record.landed_unit_cost = payload.landed_unit_cost
    record.total_value = Decimal(payload.quantity_on_hand) * Decimal(payload.landed_unit_cost)
    record.last_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(record)

    return schemas.InventoryRecordResponse(
        id=record.id,
        item_id=record.item_id,
        item_name=record.item.name if record.item else f"Item #{record.item_id}",
        item_sku=record.item.sku if record.item else None,
        quantity_on_hand=record.quantity_on_hand,
        landed_unit_cost=record.landed_unit_cost,
        total_value=record.total_value,
        last_updated_at=record.last_updated_at,
    )


@router.delete("/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_record(inventory_id: int, db: Session = Depends(get_db)):
    record = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Inventory record not found.")
    db.delete(record)
    db.commit()


@router.get("/items", response_model=List[schemas.InventoryItemResponse])
def list_inventory_items(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Item)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(Item.name.ilike(like))
    items = query.order_by(Item.name).all()
    item_ids = [item.id for item in items]
    on_hand_by_id = {
        row.item_id: Decimal(row.quantity_on_hand or 0)
        for row in db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
    }
    reserved_by_id = get_reserved_qty_map(db, item_ids)
    return [
        schemas.InventoryItemResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            on_hand_qty=on_hand_by_id.get(item.id, Decimal("0")),
            reserved_qty=reserved_by_id.get(item.id, Decimal("0")),
            available_qty=on_hand_by_id.get(item.id, Decimal("0")) - reserved_by_id.get(item.id, Decimal("0")),
            reorder_point=item.reorder_point,
        )
        for item in items
    ]


@router.get("/available", response_model=schemas.InventoryAvailabilityResponse | schemas.InventoryAvailabilityBulkResponse)
def get_available_inventory(
    item_id: Optional[int] = None,
    item_ids: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if item_id is None and not item_ids:
        raise HTTPException(status_code=400, detail="Provide item_id or item_ids.")

    if item_id is not None and item_ids:
        raise HTTPException(status_code=400, detail="Use either item_id or item_ids, not both.")

    if item_id is not None:
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found.")
        company_id = _get_default_company_id(db)
        return schemas.InventoryAvailabilityResponse(
            item_id=item.id,
            available_qty=get_available_qty(db, item.id, company_id=company_id),
        )

    parsed_ids = []
    for raw_value in item_ids.split(","):
        raw_value = raw_value.strip()
        if not raw_value:
            continue
        try:
            parsed_ids.append(int(raw_value))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid item id: {raw_value}")

    if not parsed_ids:
        raise HTTPException(status_code=400, detail="No valid item ids supplied.")

    items = db.query(Item.id).filter(Item.id.in_(parsed_ids)).all()
    found_item_ids = {item_id for (item_id,) in items}
    company_id = _get_default_company_id(db)
    available_by_id = get_available_qty_map(db, parsed_ids, company_id=company_id)

    missing = [requested_id for requested_id in parsed_ids if requested_id not in found_item_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Items not found: {', '.join(str(v) for v in missing)}")

    return schemas.InventoryAvailabilityBulkResponse(
        items=[schemas.InventoryAvailabilityResponse(item_id=entry_id, available_qty=available_by_id[entry_id]) for entry_id in parsed_ids]
    )


@router.post("/adjustments", response_model=schemas.InventoryAdjustmentResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_adjustment(payload: schemas.InventoryAdjustmentCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    qty_delta = Decimal(payload.qty_delta)
    transaction = adjust_inventory(db, item=item, qty_delta=qty_delta, reason=payload.reason)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.get("/reservations/{item_id}", response_model=List[schemas.ReservationDetailResponse])
def list_item_reservations(item_id: int, db: Session = Depends(get_db)):
    """Return active reservations for an item, grouped by source."""
    rows = (
        db.query(
            InventoryReservation.source_type,
            InventoryReservation.source_id,
            InventoryReservation.qty_reserved,
            SalesRequest.request_number,
        )
        .outerjoin(
            SalesRequest,
            (InventoryReservation.source_type == "sales_request")
            & (InventoryReservation.source_id == SalesRequest.id),
        )
        .filter(
            InventoryReservation.item_id == item_id,
            InventoryReservation.released_at.is_(None),
        )
        .order_by(InventoryReservation.created_at.asc())
        .all()
    )

    results: list[schemas.ReservationDetailResponse] = []
    for source_type, source_id, qty, sr_number in rows:
        if source_type == "sales_request" and sr_number:
            label = sr_number
        else:
            label = f"{source_type or 'unknown'} #{source_id}"
        results.append(
            schemas.ReservationDetailResponse(
                source_type=source_type or "unknown",
                source_id=source_id or 0,
                source_label=label,
                qty_reserved=qty,
            )
        )
    return results
