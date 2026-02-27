"""Warehouse operations: counting, quality, reservations, planning."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    InvCountPlan,
    InvCountPlanItem,
    InvDemandForecast,
    InvInspectionLot,
    InvInspectionParameter,
    InvNonConformanceReport,
    InvReorderAlert,
    InvReservation,
    InvSetting,
    InvStockOnHand,
    InvTransactionLine,
    InvTransactionHeader,
    Item,
)


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------

def create_reservation(
    db: Session,
    *,
    item_id: int,
    warehouse_id: int | None = None,
    reservation_type: str = "soft",
    reference_type: str | None = None,
    reference_id: int | None = None,
    reserved_quantity: Decimal,
    expiry_date: datetime | None = None,
    reserved_by: int | None = None,
    notes: str | None = None,
) -> InvReservation:
    res = InvReservation(
        item_id=item_id,
        warehouse_id=warehouse_id,
        reservation_type=reservation_type,
        reference_type=reference_type,
        reference_id=reference_id,
        reserved_quantity=reserved_quantity,
        reserved_by=reserved_by,
        expiry_date=expiry_date,
        notes=notes,
    )
    db.add(res)
    db.flush()
    return res


def fulfill_reservation(db: Session, reservation_id: int, quantity: Decimal | None = None) -> InvReservation:
    res = db.query(InvReservation).filter(InvReservation.id == reservation_id).with_for_update().first()
    if not res:
        raise ValueError(f"Reservation {reservation_id} not found")
    if res.status in ("fulfilled", "cancelled"):
        raise ValueError(f"Reservation already {res.status}")

    fill_qty = quantity or res.reserved_quantity
    res.fulfilled_quantity += fill_qty
    if res.fulfilled_quantity >= res.reserved_quantity:
        res.status = "fulfilled"
    else:
        res.status = "partially_fulfilled"
    return res


def cancel_reservation(db: Session, reservation_id: int) -> InvReservation:
    res = db.query(InvReservation).filter(InvReservation.id == reservation_id).with_for_update().first()
    if not res:
        raise ValueError(f"Reservation {reservation_id} not found")
    res.status = "cancelled"
    return res


def list_reservations(db: Session, *, item_id: int | None = None, status: str | None = None) -> list[InvReservation]:
    q = db.query(InvReservation)
    if item_id:
        q = q.filter(InvReservation.item_id == item_id)
    if status:
        q = q.filter(InvReservation.status == status)
    return q.order_by(InvReservation.reserved_at.desc()).all()


# ---------------------------------------------------------------------------
# Count Plans
# ---------------------------------------------------------------------------

def _generate_count_number(db: Session) -> str:
    year = datetime.utcnow().year
    pattern = f"CC-{year}-%"
    max_num = (
        db.query(func.max(InvCountPlan.plan_number))
        .filter(InvCountPlan.plan_number.like(pattern))
        .scalar()
    )
    seq = int(max_num.split("-")[-1]) + 1 if max_num else 1
    return f"CC-{year}-{seq:06d}"


def create_count_plan(
    db: Session,
    *,
    plan_type: str = "cycle_count",
    warehouse_id: int | None = None,
    scheduled_date: date | None = None,
    freeze_stock: bool = False,
    notes: str | None = None,
    created_by: int | None = None,
    item_ids: list[int] | None = None,
) -> InvCountPlan:
    plan = InvCountPlan(
        plan_number=_generate_count_number(db),
        plan_type=plan_type,
        warehouse_id=warehouse_id,
        scheduled_date=scheduled_date,
        freeze_stock=freeze_stock,
        notes=notes,
        created_by=created_by,
    )
    db.add(plan)
    db.flush()

    # Add items
    target_ids = item_ids or []
    if not target_ids and warehouse_id:
        # Add all items that have stock in this warehouse
        stock_items = (
            db.query(InvStockOnHand.item_id)
            .filter(InvStockOnHand.warehouse_id == warehouse_id, InvStockOnHand.quantity > 0)
            .distinct()
            .all()
        )
        target_ids = [r[0] for r in stock_items]

    for iid in target_ids:
        system_qty = (
            db.query(func.coalesce(func.sum(InvStockOnHand.quantity), 0))
            .filter(InvStockOnHand.item_id == iid)
        )
        if warehouse_id:
            system_qty = system_qty.filter(InvStockOnHand.warehouse_id == warehouse_id)
        system_qty = Decimal(str(system_qty.scalar() or 0))

        plan_item = InvCountPlanItem(
            count_plan_id=plan.id,
            item_id=iid,
            system_quantity=system_qty,
        )
        db.add(plan_item)

    db.flush()
    return plan


def get_count_plan(db: Session, plan_id: int) -> InvCountPlan | None:
    return db.query(InvCountPlan).filter(InvCountPlan.id == plan_id).first()


def list_count_plans(db: Session) -> list[InvCountPlan]:
    return db.query(InvCountPlan).order_by(InvCountPlan.plan_number.desc()).all()


def start_count_plan(db: Session, plan_id: int) -> InvCountPlan:
    plan = db.query(InvCountPlan).filter(InvCountPlan.id == plan_id).first()
    if not plan:
        raise ValueError(f"Count plan {plan_id} not found")
    plan.status = "in_progress"
    plan.started_at = datetime.utcnow()
    return plan


def record_count(db: Session, count_item_id: int, counted_quantity: Decimal, notes: str | None = None,
                 counted_by: int | None = None) -> InvCountPlanItem:
    item = db.query(InvCountPlanItem).filter(InvCountPlanItem.id == count_item_id).first()
    if not item:
        raise ValueError(f"Count plan item {count_item_id} not found")

    item.counted_quantity = counted_quantity
    item.counted_at = datetime.utcnow()
    item.counted_by = counted_by
    item.notes = notes

    # Calculate variance
    sys_qty = item.system_quantity or Decimal("0")
    variance = counted_quantity - sys_qty
    item.variance_quantity = variance
    if sys_qty > 0:
        item.variance_pct = (variance / sys_qty) * 100
    else:
        item.variance_pct = Decimal("100") if variance != 0 else Decimal("0")

    # Auto-adjust if within threshold
    threshold_str = _get_setting(db, "variance_auto_adjust_threshold_pct", "2.0")
    threshold = Decimal(threshold_str)
    if abs(item.variance_pct or 0) <= threshold:
        item.count_status = "adjusted"
    else:
        item.count_status = "counted"

    return item


def approve_count_item(db: Session, count_item_id: int, approved_by: int | None = None) -> InvCountPlanItem:
    item = db.query(InvCountPlanItem).filter(InvCountPlanItem.id == count_item_id).first()
    if not item:
        raise ValueError(f"Count plan item {count_item_id} not found")
    item.count_status = "approved"
    item.approved_by = approved_by
    item.approved_at = datetime.utcnow()
    return item


def complete_count_plan(db: Session, plan_id: int) -> InvCountPlan:
    plan = db.query(InvCountPlan).filter(InvCountPlan.id == plan_id).first()
    if not plan:
        raise ValueError(f"Count plan {plan_id} not found")
    plan.status = "completed"
    plan.completed_at = datetime.utcnow()
    return plan


# ---------------------------------------------------------------------------
# Quality / Inspection
# ---------------------------------------------------------------------------

def _generate_lot_number(db: Session) -> str:
    year = datetime.utcnow().year
    pattern = f"IL-{year}-%"
    max_num = (
        db.query(func.max(InvInspectionLot.lot_number))
        .filter(InvInspectionLot.lot_number.like(pattern))
        .scalar()
    )
    seq = int(max_num.split("-")[-1]) + 1 if max_num else 1
    return f"IL-{year}-{seq:06d}"


def create_inspection_lot(
    db: Session,
    *,
    item_id: int,
    batch_id: int | None = None,
    transaction_id: int | None = None,
    inspection_type: str = "goods_receipt",
    quantity: Decimal,
    sample_size: Decimal | None = None,
) -> InvInspectionLot:
    lot = InvInspectionLot(
        lot_number=_generate_lot_number(db),
        item_id=item_id,
        batch_id=batch_id,
        transaction_id=transaction_id,
        inspection_type=inspection_type,
        quantity=quantity,
        sample_size=sample_size,
    )
    db.add(lot)
    db.flush()
    return lot


def get_inspection_lot(db: Session, lot_id: int) -> InvInspectionLot | None:
    return db.query(InvInspectionLot).filter(InvInspectionLot.id == lot_id).first()


def list_inspection_lots(db: Session, *, status: str | None = None) -> list[InvInspectionLot]:
    q = db.query(InvInspectionLot)
    if status:
        q = q.filter(InvInspectionLot.status == status)
    return q.order_by(InvInspectionLot.created_at.desc()).all()


def record_inspection_result(db: Session, lot_id: int, parameters: list[dict]) -> InvInspectionLot:
    lot = db.query(InvInspectionLot).filter(InvInspectionLot.id == lot_id).first()
    if not lot:
        raise ValueError(f"Inspection lot {lot_id} not found")

    lot.status = "in_progress"
    for param_data in parameters:
        param = InvInspectionParameter(
            inspection_lot_id=lot.id,
            parameter_name=param_data["parameter_name"],
            parameter_type=param_data.get("parameter_type", "quantitative"),
            target_value=param_data.get("target_value"),
            min_value=param_data.get("min_value"),
            max_value=param_data.get("max_value"),
            actual_value=param_data.get("actual_value"),
            result=param_data.get("result"),
            notes=param_data.get("notes"),
        )
        db.add(param)

    db.flush()
    return lot


def make_usage_decision(db: Session, lot_id: int, decision: str, decided_by: int | None = None) -> InvInspectionLot:
    """Make a usage decision: accepted, rejected, or conditional."""
    lot = db.query(InvInspectionLot).filter(InvInspectionLot.id == lot_id).first()
    if not lot:
        raise ValueError(f"Inspection lot {lot_id} not found")
    lot.status = decision
    lot.decided_at = datetime.utcnow()
    lot.decided_by = decided_by
    return lot


def _generate_ncr_number(db: Session) -> str:
    year = datetime.utcnow().year
    pattern = f"NCR-{year}-%"
    max_num = (
        db.query(func.max(InvNonConformanceReport.ncr_number))
        .filter(InvNonConformanceReport.ncr_number.like(pattern))
        .scalar()
    )
    seq = int(max_num.split("-")[-1]) + 1 if max_num else 1
    return f"NCR-{year}-{seq:06d}"


def create_ncr(
    db: Session,
    *,
    inspection_lot_id: int | None = None,
    item_id: int,
    batch_id: int | None = None,
    defect_type: str | None = None,
    severity: str = "minor",
    description: str | None = None,
    reported_by: int | None = None,
) -> InvNonConformanceReport:
    ncr = InvNonConformanceReport(
        ncr_number=_generate_ncr_number(db),
        inspection_lot_id=inspection_lot_id,
        item_id=item_id,
        batch_id=batch_id,
        defect_type=defect_type,
        severity=severity,
        description=description,
        reported_by=reported_by,
    )
    db.add(ncr)
    db.flush()
    return ncr


def get_ncr(db: Session, ncr_id: int) -> InvNonConformanceReport | None:
    return db.query(InvNonConformanceReport).filter(InvNonConformanceReport.id == ncr_id).first()


def list_ncrs(db: Session, *, status: str | None = None) -> list[InvNonConformanceReport]:
    q = db.query(InvNonConformanceReport)
    if status:
        q = q.filter(InvNonConformanceReport.status == status)
    return q.order_by(InvNonConformanceReport.created_at.desc()).all()


def resolve_ncr(db: Session, ncr_id: int, *, root_cause: str | None = None,
                corrective_action: str | None = None, preventive_action: str | None = None,
                resolved_by: int | None = None) -> InvNonConformanceReport:
    ncr = db.query(InvNonConformanceReport).filter(InvNonConformanceReport.id == ncr_id).first()
    if not ncr:
        raise ValueError(f"NCR {ncr_id} not found")
    ncr.root_cause = root_cause or ncr.root_cause
    ncr.corrective_action = corrective_action or ncr.corrective_action
    ncr.preventive_action = preventive_action or ncr.preventive_action
    ncr.resolved_by = resolved_by
    ncr.resolved_at = datetime.utcnow()
    ncr.status = "resolved"
    return ncr


# ---------------------------------------------------------------------------
# Planning & Reorder
# ---------------------------------------------------------------------------

def check_reorder_points(db: Session) -> list[InvReorderAlert]:
    """Scan items and generate reorder alerts for those below reorder level."""
    items = db.query(Item).filter(Item.is_active.is_(True)).all()
    alerts = []

    for item in items:
        reorder_point = Decimal(str(item.reorder_point or 0))
        if reorder_point <= 0:
            continue

        current_stock = (
            db.query(func.coalesce(func.sum(InvStockOnHand.quantity), 0))
            .filter(InvStockOnHand.item_id == item.id)
            .scalar()
        )
        current_stock = Decimal(str(current_stock or 0))

        if current_stock <= reorder_point:
            # Check if there's already an open alert
            existing = (
                db.query(InvReorderAlert)
                .filter(
                    InvReorderAlert.item_id == item.id,
                    InvReorderAlert.status.in_(["new", "acknowledged"]),
                )
                .first()
            )
            if not existing:
                safety = Decimal(str(item.safety_stock_qty or 0))
                target = Decimal(str(item.target_days_supply or 30))
                suggested = max(Decimal("0"), reorder_point + safety - current_stock)
                alert = InvReorderAlert(
                    item_id=item.id,
                    current_stock=current_stock,
                    reorder_level=reorder_point,
                    suggested_quantity=suggested,
                )
                db.add(alert)
                alerts.append(alert)

    db.flush()
    return alerts


def list_reorder_alerts(db: Session, *, status: str | None = None) -> list[InvReorderAlert]:
    q = db.query(InvReorderAlert)
    if status:
        q = q.filter(InvReorderAlert.status == status)
    return q.order_by(InvReorderAlert.generated_at.desc()).all()


def generate_forecast(db: Session, item_id: int, periods: int = 6) -> list[InvDemandForecast]:
    """Simple moving average forecast based on historical consumption."""
    now = date.today()
    forecasts = []

    # Get historical issued quantities by month
    history = []
    for i in range(12, 0, -1):
        month_start = (now.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        issued = (
            db.query(func.coalesce(func.sum(InvTransactionLine.quantity), 0))
            .join(InvTransactionHeader)
            .filter(
                InvTransactionLine.item_id == item_id,
                InvTransactionHeader.transaction_type == "goods_issue",
                InvTransactionHeader.transaction_date >= month_start,
                InvTransactionHeader.transaction_date < month_end,
            )
            .scalar()
        )
        history.append(Decimal(str(issued or 0)))

    # Simple moving average (last 3 months)
    recent = history[-3:] if len(history) >= 3 else history
    avg = sum(recent) / len(recent) if recent else Decimal("0")

    for i in range(1, periods + 1):
        forecast_date = (now + timedelta(days=i * 30))
        forecast = InvDemandForecast(
            item_id=item_id,
            period_year=forecast_date.year,
            period_month=forecast_date.month,
            forecast_method="simple_moving_average",
            forecast_quantity=avg,
            parameters={"lookback_months": 3, "history": [str(h) for h in history]},
        )
        db.add(forecast)
        forecasts.append(forecast)

    db.flush()
    return forecasts


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def _get_setting(db: Session, key: str, default: str = "") -> str:
    setting = db.query(InvSetting).filter(InvSetting.key == key).first()
    return setting.value if setting else default


def get_all_settings(db: Session) -> list[InvSetting]:
    return db.query(InvSetting).order_by(InvSetting.key).all()


def update_setting(db: Session, key: str, value: str) -> InvSetting:
    setting = db.query(InvSetting).filter(InvSetting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = InvSetting(key=key, value=value)
        db.add(setting)
    db.flush()
    return setting
