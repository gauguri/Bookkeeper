from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.inventory import schemas
from app.inventory.service import adjust_inventory
from app.models import Item


router = APIRouter(prefix="/api/inventory", tags=["inventory"])


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
