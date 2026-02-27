"""SAP-level Inventory Management API routes.

All endpoints are prefixed with /api/v1/inventory and require INVENTORY module access.
"""

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_module
from app.db import get_db
from app.inv_management import schemas
from app.inv_management import master_data_service as mds
from app.inv_management import operations_service as ops
from app.inv_management import reporting_service as rpt
from app.inv_management import transaction_service as txn
from app.models import (
    InvBatch,
    InvSerial,
    InvStockOnHand,
    InvTransactionHeader,
    InvWarehouse,
    User,
)
from app.module_keys import ModuleKey

router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["inventory-v1"],
    dependencies=[Depends(require_module(ModuleKey.INVENTORY.value))],
)


def _current_user(user: User = Depends(get_current_user)) -> User:
    return user


# ===== UoM =====

@router.get("/uom", response_model=list[schemas.UomResponse])
def list_uoms(db: Session = Depends(get_db)):
    return mds.list_uoms(db)


@router.post("/uom", response_model=schemas.UomResponse, status_code=201)
def create_uom(payload: schemas.UomCreate, db: Session = Depends(get_db)):
    uom = mds.create_uom(db, code=payload.code, name=payload.name,
                          category=payload.category, is_base=payload.is_base)
    db.commit()
    db.refresh(uom)
    return uom


@router.get("/uom/conversions", response_model=list[schemas.UomConversionResponse])
def list_uom_conversions(db: Session = Depends(get_db)):
    return mds.list_uom_conversions(db)


@router.post("/uom/conversions", response_model=schemas.UomConversionResponse, status_code=201)
def create_uom_conversion(payload: schemas.UomConversionCreate, db: Session = Depends(get_db)):
    conv = mds.create_uom_conversion(
        db, item_id=payload.item_id, from_uom_id=payload.from_uom_id,
        to_uom_id=payload.to_uom_id, conversion_factor=payload.conversion_factor)
    db.commit()
    db.refresh(conv)
    return conv


# ===== Categories =====

@router.get("/categories", response_model=list[schemas.CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return mds.get_category_tree(db)


@router.post("/categories", response_model=schemas.CategoryResponse, status_code=201)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    cat = mds.create_category(db, parent_id=payload.parent_id, name=payload.name,
                               code=payload.code, description=payload.description,
                               sort_order=payload.sort_order,
                               inherited_properties=payload.inherited_properties)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/categories/{category_id}/children", response_model=list[schemas.CategoryResponse])
def get_category_children(category_id: int, db: Session = Depends(get_db)):
    return mds.list_categories(db, parent_id=category_id)


# ===== Warehouses =====

@router.get("/warehouses", response_model=list[schemas.WarehouseResponse])
def list_warehouses(db: Session = Depends(get_db)):
    return mds.list_warehouses(db)


@router.post("/warehouses", response_model=schemas.WarehouseResponse, status_code=201)
def create_warehouse(payload: schemas.WarehouseCreate, db: Session = Depends(get_db)):
    wh = mds.create_warehouse(db, **payload.model_dump())
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/warehouses/{warehouse_id}", response_model=schemas.WarehouseResponse)
def get_warehouse(warehouse_id: int, db: Session = Depends(get_db)):
    wh = mds.get_warehouse(db, warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return wh


@router.get("/warehouses/{warehouse_id}/stock", response_model=list[schemas.StockOnHandResponse])
def get_warehouse_stock(warehouse_id: int, db: Session = Depends(get_db)):
    stocks = (
        db.query(InvStockOnHand)
        .filter(InvStockOnHand.warehouse_id == warehouse_id, InvStockOnHand.quantity > 0)
        .all()
    )
    return stocks


@router.get("/warehouses/{warehouse_id}/zones", response_model=list[schemas.ZoneResponse])
def list_zones(warehouse_id: int, db: Session = Depends(get_db)):
    return mds.list_zones(db, warehouse_id)


@router.post("/warehouses/{warehouse_id}/zones", response_model=schemas.ZoneResponse, status_code=201)
def create_zone(warehouse_id: int, payload: schemas.ZoneCreate, db: Session = Depends(get_db)):
    zone = mds.create_zone(db, warehouse_id, **payload.model_dump())
    db.commit()
    db.refresh(zone)
    return zone


# ===== Batches =====

@router.get("/batches", response_model=list[schemas.BatchResponse])
def list_batches(item_id: Optional[int] = None, db: Session = Depends(get_db)):
    return mds.list_batches(db, item_id=item_id)


@router.post("/batches", response_model=schemas.BatchResponse, status_code=201)
def create_batch(payload: schemas.BatchCreate, db: Session = Depends(get_db)):
    batch = mds.create_batch(db, **payload.model_dump())
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/batches/{batch_id}", response_model=schemas.BatchResponse)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = mds.get_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.put("/batches/{batch_id}", response_model=schemas.BatchResponse)
def update_batch_status(batch_id: int, status: str = Query(...), db: Session = Depends(get_db)):
    batch = db.query(InvBatch).filter(InvBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch.status = status
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/batches/expiring", response_model=list[schemas.BatchResponse])
def get_expiring_batches(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    return mds.get_expiring_batches(db, days=days)


# ===== Serials =====

@router.get("/serials", response_model=list[schemas.SerialResponse])
def list_serials(item_id: Optional[int] = None, db: Session = Depends(get_db)):
    return mds.list_serials(db, item_id=item_id)


@router.post("/serials", response_model=schemas.SerialResponse, status_code=201)
def create_serial(payload: schemas.SerialCreate, db: Session = Depends(get_db)):
    serial = mds.create_serial(db, **payload.model_dump())
    db.commit()
    db.refresh(serial)
    return serial


@router.get("/serials/{serial_id}", response_model=schemas.SerialResponse)
def get_serial(serial_id: int, db: Session = Depends(get_db)):
    serial = mds.get_serial(db, serial_id)
    if not serial:
        raise HTTPException(status_code=404, detail="Serial not found")
    return serial


# ===== Transactions =====

@router.post("/transactions/goods-receipt", response_model=schemas.TransactionHeaderResponse, status_code=201)
def create_goods_receipt(payload: schemas.GoodsReceiptCreate, db: Session = Depends(get_db),
                          user: User = Depends(_current_user)):
    try:
        header = txn.goods_receipt(
            db,
            warehouse_id=payload.warehouse_id,
            lines=[line.model_dump() for line in payload.lines],
            reference_type=payload.reference_type,
            reference_id=payload.reference_id,
            reference_number=payload.reference_number,
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            created_by=user.id,
        )
        db.commit()
        db.refresh(header)
        return header
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transactions/goods-issue", response_model=schemas.TransactionHeaderResponse, status_code=201)
def create_goods_issue(payload: schemas.GoodsIssueCreate, db: Session = Depends(get_db),
                        user: User = Depends(_current_user)):
    try:
        header = txn.goods_issue(
            db,
            warehouse_id=payload.warehouse_id,
            lines=[line.model_dump() for line in payload.lines],
            reference_type=payload.reference_type,
            reference_id=payload.reference_id,
            reference_number=payload.reference_number,
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            created_by=user.id,
        )
        db.commit()
        db.refresh(header)
        return header
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transactions/stock-transfer", response_model=schemas.TransactionHeaderResponse, status_code=201)
def create_stock_transfer(payload: schemas.StockTransferCreate, db: Session = Depends(get_db),
                           user: User = Depends(_current_user)):
    try:
        header = txn.stock_transfer(
            db,
            source_warehouse_id=payload.source_warehouse_id,
            destination_warehouse_id=payload.destination_warehouse_id,
            lines=[line.model_dump() for line in payload.lines],
            reference_number=payload.reference_number,
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            created_by=user.id,
        )
        db.commit()
        db.refresh(header)
        return header
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transactions/stock-adjustment", response_model=schemas.TransactionHeaderResponse, status_code=201)
def create_stock_adjustment(payload: schemas.StockAdjustmentCreate, db: Session = Depends(get_db),
                             user: User = Depends(_current_user)):
    try:
        header = txn.stock_adjustment(
            db,
            warehouse_id=payload.warehouse_id,
            lines=[line.model_dump() for line in payload.lines],
            reason_code_id=payload.reason_code_id,
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            created_by=user.id,
        )
        db.commit()
        db.refresh(header)
        return header
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transactions/{transaction_id}/reverse", response_model=schemas.TransactionHeaderResponse, status_code=201)
def reverse_transaction(transaction_id: int, db: Session = Depends(get_db),
                         user: User = Depends(_current_user)):
    try:
        header = txn.reverse_transaction(db, transaction_id=transaction_id, created_by=user.id)
        db.commit()
        db.refresh(header)
        return header
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/transactions")
def list_transactions(
    transaction_type: Optional[str] = None,
    status: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    item_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    txns, total = txn.list_transactions(
        db,
        transaction_type=transaction_type,
        status=status,
        warehouse_id=warehouse_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
    return {
        "data": [schemas.TransactionHeaderResponse.model_validate(t) for t in txns],
        "meta": {"page": page, "limit": limit, "total": total,
                 "total_pages": (total + limit - 1) // limit},
    }


@router.get("/transactions/{transaction_id}", response_model=schemas.TransactionHeaderResponse)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    header = txn.get_transaction(db, transaction_id)
    if not header:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return header


# ===== Reservations =====

@router.get("/reservations", response_model=list[schemas.ReservationResponse])
def list_reservations(item_id: Optional[int] = None, status: Optional[str] = None,
                      db: Session = Depends(get_db)):
    return ops.list_reservations(db, item_id=item_id, status=status)


@router.post("/reservations", response_model=schemas.ReservationResponse, status_code=201)
def create_reservation(payload: schemas.ReservationCreate, db: Session = Depends(get_db),
                        user: User = Depends(_current_user)):
    res = ops.create_reservation(
        db,
        item_id=payload.item_id,
        warehouse_id=payload.warehouse_id,
        reservation_type=payload.reservation_type,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        reserved_quantity=payload.reserved_quantity,
        expiry_date=payload.expiry_date,
        reserved_by=user.id,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(res)
    return res


@router.put("/reservations/{reservation_id}/fulfill", response_model=schemas.ReservationResponse)
def fulfill_reservation(reservation_id: int, db: Session = Depends(get_db)):
    try:
        res = ops.fulfill_reservation(db, reservation_id)
        db.commit()
        db.refresh(res)
        return res
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/reservations/{reservation_id}/cancel", response_model=schemas.ReservationResponse)
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db)):
    try:
        res = ops.cancel_reservation(db, reservation_id)
        db.commit()
        db.refresh(res)
        return res
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ===== Count Plans =====

@router.get("/count-plans", response_model=list[schemas.CountPlanResponse])
def list_count_plans(db: Session = Depends(get_db)):
    return ops.list_count_plans(db)


@router.post("/count-plans", response_model=schemas.CountPlanResponse, status_code=201)
def create_count_plan(payload: schemas.CountPlanCreate, db: Session = Depends(get_db),
                       user: User = Depends(_current_user)):
    plan = ops.create_count_plan(
        db,
        plan_type=payload.plan_type,
        warehouse_id=payload.warehouse_id,
        scheduled_date=payload.scheduled_date,
        freeze_stock=payload.freeze_stock,
        notes=payload.notes,
        created_by=user.id,
        item_ids=payload.item_ids,
    )
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/count-plans/{plan_id}", response_model=schemas.CountPlanResponse)
def get_count_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = ops.get_count_plan(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Count plan not found")
    return plan


@router.post("/count-plans/{plan_id}/start", response_model=schemas.CountPlanResponse)
def start_count_plan(plan_id: int, db: Session = Depends(get_db)):
    try:
        plan = ops.start_count_plan(db, plan_id)
        db.commit()
        db.refresh(plan)
        return plan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/count-plans/{plan_id}/items/{item_id}/count", response_model=schemas.CountPlanItemResponse)
def record_count(plan_id: int, item_id: int, payload: schemas.RecordCountInput,
                 db: Session = Depends(get_db), user: User = Depends(_current_user)):
    try:
        result = ops.record_count(db, count_item_id=item_id, counted_quantity=payload.counted_quantity,
                                   notes=payload.notes, counted_by=user.id)
        db.commit()
        db.refresh(result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/count-plans/{plan_id}/items/{item_id}/approve", response_model=schemas.CountPlanItemResponse)
def approve_count(plan_id: int, item_id: int, db: Session = Depends(get_db),
                  user: User = Depends(_current_user)):
    try:
        result = ops.approve_count_item(db, count_item_id=item_id, approved_by=user.id)
        db.commit()
        db.refresh(result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/count-plans/{plan_id}/complete", response_model=schemas.CountPlanResponse)
def complete_count_plan(plan_id: int, db: Session = Depends(get_db)):
    try:
        plan = ops.complete_count_plan(db, plan_id)
        db.commit()
        db.refresh(plan)
        return plan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== Quality =====

@router.get("/quality/inspection-lots", response_model=list[schemas.InspectionLotResponse])
def list_inspection_lots(status: Optional[str] = None, db: Session = Depends(get_db)):
    return ops.list_inspection_lots(db, status=status)


@router.post("/quality/inspection-lots", response_model=schemas.InspectionLotResponse, status_code=201)
def create_inspection_lot(payload: schemas.InspectionLotCreate, db: Session = Depends(get_db)):
    lot = ops.create_inspection_lot(db, **payload.model_dump())
    db.commit()
    db.refresh(lot)
    return lot


@router.get("/quality/inspection-lots/{lot_id}", response_model=schemas.InspectionLotResponse)
def get_inspection_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = ops.get_inspection_lot(db, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Inspection lot not found")
    return lot


@router.put("/quality/inspection-lots/{lot_id}")
def update_inspection_lot(lot_id: int, parameters: list[schemas.InspectionParameterInput],
                           db: Session = Depends(get_db)):
    try:
        lot = ops.record_inspection_result(db, lot_id, [p.model_dump() for p in parameters])
        db.commit()
        return schemas.InspectionLotResponse.model_validate(lot)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/quality/inspection-lots/{lot_id}/decide", response_model=schemas.InspectionLotResponse)
def decide_inspection(lot_id: int, decision: str = Query(...), db: Session = Depends(get_db),
                       user: User = Depends(_current_user)):
    try:
        lot = ops.make_usage_decision(db, lot_id, decision, decided_by=user.id)
        db.commit()
        db.refresh(lot)
        return lot
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/quality/ncr", response_model=list[schemas.NcrResponse])
def list_ncrs(status: Optional[str] = None, db: Session = Depends(get_db)):
    return ops.list_ncrs(db, status=status)


@router.post("/quality/ncr", response_model=schemas.NcrResponse, status_code=201)
def create_ncr(payload: schemas.NcrCreate, db: Session = Depends(get_db),
                user: User = Depends(_current_user)):
    ncr = ops.create_ncr(db, reported_by=user.id, **payload.model_dump())
    db.commit()
    db.refresh(ncr)
    return ncr


@router.get("/quality/ncr/{ncr_id}", response_model=schemas.NcrResponse)
def get_ncr(ncr_id: int, db: Session = Depends(get_db)):
    ncr = ops.get_ncr(db, ncr_id)
    if not ncr:
        raise HTTPException(status_code=404, detail="NCR not found")
    return ncr


# ===== Planning =====

@router.get("/planning/reorder-alerts")
def list_reorder_alerts(status: Optional[str] = None, db: Session = Depends(get_db)):
    alerts = ops.list_reorder_alerts(db, status=status)
    return [
        {
            "id": a.id,
            "item_id": a.item_id,
            "current_stock": a.current_stock,
            "reorder_level": a.reorder_level,
            "suggested_quantity": a.suggested_quantity,
            "status": a.status,
            "generated_at": a.generated_at,
        }
        for a in alerts
    ]


@router.post("/planning/reorder-check")
def trigger_reorder_check(db: Session = Depends(get_db)):
    alerts = ops.check_reorder_points(db)
    db.commit()
    return {"generated_alerts": len(alerts)}


@router.get("/planning/forecast/{item_id}")
def get_forecast(item_id: int, periods: int = Query(6, ge=1, le=24), db: Session = Depends(get_db)):
    forecasts = ops.generate_forecast(db, item_id, periods=periods)
    db.commit()
    return [
        {
            "period_year": f.period_year,
            "period_month": f.period_month,
            "forecast_quantity": f.forecast_quantity,
            "forecast_method": f.forecast_method,
        }
        for f in forecasts
    ]


# ===== Reports =====

@router.get("/reports/stock-overview")
def stock_overview(warehouse_id: Optional[int] = None, item_id: Optional[int] = None,
                   db: Session = Depends(get_db)):
    return rpt.get_stock_overview(db, warehouse_id=warehouse_id, item_id=item_id)


@router.get("/reports/dashboard", response_model=schemas.DashboardKPIs)
def dashboard_kpis(db: Session = Depends(get_db)):
    return rpt.get_dashboard_kpis(db)


@router.get("/reports/inventory-turnover")
def inventory_turnover(item_id: Optional[int] = None, days: int = Query(365, ge=30, le=730),
                       db: Session = Depends(get_db)):
    return rpt.get_inventory_turnover(db, item_id=item_id, days=days)


@router.get("/reports/slow-moving")
def slow_moving(days: int = Query(90, ge=7, le=365), db: Session = Depends(get_db)):
    return rpt.get_slow_moving_items(db, days=days)


@router.get("/reports/transaction-history")
def transaction_history(
    item_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    results, total = rpt.get_transaction_history(
        db, item_id=item_id, warehouse_id=warehouse_id, page=page, limit=limit)
    return {
        "data": results,
        "meta": {"page": page, "limit": limit, "total": total,
                 "total_pages": (total + limit - 1) // limit},
    }


# ===== Settings =====

@router.get("/settings", response_model=list[schemas.SettingResponse])
def get_settings(db: Session = Depends(get_db)):
    return ops.get_all_settings(db)


@router.put("/settings")
def update_settings(updates: dict[str, str], db: Session = Depends(get_db)):
    results = []
    for key, value in updates.items():
        setting = ops.update_setting(db, key, value)
        results.append({"key": setting.key, "value": setting.value})
    db.commit()
    return results
