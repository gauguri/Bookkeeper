from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.module_keys import ModuleKey
from app.db import get_db
from app.inventory import schemas
from app.inventory.service import adjust_inventory, get_available_qty, get_available_qty_map, get_reserved_qty_map
from app.models import (
    Company,
    Inventory,
    InventoryMovement,
    InventoryReservation,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesRequest,
    SalesRequestLine,
)


router = APIRouter(prefix="/api/inventory", tags=["inventory"], dependencies=[Depends(require_module(ModuleKey.INVENTORY.value))])


def _get_default_company_id(db: Session) -> int:
    return db.query(Company.id).order_by(Company.id.asc()).scalar() or 1


def _safe_decimal(value: Decimal | float | int | None) -> Decimal:
    return Decimal(value or 0)


def _q2(value: Decimal | float | int | None) -> Decimal:
    return _safe_decimal(value).quantize(Decimal("0.01"))


def _avg_usage_by_item(db: Session, item_ids: list[int], usage_days: int) -> dict[int, Decimal]:
    if not item_ids:
        return {}
    since = datetime.utcnow() - timedelta(days=usage_days)
    rows = (
        db.query(SalesRequestLine.item_id, SalesRequestLine.quantity)
        .join(SalesRequest, SalesRequest.id == SalesRequestLine.sales_request_id)
        .filter(SalesRequest.created_at >= since, SalesRequestLine.item_id.in_(item_ids))
        .all()
    )
    totals: dict[int, Decimal] = {item_id: Decimal("0") for item_id in item_ids}
    for item_id, qty in rows:
        totals[item_id] = totals.get(item_id, Decimal("0")) + _safe_decimal(qty)
    return {item_id: (totals.get(item_id, Decimal("0")) / Decimal(usage_days)) for item_id in item_ids}


def _build_inventory_rows(db: Session, usage_days: int = 90) -> list[schemas.InventoryItemRow]:
    items = db.query(Item).options(selectinload(Item.supplier_items)).order_by(Item.name.asc()).all()
    item_ids = [item.id for item in items]

    inv_by_id = {row.item_id: row for row in db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()}
    reserved_by_id = get_reserved_qty_map(db, item_ids)
    avg_usage_by_id = _avg_usage_by_item(db, item_ids, usage_days)

    inbound_by_item: dict[int, Decimal] = {item_id: Decimal("0") for item_id in item_ids}
    inbound_rows = (
        db.query(PurchaseOrderLine.item_id, PurchaseOrderLine.qty_ordered, PurchaseOrderLine.qty_received)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
        .filter(PurchaseOrder.status.in_(["SENT", "PARTIALLY_RECEIVED"]))
        .all()
    )
    for item_id, qty_ordered, qty_received in inbound_rows:
        inbound_by_item[item_id] = inbound_by_item.get(item_id, Decimal("0")) + max(Decimal("0"), _safe_decimal(qty_ordered) - _safe_decimal(qty_received))

    movements = db.query(InventoryMovement.item_id, InventoryMovement.reason, InventoryMovement.created_at).filter(InventoryMovement.item_id.in_(item_ids)).all()
    last_receipt: dict[int, datetime] = {}
    last_issue: dict[int, datetime] = {}
    last_movement: dict[int, datetime] = {}
    for item_id, reason, created_at in movements:
        if created_at:
            last_movement[item_id] = max(last_movement.get(item_id, created_at), created_at)
            reason_norm = (reason or "").upper()
            if "RECEIPT" in reason_norm:
                last_receipt[item_id] = max(last_receipt.get(item_id, created_at), created_at)
            if "ISSUE" in reason_norm or "SHIP" in reason_norm:
                last_issue[item_id] = max(last_issue.get(item_id, created_at), created_at)

    now = datetime.utcnow()
    rows: list[schemas.InventoryItemRow] = []
    for item in items:
        inv = inv_by_id.get(item.id)
        on_hand = _q2(inv.quantity_on_hand if inv else item.on_hand_qty)
        landed_cost = _q2(inv.landed_unit_cost if inv else item.preferred_landed_cost)
        reserved = _q2(reserved_by_id.get(item.id, Decimal("0")))
        available = on_hand - reserved
        avg_daily_usage = _q2(avg_usage_by_id.get(item.id, Decimal("0")))
        preferred = item.preferred_supplier_link
        lead_time = int(item.lead_time_days or (preferred.lead_time_days if preferred and preferred.lead_time_days else 14))
        safety_stock = _q2(item.safety_stock_qty)
        reorder_point = _q2(item.reorder_point)
        if reorder_point <= 0:
            reorder_point = (avg_daily_usage * Decimal(lead_time)) + safety_stock
        target_days = _q2(item.target_days_supply or 30)
        inbound = _q2(inbound_by_item.get(item.id, Decimal("0")))
        projected_on_hand = on_hand - reserved + inbound
        desired_on_hand = avg_daily_usage * target_days
        suggested_reorder_qty = _q2(max(Decimal("0"), desired_on_hand - projected_on_hand))
        days_of_supply = Decimal("0.00") if avg_daily_usage <= 0 else _q2(max(Decimal("0"), available / avg_daily_usage))

        last_move = last_movement.get(item.id)
        dead_stock = bool(last_move and (now - last_move).days > 120)
        excess = days_of_supply > Decimal("180")
        stockout = available <= 0
        low_stock = available <= reorder_point and reorder_point > 0
        at_risk = days_of_supply > 0 and days_of_supply < Decimal(lead_time)
        pressure = on_hand > 0 and (reserved / on_hand) >= Decimal("0.7")

        health_flag = "healthy"
        if stockout:
            health_flag = "stockout"
        elif dead_stock or excess:
            health_flag = "excess"
        elif at_risk:
            health_flag = "at_risk"
        elif low_stock:
            health_flag = "low_stock"
        elif pressure:
            health_flag = "reserved_pressure"

        rows.append(
            schemas.InventoryItemRow(
                id=item.id,
                sku=item.sku,
                item=item.name,
                on_hand=on_hand,
                reserved=reserved,
                available=available,
                reorder_point=reorder_point,
                safety_stock=safety_stock,
                lead_time_days=lead_time,
                avg_daily_usage=avg_daily_usage,
                days_of_supply=days_of_supply,
                suggested_reorder_qty=suggested_reorder_qty,
                preferred_supplier=item.preferred_supplier_name,
                preferred_supplier_id=item.preferred_supplier_id,
                last_receipt=last_receipt.get(item.id),
                last_issue=last_issue.get(item.id),
                total_value=_q2(on_hand * landed_cost),
                inbound_qty=inbound,
                health_flag=health_flag,
            )
        )
    return rows


def _queue_filter(queue: str, rows: list[schemas.InventoryItemRow]) -> list[schemas.InventoryItemRow]:
    queue = (queue or "needs_attention").lower()
    if queue == "stockouts":
        return [row for row in rows if row.available <= 0]
    if queue == "low_stock":
        return [row for row in rows if row.available <= row.reorder_point]
    if queue == "at_risk":
        return [row for row in rows if row.days_of_supply > 0 and row.days_of_supply < row.lead_time_days]
    if queue == "excess":
        return [row for row in rows if row.days_of_supply > 180 or row.health_flag == "excess"]
    if queue == "reserved_pressure":
        return [row for row in rows if row.on_hand > 0 and (row.reserved / row.on_hand) >= Decimal("0.7")]
    if queue == "all":
        return rows
    return [row for row in rows if row.health_flag in {"stockout", "low_stock", "at_risk", "excess", "reserved_pressure"}]


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


@router.get("/summary", response_model=schemas.InventorySummaryResponse)
def get_inventory_summary(usage_days: int = Query(90, ge=7, le=365), db: Session = Depends(get_db)):
    rows = _build_inventory_rows(db, usage_days=usage_days)
    total_on_hand_qty = _q2(sum(row.on_hand for row in rows))
    total_reserved_qty = _q2(sum(row.reserved for row in rows))
    total_available_qty = _q2(sum(row.available for row in rows))
    total_value = _q2(sum(row.total_value for row in rows))
    total_inbound_qty = _q2(sum(row.inbound_qty for row in rows))
    total_backordered_qty = _q2(sum(abs(row.available) for row in rows if row.available < 0))

    return schemas.InventorySummaryResponse(
        inventory_value=total_value,
        low_stock_items=len([row for row in rows if row.available <= row.reorder_point]),
        stockouts=len([row for row in rows if row.available <= 0]),
        at_risk_items=len([row for row in rows if row.days_of_supply > 0 and row.days_of_supply < row.lead_time_days]),
        excess_dead_stock=len([row for row in rows if row.days_of_supply > 180 or row.health_flag == "excess"]),
        reserved_pressure_items=len([row for row in rows if row.on_hand > 0 and (row.reserved / row.on_hand) >= Decimal("0.7")]),
        total_on_hand_qty=total_on_hand_qty,
        total_reserved_qty=total_reserved_qty,
        total_available_qty=total_available_qty,
        total_value=total_value,
        total_inbound_qty=total_inbound_qty,
        total_backordered_qty=total_backordered_qty,
    )


@router.get("/items", response_model=schemas.InventoryItemsResponse)
def list_inventory_items(
    queue: str = "needs_attention",
    search: Optional[str] = None,
    sort: str = "total_value:desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    usage_days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
):
    rows = _build_inventory_rows(db, usage_days=usage_days)
    queue_counts = [
        schemas.InventoryQueueCount(key="needs_attention", label="Needs Attention", count=len(_queue_filter("needs_attention", rows))),
        schemas.InventoryQueueCount(key="stockouts", label="Stockouts", count=len(_queue_filter("stockouts", rows))),
        schemas.InventoryQueueCount(key="low_stock", label="Low Stock", count=len(_queue_filter("low_stock", rows))),
        schemas.InventoryQueueCount(key="at_risk", label="At Risk (JIT)", count=len(_queue_filter("at_risk", rows))),
        schemas.InventoryQueueCount(key="excess", label="Excess / Dead Stock", count=len(_queue_filter("excess", rows))),
        schemas.InventoryQueueCount(key="all", label="All Items", count=len(rows)),
    ]

    filtered = _queue_filter(queue, rows)
    if search:
        q = search.lower()
        filtered = [row for row in filtered if q in row.item.lower() or (row.sku and q in row.sku.lower())]

    sort_key, _, sort_dir = sort.partition(":")
    reverse = sort_dir.lower() != "asc"
    key_map = {
        "item": lambda row: row.item.lower(),
        "available": lambda row: row.available,
        "days_of_supply": lambda row: row.days_of_supply,
        "suggested_reorder_qty": lambda row: row.suggested_reorder_qty,
        "total_value": lambda row: row.total_value,
    }
    filtered.sort(key=key_map.get(sort_key, key_map["total_value"]), reverse=reverse)

    total = len(filtered)
    start = (page - 1) * page_size
    paged = filtered[start : start + page_size]

    return schemas.InventoryItemsResponse(items=paged, queue_counts=queue_counts, page=page, page_size=page_size, total=total)


@router.patch("/items/{item_id}/planning", response_model=schemas.InventoryItemRow)
@router.put("/items/{item_id}/planning", response_model=schemas.InventoryItemRow)
def update_inventory_planning(item_id: int, payload: schemas.InventoryPlanningUpdate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    if payload.reorder_point_qty is not None:
        item.reorder_point = payload.reorder_point_qty
    if payload.safety_stock_qty is not None:
        item.safety_stock_qty = payload.safety_stock_qty
    if payload.lead_time_days is not None:
        item.lead_time_days = payload.lead_time_days
    if payload.target_days_supply is not None:
        item.target_days_supply = payload.target_days_supply
    db.commit()
    row = next((entry for entry in _build_inventory_rows(db) if entry.id == item_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Inventory planning row missing.")
    return row


@router.get("/analytics", response_model=schemas.InventoryAnalyticsResponse)
def get_inventory_analytics(db: Session = Depends(get_db)):
    rows = _build_inventory_rows(db, usage_days=90)
    now = datetime.utcnow()

    value_trend: list[schemas.InventoryTrendPoint] = []
    for i in range(11, -1, -1):
        month_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i * 30))
        month_end = month_start + timedelta(days=30)
        receipt_movements = (
            db.query(InventoryMovement).filter(InventoryMovement.created_at >= month_start, InventoryMovement.created_at < month_end, InventoryMovement.qty_delta > 0).all()
        )
        issue_movements = (
            db.query(InventoryMovement).filter(InventoryMovement.created_at >= month_start, InventoryMovement.created_at < month_end, InventoryMovement.qty_delta < 0).all()
        )
        delta = sum(_safe_decimal(entry.qty_delta) for entry in receipt_movements + issue_movements)
        current_total = sum((row.total_value for row in rows), Decimal("0"))
        value_trend.append(schemas.InventoryTrendPoint(period=month_start.strftime("%b"), value=_q2(max(Decimal("0"), current_total + delta))))

    health_breakdown = [
        schemas.InventoryHealthPoint(name="Healthy", value=len([row for row in rows if row.health_flag == "healthy"])),
        schemas.InventoryHealthPoint(name="Low", value=len([row for row in rows if row.health_flag == "low_stock"])),
        schemas.InventoryHealthPoint(name="Stockout", value=len([row for row in rows if row.health_flag == "stockout"])),
        schemas.InventoryHealthPoint(name="Excess", value=len([row for row in rows if row.health_flag == "excess"])),
    ]

    top_consumption = sorted(rows, key=lambda row: row.avg_daily_usage, reverse=True)[:10]
    top_consumption_payload = [schemas.InventoryConsumptionPoint(item=row.item, value=_q2(row.avg_daily_usage * Decimal("30"))) for row in top_consumption]

    net_flow: list[schemas.InventoryFlowPoint] = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i * 30))
        month_end = month_start + timedelta(days=30)
        month_moves = db.query(InventoryMovement).filter(InventoryMovement.created_at >= month_start, InventoryMovement.created_at < month_end).all()
        receipts = sum((_safe_decimal(m.qty_delta) for m in month_moves if _safe_decimal(m.qty_delta) > 0), Decimal("0"))
        issues = abs(sum((_safe_decimal(m.qty_delta) for m in month_moves if _safe_decimal(m.qty_delta) < 0), Decimal("0")))
        reserved = sum((row.reserved for row in rows), Decimal("0"))
        net_flow.append(schemas.InventoryFlowPoint(period=month_start.strftime("%b"), receipts=_q2(receipts), issues=_q2(issues), reserved=_q2(reserved)))

    return schemas.InventoryAnalyticsResponse(
        value_trend=value_trend,
        health_breakdown=health_breakdown,
        top_consumption=top_consumption_payload,
        net_flow=net_flow,
    )


@router.get("/items/{item_id}/detail", response_model=schemas.InventoryItemDetailResponse)
def get_item_detail(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    row = next((entry for entry in _build_inventory_rows(db) if entry.id == item_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Item not found.")

    movements = (
        db.query(InventoryMovement)
        .filter(InventoryMovement.item_id == item_id)
        .order_by(InventoryMovement.created_at.desc())
        .limit(30)
        .all()
    )
    reservations = list_item_reservations(item_id, db)
    last_updated = movements[0].created_at if movements else None
    projected_available = _q2(row.on_hand - row.reserved + row.inbound_qty)
    target_stock = _q2(row.avg_daily_usage * Decimal(item.target_days_supply or 30))

    since = datetime.utcnow() - timedelta(days=90)
    daily_consumption: dict[str, Decimal] = {}
    movement_rows = (
        db.query(InventoryMovement.created_at, InventoryMovement.qty_delta)
        .filter(InventoryMovement.item_id == item_id, InventoryMovement.created_at >= since)
        .order_by(InventoryMovement.created_at.asc())
        .all()
    )
    for created_at, qty_delta in movement_rows:
        if not created_at:
            continue
        key = created_at.date().isoformat()
        qty = _safe_decimal(qty_delta)
        consumed = abs(qty) if qty < 0 else Decimal("0")
        daily_consumption[key] = daily_consumption.get(key, Decimal("0")) + consumed

    consumption_trend = [
        {"date": date_key, "consumption": _q2(daily_consumption[date_key])}
        for date_key in sorted(daily_consumption.keys())
    ]

    return schemas.InventoryItemDetailResponse(
        item=row,
        movements=[
            {
                "id": movement.id,
                "qty_delta": movement.qty_delta,
                "reason": movement.reason,
                "ref_type": movement.ref_type,
                "ref_id": movement.ref_id,
                "created_at": movement.created_at,
            }
            for movement in movements
        ],
        reservations=reservations,
        reorder_explanation=(
            f"ROP {row.reorder_point} = avg usage {row.avg_daily_usage} x lead time {row.lead_time_days} + safety stock {row.safety_stock}. "
            f"Suggested order {row.suggested_reorder_qty} based on projected available ({projected_available})."
        ),
        projected_available=projected_available,
        target_stock=target_stock,
        last_updated=last_updated,
        consumption_trend=consumption_trend,
    )


@router.get("/items/{item_id}/analytics", response_model=schemas.InventoryAnalyticsResponse)
def get_item_analytics(item_id: int, db: Session = Depends(get_db)):
    _ = db.query(Item).filter(Item.id == item_id).first()
    if not _:
        raise HTTPException(status_code=404, detail="Item not found.")
    return get_inventory_analytics(db)


@router.get("/reorder-recommendations", response_model=list[schemas.ReorderRecommendationResponse])
def get_reorder_recommendations(top_n: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    rows = sorted(_build_inventory_rows(db), key=lambda row: row.suggested_reorder_qty, reverse=True)
    return [
        schemas.ReorderRecommendationResponse(
            item_id=row.id,
            item=row.item,
            supplier_id=row.preferred_supplier_id,
            supplier=row.preferred_supplier,
            suggested_order_qty=row.suggested_reorder_qty,
            days_of_supply=row.days_of_supply,
        )
        for row in rows
        if row.suggested_reorder_qty > 0
    ][:top_n]


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
