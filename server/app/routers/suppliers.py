from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.db import get_db
from app.models import InvoiceLine, Item, PurchaseOrder, PurchaseOrderSendLog, Supplier, SupplierItem
from app.suppliers import schemas
from app.suppliers.service import get_supplier_link, set_preferred_supplier


router = APIRouter(prefix="/api", tags=["suppliers"], dependencies=[Depends(require_module("SUPPLIERS"))])


@router.get("/suppliers", response_model=List[schemas.SupplierResponse])
def list_suppliers(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Supplier)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(Supplier.name.ilike(like))
    return query.order_by(Supplier.name).all()


@router.post("/suppliers", response_model=schemas.SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def update_supplier(supplier_id: int, payload: schemas.SupplierUpdate, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    has_dependencies = (
        db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == supplier_id).first() is not None
        or db.query(InvoiceLine.id).filter(InvoiceLine.supplier_id == supplier_id).first() is not None
        or db.query(PurchaseOrderSendLog.id).filter(PurchaseOrderSendLog.supplier_id == supplier_id).first() is not None
    )
    if has_dependencies:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete supplier because it is referenced by purchase orders/items. Remove associations first.",
        )

    try:
        db.delete(supplier)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete supplier because it is referenced by purchase orders/items. Remove associations first.",
        ) from None

    return supplier


@router.get("/items/{item_id}/suppliers", response_model=List[schemas.SupplierItemResponse])
def list_item_suppliers(item_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(Item)
        .options(selectinload(Item.supplier_items).selectinload(SupplierItem.supplier))
        .filter(Item.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return [
        schemas.SupplierItemResponse(
            supplier_id=link.supplier_id,
            item_id=link.item_id,
            supplier_name=link.supplier.name,
            supplier_cost=link.supplier_cost,
            freight_cost=link.freight_cost,
            tariff_cost=link.tariff_cost,
            landed_cost=link.landed_cost,
            is_preferred=link.is_preferred,
            supplier_sku=link.supplier_sku,
            lead_time_days=link.lead_time_days,
            min_order_qty=link.min_order_qty,
            notes=link.notes,
        )
        for link in item.supplier_items
    ]


@router.post("/items/{item_id}/suppliers", response_model=schemas.SupplierItemResponse, status_code=status.HTTP_201_CREATED)
def create_item_supplier(item_id: int, payload: schemas.SupplierItemCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    existing = (
        db.query(SupplierItem)
        .filter(SupplierItem.item_id == item_id, SupplierItem.supplier_id == payload.supplier_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Supplier already linked to item.")
    link = SupplierItem(
        item=item,
        supplier_id=payload.supplier_id,
        supplier_cost=payload.supplier_cost,
        freight_cost=payload.freight_cost,
        tariff_cost=payload.tariff_cost,
        supplier_sku=payload.supplier_sku,
        lead_time_days=payload.lead_time_days,
        min_order_qty=payload.min_order_qty,
        notes=payload.notes,
        is_preferred=payload.is_preferred,
    )
    db.add(link)
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, item, payload.supplier_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier already linked to item.") from None
    db.refresh(link)
    return schemas.SupplierItemResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        supplier_name=supplier.name,
        supplier_cost=link.supplier_cost,
        freight_cost=link.freight_cost,
        tariff_cost=link.tariff_cost,
        landed_cost=link.landed_cost,
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=link.min_order_qty,
        notes=link.notes,
    )


@router.patch("/items/{item_id}/suppliers/{supplier_id}", response_model=schemas.SupplierItemResponse)
@router.put("/items/{item_id}/suppliers/{supplier_id}", response_model=schemas.SupplierItemResponse)
def update_item_supplier(
    item_id: int,
    supplier_id: int,
    payload: schemas.SupplierItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    link = get_supplier_link(db, item_id, supplier_id)
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, key, value)
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, item, supplier_id)
    db.commit()
    db.refresh(link)
    return schemas.SupplierItemResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        supplier_name=link.supplier.name,
        supplier_cost=link.supplier_cost,
        freight_cost=link.freight_cost,
        tariff_cost=link.tariff_cost,
        landed_cost=link.landed_cost,
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=link.min_order_qty,
        notes=link.notes,
    )


@router.delete("/items/{item_id}/suppliers/{supplier_id}", response_model=dict)
def delete_item_supplier(item_id: int, supplier_id: int, db: Session = Depends(get_db)):
    link = get_supplier_link(db, item_id, supplier_id)
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    db.delete(link)
    db.commit()
    return {"status": "ok"}


@router.get("/suppliers/{supplier_id}/items", response_model=List[schemas.SupplierItemBySupplierResponse])
def list_supplier_items(supplier_id: int, db: Session = Depends(get_db)):
    supplier = (
        db.query(Supplier)
        .options(selectinload(Supplier.supplier_items).selectinload(SupplierItem.item))
        .filter(Supplier.id == supplier_id)
        .first()
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return [
        schemas.SupplierItemBySupplierResponse(
            supplier_id=link.supplier_id,
            item_id=link.item_id,
            item_name=link.item.name,
            item_sku=link.item.sku,
            item_unit_price=link.item.unit_price,
            supplier_cost=link.supplier_cost,
            freight_cost=link.freight_cost,
            tariff_cost=link.tariff_cost,
            landed_cost=link.landed_cost,
            is_preferred=link.is_preferred,
            supplier_sku=link.supplier_sku,
            lead_time_days=link.lead_time_days,
            min_order_qty=link.min_order_qty,
            notes=link.notes,
        )
        for link in supplier.supplier_items
    ]


@router.post(
    "/suppliers/{supplier_id}/items",
    response_model=schemas.SupplierItemBySupplierResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier_item(
    supplier_id: int,
    payload: schemas.SupplierItemCreateForSupplier,
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    existing = (
        db.query(SupplierItem)
        .filter(SupplierItem.item_id == payload.item_id, SupplierItem.supplier_id == supplier_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Item already linked to supplier.")
    link = SupplierItem(
        item_id=payload.item_id,
        supplier=supplier,
        supplier_cost=payload.supplier_cost,
        freight_cost=payload.freight_cost,
        tariff_cost=payload.tariff_cost,
        supplier_sku=payload.supplier_sku,
        lead_time_days=payload.lead_time_days,
        min_order_qty=payload.min_order_qty,
        notes=payload.notes,
        is_preferred=payload.is_preferred,
    )
    db.add(link)
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, item, supplier_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Item already linked to supplier.") from None
    db.refresh(link)
    return schemas.SupplierItemBySupplierResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        item_name=item.name,
        item_sku=item.sku,
        item_unit_price=item.unit_price,
        supplier_cost=link.supplier_cost,
        freight_cost=link.freight_cost,
        tariff_cost=link.tariff_cost,
        landed_cost=link.landed_cost,
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=link.min_order_qty,
        notes=link.notes,
    )


@router.patch(
    "/suppliers/{supplier_id}/items/{item_id}",
    response_model=schemas.SupplierItemBySupplierResponse,
)
@router.put(
    "/suppliers/{supplier_id}/items/{item_id}",
    response_model=schemas.SupplierItemBySupplierResponse,
)
def update_supplier_item(
    supplier_id: int,
    item_id: int,
    payload: schemas.SupplierItemUpdate,
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    link = get_supplier_link(db, item_id, supplier_id)
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, key, value)
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, link.item, supplier_id)
    db.commit()
    db.refresh(link)
    return schemas.SupplierItemBySupplierResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        item_name=link.item.name,
        item_sku=link.item.sku,
        item_unit_price=link.item.unit_price,
        supplier_cost=link.supplier_cost,
        freight_cost=link.freight_cost,
        tariff_cost=link.tariff_cost,
        landed_cost=link.landed_cost,
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=link.min_order_qty,
        notes=link.notes,
    )


@router.delete("/suppliers/{supplier_id}/items/{item_id}", response_model=dict)
def delete_supplier_item(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    link = get_supplier_link(db, item_id, supplier_id)
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    db.delete(link)
    db.commit()
    return {"status": "ok"}
