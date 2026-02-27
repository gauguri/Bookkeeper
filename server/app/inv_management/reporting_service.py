"""Reporting and analytics services for the inventory module."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    InvBatch,
    InvCountPlan,
    InvReorderAlert,
    InvStockOnHand,
    InvTransactionHeader,
    InvTransactionLine,
    InvValuationConfig,
    InvWarehouse,
    Item,
)


def get_stock_overview(
    db: Session,
    *,
    warehouse_id: int | None = None,
    item_id: int | None = None,
) -> list[dict]:
    """Stock overview with quantities broken down by stock type."""
    q = (
        db.query(
            InvStockOnHand.item_id,
            InvStockOnHand.warehouse_id,
            InvStockOnHand.stock_type,
            func.sum(InvStockOnHand.quantity).label("total_qty"),
        )
        .group_by(InvStockOnHand.item_id, InvStockOnHand.warehouse_id, InvStockOnHand.stock_type)
    )
    if warehouse_id:
        q = q.filter(InvStockOnHand.warehouse_id == warehouse_id)
    if item_id:
        q = q.filter(InvStockOnHand.item_id == item_id)

    rows = q.all()

    # Aggregate by item+warehouse
    agg: dict[tuple[int, int], dict] = {}
    for row_item_id, row_wh_id, stock_type, total_qty in rows:
        key = (row_item_id, row_wh_id)
        if key not in agg:
            item = db.query(Item).filter(Item.id == row_item_id).first()
            wh = db.query(InvWarehouse).filter(InvWarehouse.id == row_wh_id).first()
            agg[key] = {
                "item_id": row_item_id,
                "item_name": item.name if item else f"Item #{row_item_id}",
                "item_sku": item.sku if item else None,
                "warehouse_id": row_wh_id,
                "warehouse_name": wh.name if wh else f"WH #{row_wh_id}",
                "unrestricted_qty": Decimal("0"),
                "quality_qty": Decimal("0"),
                "blocked_qty": Decimal("0"),
                "in_transit_qty": Decimal("0"),
                "reserved_qty": Decimal("0"),
                "total_qty": Decimal("0"),
            }
        qty = Decimal(str(total_qty or 0))
        entry = agg[key]
        entry["total_qty"] += qty
        if stock_type == "unrestricted":
            entry["unrestricted_qty"] += qty
        elif stock_type == "quality_inspection":
            entry["quality_qty"] += qty
        elif stock_type == "blocked":
            entry["blocked_qty"] += qty
        elif stock_type == "in_transit":
            entry["in_transit_qty"] += qty
        elif stock_type == "reserved":
            entry["reserved_qty"] += qty

    # Add unit cost and total value
    result = []
    for entry in agg.values():
        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == entry["item_id"]).first()
        unit_cost = Decimal(str(config.moving_average_cost or 0)) if config else Decimal("0")
        entry["unit_cost"] = unit_cost
        entry["total_value"] = entry["total_qty"] * unit_cost
        result.append(entry)

    return sorted(result, key=lambda x: x["item_name"])


def get_dashboard_kpis(db: Session) -> dict:
    """Dashboard KPI aggregation."""
    # Total stock value
    stock_rows = (
        db.query(InvStockOnHand.item_id, func.sum(InvStockOnHand.quantity).label("qty"))
        .group_by(InvStockOnHand.item_id)
        .all()
    )
    total_value = Decimal("0")
    stockout_count = 0
    below_reorder_count = 0
    total_items = len(stock_rows)

    for s_item_id, qty in stock_rows:
        total_qty = Decimal(str(qty or 0))
        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == s_item_id).first()
        unit_cost = Decimal(str(config.moving_average_cost or 0)) if config else Decimal("0")
        total_value += total_qty * unit_cost

        if total_qty <= 0:
            stockout_count += 1

        item = db.query(Item).filter(Item.id == s_item_id).first()
        if item and item.reorder_point and total_qty <= Decimal(str(item.reorder_point or 0)):
            below_reorder_count += 1

    # Pending receipts
    pending_receipts = (
        db.query(func.count(InvTransactionHeader.id))
        .filter(InvTransactionHeader.status == "draft", InvTransactionHeader.transaction_type == "goods_receipt")
        .scalar() or 0
    )

    # Expiring soon (30 days)
    cutoff = date.today() + timedelta(days=30)
    expiring_soon = (
        db.query(func.count(InvBatch.id))
        .filter(
            InvBatch.expiry_date.isnot(None),
            InvBatch.expiry_date <= cutoff,
            InvBatch.expiry_date >= date.today(),
            InvBatch.status != "expired",
        )
        .scalar() or 0
    )

    warehouse_count = db.query(func.count(InvWarehouse.id)).filter(InvWarehouse.is_active.is_(True)).scalar() or 0

    return {
        "total_stock_value": total_value,
        "total_items": total_items,
        "stockout_count": stockout_count,
        "below_reorder_count": below_reorder_count,
        "pending_receipts": pending_receipts,
        "expiring_soon": expiring_soon,
        "warehouse_count": warehouse_count,
    }


def get_inventory_turnover(
    db: Session,
    *,
    item_id: int | None = None,
    days: int = 365,
) -> list[dict]:
    """Calculate inventory turnover ratio and days on hand."""
    since = date.today() - timedelta(days=days)

    # Get total issued quantity per item in the period
    issue_q = (
        db.query(
            InvTransactionLine.item_id,
            func.sum(InvTransactionLine.quantity).label("issued_qty"),
            func.sum(InvTransactionLine.total_cost).label("issued_value"),
        )
        .join(InvTransactionHeader)
        .filter(
            InvTransactionHeader.transaction_type == "goods_issue",
            InvTransactionHeader.status == "posted",
            InvTransactionHeader.transaction_date >= since,
        )
    )
    if item_id:
        issue_q = issue_q.filter(InvTransactionLine.item_id == item_id)
    issue_q = issue_q.group_by(InvTransactionLine.item_id)

    results = []
    for row_item_id, issued_qty, issued_value in issue_q.all():
        issued_qty = Decimal(str(issued_qty or 0))
        issued_value = Decimal(str(issued_value or 0))

        # Current stock
        current_stock = (
            db.query(func.coalesce(func.sum(InvStockOnHand.quantity), 0))
            .filter(InvStockOnHand.item_id == row_item_id)
            .scalar()
        )
        current_stock = Decimal(str(current_stock or 0))

        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == row_item_id).first()
        unit_cost = Decimal(str(config.moving_average_cost or 0)) if config else Decimal("0")
        avg_inventory = current_stock * unit_cost

        turnover = Decimal("0")
        doh = Decimal("0")
        if avg_inventory > 0:
            turnover = issued_value / avg_inventory
            doh = Decimal(days) / turnover if turnover > 0 else Decimal("0")

        item = db.query(Item).filter(Item.id == row_item_id).first()
        results.append({
            "item_id": row_item_id,
            "item_name": item.name if item else f"Item #{row_item_id}",
            "issued_qty": issued_qty,
            "issued_value": issued_value,
            "current_stock": current_stock,
            "avg_inventory_value": avg_inventory,
            "turnover_ratio": turnover,
            "days_on_hand": doh,
        })

    return sorted(results, key=lambda x: x["turnover_ratio"], reverse=True)


def get_slow_moving_items(db: Session, *, days: int = 90) -> list[dict]:
    """Items with no goods issue transactions in N days."""
    since = date.today() - timedelta(days=days)

    # Items that have stock but no recent issues
    items_with_stock = (
        db.query(InvStockOnHand.item_id, func.sum(InvStockOnHand.quantity).label("qty"))
        .group_by(InvStockOnHand.item_id)
        .having(func.sum(InvStockOnHand.quantity) > 0)
        .all()
    )

    # Items with recent issues
    recent_issue_items = set(
        r[0] for r in
        db.query(InvTransactionLine.item_id)
        .join(InvTransactionHeader)
        .filter(
            InvTransactionHeader.transaction_type == "goods_issue",
            InvTransactionHeader.transaction_date >= since,
        )
        .distinct()
        .all()
    )

    results = []
    for s_item_id, qty in items_with_stock:
        if s_item_id not in recent_issue_items:
            item = db.query(Item).filter(Item.id == s_item_id).first()
            config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == s_item_id).first()
            unit_cost = Decimal(str(config.moving_average_cost or 0)) if config else Decimal("0")
            stock_qty = Decimal(str(qty or 0))
            results.append({
                "item_id": s_item_id,
                "item_name": item.name if item else f"Item #{s_item_id}",
                "stock_qty": stock_qty,
                "stock_value": stock_qty * unit_cost,
                "days_since_last_movement": days,
            })

    return sorted(results, key=lambda x: x["stock_value"], reverse=True)


def get_transaction_history(
    db: Session,
    *,
    item_id: int | None = None,
    warehouse_id: int | None = None,
    page: int = 1,
    limit: int = 25,
) -> tuple[list[dict], int]:
    """Full audit trail of transactions."""
    q = db.query(InvTransactionHeader)
    if item_id:
        q = q.join(InvTransactionLine).filter(InvTransactionLine.item_id == item_id)
    if warehouse_id:
        q = q.filter(
            (InvTransactionHeader.source_warehouse_id == warehouse_id)
            | (InvTransactionHeader.destination_warehouse_id == warehouse_id)
        )

    total = q.count()
    headers = q.order_by(InvTransactionHeader.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    results = []
    for h in headers:
        results.append({
            "id": h.id,
            "transaction_number": h.transaction_number,
            "transaction_type": h.transaction_type,
            "reference_number": h.reference_number,
            "transaction_date": h.transaction_date.isoformat() if h.transaction_date else None,
            "status": h.status,
            "line_count": len(h.lines) if h.lines else 0,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        })

    return results, total
