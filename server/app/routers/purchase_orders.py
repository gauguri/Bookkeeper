from datetime import date
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.db import get_db
from app.models import Account, PurchaseOrder, PurchaseOrderLine
from app.purchasing import schemas
from app.purchasing.service import (
    create_purchase_order,
    po_extra_costs_total,
    po_items_subtotal,
    po_total,
    find_cash_account,
    find_inventory_account,
    post_purchase_order_receipt,
    receive_purchase_order,
    send_purchase_order,
    update_purchase_order,
)


router = APIRouter(
    prefix="/api/purchase-orders",
    tags=["purchase-orders"],
    dependencies=[Depends(require_module("PURCHASE_ORDERS"))],
)


DELETE_BLOCKED_DETAIL = (
    "Cannot delete purchase order because it has dependent records (inventory landed / send log). "
    "Use Cancel instead or remove dependencies."
)


def _to_detail_response(po: PurchaseOrder) -> schemas.PurchaseOrderResponse:
    return schemas.PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        order_date=po.order_date,
        expected_date=po.expected_date,
        notes=po.notes,
        freight_cost=po.freight_cost,
        tariff_cost=po.tariff_cost,
        status=po.status,
        items_subtotal=po_items_subtotal(po),
        extra_costs_total=po_extra_costs_total(po),
        total=po_total(po),
        created_at=po.created_at,
        updated_at=po.updated_at,
        sent_at=po.sent_at,
        posted_journal_entry_id=po.posted_journal_entry_id,
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
            items_subtotal=po_items_subtotal(po),
            extra_costs_total=po_extra_costs_total(po),
            freight_cost=po.freight_cost,
            tariff_cost=po.tariff_cost,
            total=po_total(po),
            posted_journal_entry_id=po.posted_journal_entry_id,
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


@router.delete("/{purchase_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase_order_endpoint(purchase_order_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    if po.status != "DRAFT" or po.inventory_landed:
        raise HTTPException(status_code=409, detail=DELETE_BLOCKED_DETAIL)

    try:
        po.lines.clear()
        db.flush()
        db.delete(po)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=DELETE_BLOCKED_DETAIL)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{purchase_order_id}/accounting-preview", response_model=schemas.PurchaseOrderAccountingPreview)
def get_purchase_order_accounting_preview(purchase_order_id: int, db: Session = Depends(get_db)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines), selectinload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == purchase_order_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found.")

    inventory_account = find_inventory_account(db)
    cash_account = find_cash_account(db)
    accounts = db.query(Account).filter(Account.is_active.is_(True)).order_by(Account.name.asc()).all()

    return schemas.PurchaseOrderAccountingPreview(
        purchase_order_id=po.id,
        po_number=po.po_number,
        supplier=po.supplier.name if po.supplier else f"Supplier #{po.supplier_id}",
        items_subtotal=po_items_subtotal(po),
        freight_cost=po.freight_cost,
        tariff_cost=po.tariff_cost,
        total=po_total(po),
        inventory_account_id=inventory_account.id if inventory_account else None,
        cash_account_id=cash_account.id if cash_account else None,
        accounts=[schemas.PurchaseOrderPreviewAccount(id=account.id, name=account.name, code=account.code) for account in accounts],
        posted_journal_entry_id=po.posted_journal_entry_id,
    )


@router.post("/{purchase_order_id}/post-receipt", response_model=schemas.PurchaseOrderResponse)
def post_purchase_order_receipt_endpoint(
    purchase_order_id: int,
    payload: schemas.PurchaseOrderPostReceiptPayload,
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
        post_purchase_order_receipt(
            db,
            po=po,
            entry_date=payload.date or date.today(),
            memo=payload.memo,
            inventory_account_id=payload.inventory_account_id,
            cash_account_id=payload.cash_account_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409 if "already posted" in str(exc) else 400, detail=str(exc))

    db.commit()
    db.refresh(po)
    return _to_detail_response(po)
