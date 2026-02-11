from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.inventory import schemas
from app.inventory.service import adjust_inventory
from app.models import Inventory, Item


router = APIRouter(prefix="/api/inventory", tags=["inventory"])


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
            total_value=Decimal(record.quantity_on_hand or 0) * Decimal(record.landed_unit_cost or 0),
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
        total_value=Decimal(record.quantity_on_hand or 0) * Decimal(record.landed_unit_cost or 0),
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
        total_value=Decimal(record.quantity_on_hand or 0) * Decimal(record.landed_unit_cost or 0),
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
    return [
        schemas.InventoryItemResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            on_hand_qty=item.on_hand_qty,
            reserved_qty=item.reserved_qty,
            available_qty=item.available_qty,
            reorder_point=item.reorder_point,
        )
        for item in items
    ]


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
