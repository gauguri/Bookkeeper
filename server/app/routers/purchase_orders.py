from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import PurchaseOrder, PurchaseOrderLine
from app.purchasing import schemas
from app.purchasing.service import create_purchase_order, po_total, receive_purchase_order, send_purchase_order, update_purchase_order


router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


def _to_detail_response(po: PurchaseOrder) -> schemas.PurchaseOrderResponse:
    return schemas.PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        order_date=po.order_date,
        expected_date=po.expected_date,
        notes=po.notes,
        status=po.status,
        total=po_total(po),
        created_at=po.created_at,
        updated_at=po.updated_at,
        sent_at=po.sent_at,
        lines=[
            schemas.PurchaseOrderLineResponse(
                id=line.id,
                item_id=line.item_id,
                item_name=line.item.name if line.item else f"Item #{line.item_id}",
                quantity=line.qty_ordered,
                unit_cost=line.unit_cost,
                freight_cost=line.freight_cost,
                tariff_cost=line.tariff_cost,
                landed_cost=line.landed_cost,
                qty_received=line.qty_received,
                line_total=Decimal(line.qty_ordered) * Decimal(line.unit_cost),
            )
            for line in po.lines
        ],
    )


@router.get("", response_model=List[schemas.PurchaseOrderListResponse])
def list_purchase_orders(db: Session = Depends(get_db)):
    pos = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines), selectinload(PurchaseOrder.supplier))
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )
    return [
        schemas.PurchaseOrderListResponse(
            id=po.id,
            po_number=po.po_number,
            supplier_name=po.supplier.name if po.supplier else f"Supplier #{po.supplier_id}",
            order_date=po.order_date,
            status=po.status,
            total=po_total(po),
        )
        for po in pos
    ]


@router.post("", response_model=schemas.PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_order_endpoint(payload: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
    try:
        po = create_purchase_order(db, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == po.id)
        .first()
    )
    return _to_detail_response(po)


@router.get("/{purchase_order_id}", response_model=schemas.PurchaseOrderResponse)
def get_purchase_order(purchase_order_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    return _to_detail_response(po)


@router.put("/{purchase_order_id}", response_model=schemas.PurchaseOrderResponse)
def update_purchase_order_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    try:
        update_purchase_order(db, po, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        if "DRAFT" in str(exc):
            raise HTTPException(status_code=409, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(po)
    return _to_detail_response(po)


@router.patch("/{purchase_order_id}", response_model=schemas.PurchaseOrderResponse)
def patch_purchase_order_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
):
    return update_purchase_order_endpoint(purchase_order_id, payload, db)


@router.post("/{purchase_order_id}/send", response_model=schemas.PurchaseOrderResponse)
def send_purchase_order_endpoint(purchase_order_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    try:
        send_purchase_order(db, po)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(po)
    return _to_detail_response(po)


@router.post("/{purchase_order_id}/receive", response_model=schemas.PurchaseOrderResponse)
def receive_purchase_order_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderReceivePayload,
    db: Session = Depends(get_db),
):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    try:
        receive_purchase_order(db, po, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(po)
    return _to_detail_response(po)
