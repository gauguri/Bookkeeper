from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import PurchaseOrder
from app.purchasing import schemas
from app.purchasing.service import create_purchase_order, receive_purchase_order, update_purchase_order


router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


@router.get("", response_model=List[schemas.PurchaseOrderResponse])
def list_purchase_orders(db: Session = Depends(get_db)):
    return (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )


@router.post("", response_model=schemas.PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_order_endpoint(payload: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
    try:
        po = create_purchase_order(db, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(po)
    return po


@router.get("/{purchase_order_id}", response_model=schemas.PurchaseOrderResponse)
def get_purchase_order(purchase_order_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    return po


@router.patch("/{purchase_order_id}", response_model=schemas.PurchaseOrderResponse)
def update_purchase_order_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
):
    po = db.query(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).filter(PurchaseOrder.id == purchase_order_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    update_purchase_order(db, po, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(po)
    return po


@router.post("/{purchase_order_id}/receive", response_model=schemas.PurchaseOrderResponse)
def receive_purchase_order_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderReceivePayload,
    db: Session = Depends(get_db),
):
    po = db.query(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).filter(PurchaseOrder.id == purchase_order_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    try:
        receive_purchase_order(db, po, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(po)
    return po
