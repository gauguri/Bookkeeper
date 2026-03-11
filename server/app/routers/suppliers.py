from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.module_keys import ModuleKey
from app.db import get_db
from app.models import InvoiceLine, Item, PurchaseOrder, PurchaseOrderLine, PurchaseOrderSendLog, Supplier, SupplierItem
from app.suppliers import schemas
from app.suppliers.service import get_supplier_link, set_preferred_supplier


router = APIRouter(prefix="/api", tags=["suppliers"], dependencies=[Depends(require_module(ModuleKey.SUPPLIERS.value))])


def _serialize_supplier_item(link: SupplierItem) -> schemas.SupplierItemBySupplierResponse:
    default_unit_cost = link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost
    return schemas.SupplierItemBySupplierResponse(
        id=link.id,
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        item_name=link.item.name,
        sku=link.item.sku,
        item_sku=link.item.sku,
        default_unit_cost=default_unit_cost,
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
        is_active=link.is_active,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.get("/suppliers", response_model=List[schemas.SupplierResponse])
def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    queue: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Supplier)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            Supplier.name.ilike(like)
            | Supplier.legal_name.ilike(like)
            | Supplier.email.ilike(like)
            | Supplier.phone.ilike(like)
        )

    if queue == "active":
        query = query.filter(Supplier.status == "active")
    elif queue == "inactive":
        query = query.filter(Supplier.status == "inactive")
    elif queue == "missing_catalog":
        query = query.filter(~Supplier.supplier_items.any())
    elif queue == "needs_attention":
        query = query.filter(
            (Supplier.email.is_(None)) | (Supplier.phone.is_(None)) | (Supplier.remit_to_address.is_(None))
        )
    elif queue == "high_lead_time":
        query = query.filter(Supplier.default_lead_time_days.isnot(None), Supplier.default_lead_time_days > 30)

    return query.order_by(Supplier.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()


@router.get("/suppliers/summary", response_model=schemas.SupplierSummaryResponse)
def suppliers_summary(range: str = Query("YTD"), db: Session = Depends(get_db)):
    del range
    active = db.query(func.count(Supplier.id)).filter(Supplier.status == "active").scalar() or 0
    suppliers_with_open_pos = (
        db.query(func.count(func.distinct(PurchaseOrder.supplier_id)))
        .filter(PurchaseOrder.status.in_(["DRAFT", "SENT"]))
        .scalar()
        or 0
    )
    average_lead_time = db.query(func.avg(Supplier.default_lead_time_days)).scalar() or 0

    total_items = db.query(func.count(Item.id)).scalar() or 0
    mapped_items = db.query(func.count(func.distinct(SupplierItem.item_id))).filter(SupplierItem.is_active.is_(True)).scalar() or 0
    coverage = (mapped_items / total_items * 100) if total_items else 0

    return schemas.SupplierSummaryResponse(
        active_suppliers=int(active),
        suppliers_with_open_pos=int(suppliers_with_open_pos),
        average_lead_time_days=float(average_lead_time or 0),
        on_time_delivery_percent=0,
        catalog_coverage_percent=round(coverage, 2),
    )


@router.post("/suppliers", response_model=schemas.SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data.get("website") is not None:
        data["website"] = str(data["website"])
    supplier = Supplier(**data)
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
    updates = payload.model_dump(exclude_unset=True)
    if "website" in updates and updates["website"] is not None:
        updates["website"] = str(updates["website"])
    for key, value in updates.items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.patch("/suppliers/{supplier_id}/status", response_model=schemas.SupplierResponse)
def patch_supplier_status(supplier_id: int, payload: schemas.SupplierStatusPatch, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    supplier.status = payload.status
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
            default_unit_cost=link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost,
            landed_cost=link.landed_cost,
            is_preferred=link.is_preferred,
            supplier_sku=link.supplier_sku,
            lead_time_days=link.lead_time_days,
            min_order_qty=link.min_order_qty,
            notes=link.notes,
            is_active=link.is_active,
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
    existing = db.query(SupplierItem).filter(SupplierItem.item_id == item_id, SupplierItem.supplier_id == payload.supplier_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Supplier already linked to item.")

    link = SupplierItem(item=item, supplier_id=payload.supplier_id, **payload.model_dump(exclude={"supplier_id"}))
    if link.default_unit_cost is None:
        link.default_unit_cost = link.supplier_cost
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
        supplier_name=link.supplier.name,
        supplier_cost=link.supplier_cost,
        freight_cost=link.freight_cost,
        tariff_cost=link.tariff_cost,
        default_unit_cost=link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost,
        landed_cost=link.landed_cost,
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=link.min_order_qty,
        notes=link.notes,
        is_active=link.is_active,
    )


@router.get("/suppliers/{supplier_id}/items", response_model=List[schemas.SupplierItemBySupplierResponse])
def list_supplier_items(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).options(selectinload(Supplier.supplier_items).selectinload(SupplierItem.item)).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return [_serialize_supplier_item(link) for link in supplier.supplier_items]


@router.post("/suppliers/{supplier_id}/items", response_model=List[schemas.SupplierItemBySupplierResponse], status_code=status.HTTP_201_CREATED)
def create_supplier_items(
    supplier_id: int,
    payload: schemas.SupplierItemCreateForSupplier | List[schemas.SupplierItemCreateForSupplier] = Body(...),
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    created_links: List[SupplierItem] = []
    entries = payload if isinstance(payload, list) else [payload]
    for entry in entries:
        item = db.query(Item).filter(Item.id == entry.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item not found: {entry.item_id}")
        existing = db.query(SupplierItem).filter(SupplierItem.item_id == entry.item_id, SupplierItem.supplier_id == supplier_id).first()
        if existing:
            continue
        data = entry.model_dump(exclude={"item_id"})
        link = SupplierItem(item_id=entry.item_id, supplier_id=supplier_id, **data)
        if link.default_unit_cost is None:
            link.default_unit_cost = link.supplier_cost
        db.add(link)
        db.flush()
        if entry.is_preferred:
            set_preferred_supplier(db, item, supplier_id)
        created_links.append(link)

    db.commit()
    for link in created_links:
        db.refresh(link)
    return [_serialize_supplier_item(link) for link in created_links]


@router.patch("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=schemas.SupplierItemBySupplierResponse)
@router.put("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=schemas.SupplierItemBySupplierResponse)
def update_supplier_item(
    supplier_id: int,
    supplier_item_id: int,
    payload: schemas.SupplierItemUpdate,
    db: Session = Depends(get_db),
):
    link = db.query(SupplierItem).options(selectinload(SupplierItem.item)).filter((SupplierItem.id == supplier_item_id) | (SupplierItem.item_id == supplier_item_id), SupplierItem.supplier_id == supplier_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, key, value)
    if link.default_unit_cost is None:
        link.default_unit_cost = link.supplier_cost
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, link.item, supplier_id)
    db.commit()
    db.refresh(link)
    return _serialize_supplier_item(link)


@router.delete("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=dict)
def delete_supplier_item(supplier_id: int, supplier_item_id: int, db: Session = Depends(get_db)):
    link = db.query(SupplierItem).filter((SupplierItem.id == supplier_item_id) | (SupplierItem.item_id == supplier_item_id), SupplierItem.supplier_id == supplier_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    db.delete(link)
    db.commit()
    return {"status": "ok"}

