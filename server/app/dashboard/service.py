from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.ar.service import get_cash_forecast
from app.backlog.service import get_backlog_items, get_backlog_summary
from app.models import Invoice, InvoiceLine, Inventory, Payment, SalesRequest

OPEN_STATUSES = ("SENT", "SHIPPED", "PARTIALLY_PAID")
REVENUE_STATUSES = ("SENT", "PAID")


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _month_range(as_of: date, months: int) -> List[date]:
    current_month = _month_start(as_of)
    return [_add_months(current_month, offset) for offset in range(-(months - 1), 1)]


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _month_expression(db: Session, column):
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        return func.strftime("%Y-%m", column)
    return func.to_char(func.date_trunc("month", column), "YYYY-MM")


def _trend_from_rows(months: List[date], rows: List[tuple]) -> List[dict]:
    lookup: Dict[str, Decimal] = {row[0]: Decimal(row[1]) for row in rows}
    return [{"month": _month_key(month), "value": lookup.get(_month_key(month), Decimal("0.00"))} for month in months]


def get_revenue_dashboard_metrics(
    db: Session,
    months: int = 7,
    basis: str = "cash",
    company_id: Optional[int] = None,
    as_of: Optional[date] = None,
) -> dict:
    del company_id
    if months <= 0:
        raise ValueError("Months must be greater than zero.")
    if basis not in {"cash", "accrual"}:
        raise ValueError("Basis must be cash or accrual.")

    today = as_of or datetime.utcnow().date()
    year_start = date(today.year, 1, 1)
    month_start = _month_start(today)
    next_month_start = _add_months(month_start, 1)

    total_revenue_ytd = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= today)
        .scalar()
    )

    outstanding_expression = case(
        (Invoice.amount_due < 0, 0),
        else_=Invoice.amount_due,
    )
    outstanding_ar = (
        db.query(func.coalesce(func.sum(outstanding_expression), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .scalar()
    )

    paid_this_month = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.payment_date >= month_start, Payment.payment_date < next_month_start)
        .scalar()
    )

    open_invoices_count = (
        db.query(func.count(Invoice.id)).filter(Invoice.status.in_(OPEN_STATUSES)).scalar()
    )

    month_range = _month_range(today, months)
    trend_start = month_range[0]
    trend_end = _add_months(month_range[-1], 1)
    if basis == "cash":
        month_expression = _month_expression(db, Payment.payment_date)
        rows = (
            db.query(month_expression.label("month"), func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.payment_date >= trend_start, Payment.payment_date < trend_end)
            .group_by("month")
            .order_by("month")
            .all()
        )
    else:
        month_expression = _month_expression(db, Invoice.issue_date)
        rows = (
            db.query(month_expression.label("month"), func.coalesce(func.sum(Invoice.total), 0))
            .filter(Invoice.status == "PAID")
            .filter(Invoice.issue_date >= trend_start, Invoice.issue_date < trend_end)
            .group_by("month")
            .order_by("month")
            .all()
        )

    revenue_trend = _trend_from_rows(month_range, rows)

    return {
        "total_revenue_ytd": Decimal(total_revenue_ytd or 0),
        "outstanding_ar": Decimal(outstanding_ar or 0),
        "paid_this_month": Decimal(paid_this_month or 0),
        "open_invoices_count": int(open_invoices_count or 0),
        "revenue_trend": revenue_trend,
    }


def get_owner_cockpit_metrics(db: Session, as_of: Optional[date] = None) -> dict:
    today = as_of or datetime.utcnow().date()
    month_start = _month_start(today)
    year_start = date(today.year, 1, 1)

    revenue_mtd = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= month_start, Invoice.issue_date <= today)
        .scalar()
    )
    revenue_ytd = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= today)
        .scalar()
    )

    margin_revenue, margin_cost = (
        db.query(
            func.coalesce(func.sum(InvoiceLine.line_total), 0),
            func.coalesce(func.sum(InvoiceLine.quantity * InvoiceLine.landed_unit_cost), 0),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= today)
        .one()
    )
    margin_revenue = Decimal(margin_revenue or 0)
    margin_cost = Decimal(margin_cost or 0)
    gross_margin_pct = Decimal("0.00")
    if margin_revenue > 0:
        gross_margin_pct = ((margin_revenue - margin_cost) / margin_revenue) * Decimal("100")

    inventory_value = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (Inventory.total_value.is_not(None), Inventory.total_value),
                        else_=(Inventory.quantity_on_hand * Inventory.landed_unit_cost),
                    )
                ),
                0,
            )
        )
        .scalar()
    )

    ar_total = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .scalar()
    )

    overdue_90_plus = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .filter(Invoice.due_date <= (today - timedelta(days=90)))
        .scalar()
    )

    cash_forecast = get_cash_forecast(db, weeks=5)
    horizon_end = today + timedelta(days=30)
    cash_forecast_30_days = sum(
        (Decimal(bucket["net"]) for bucket in cash_forecast["buckets"] if bucket["week_start"] <= horizon_end),
        Decimal("0"),
    )

    backlog_summary = get_backlog_summary(db)
    top_shortages = [
        {
            "item_id": row.item_id,
            "item_name": row.item_name,
            "shortage_qty": row.shortage_qty,
            "backlog_qty": row.backlog_qty,
            "next_inbound_eta": row.next_inbound_eta,
        }
        for row in get_backlog_items(db)
        if row.shortage_qty > 0
    ][:5]

    # --- DSO (Days Sales Outstanding) ---
    # Average days between invoice issue_date and payment_date for paid invoices YTD.
    paid_invoices = (
        db.query(Invoice.issue_date, func.min(Payment.payment_date).label("paid_date"))
        .join(Payment, Payment.invoice_id == Invoice.id)
        .filter(Invoice.status == "PAID")
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= today)
        .group_by(Invoice.id, Invoice.issue_date)
        .all()
    )
    if paid_invoices:
        total_days = sum((row.paid_date - row.issue_date).days for row in paid_invoices)
        dso_days = Decimal(total_days) / Decimal(len(paid_invoices))
    else:
        dso_days = Decimal("0")

    # --- Order Fulfillment Rate ---
    # % of sales requests created YTD that reached INVOICED or beyond.
    fulfilled_statuses = {"INVOICED", "SHIPPED", "CLOSED"}
    total_srs_ytd = (
        db.query(func.count(SalesRequest.id))
        .filter(SalesRequest.created_at >= datetime.combine(year_start, datetime.min.time()))
        .scalar()
    ) or 0
    fulfilled_srs_ytd = (
        db.query(func.count(SalesRequest.id))
        .filter(SalesRequest.created_at >= datetime.combine(year_start, datetime.min.time()))
        .filter(SalesRequest.status.in_(fulfilled_statuses))
        .scalar()
    ) or 0
    fulfillment_rate_pct = (
        (Decimal(fulfilled_srs_ytd) / Decimal(total_srs_ytd) * Decimal("100"))
        if total_srs_ytd > 0
        else Decimal("0")
    )

    # --- A/R Collection Rate ---
    # Total payments collected YTD / Total revenue invoiced YTD.
    payments_collected_ytd = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.payment_date >= year_start, Payment.payment_date <= today)
        .scalar()
    )
    revenue_ytd_decimal = Decimal(revenue_ytd or 0)
    collection_rate_pct = (
        (Decimal(payments_collected_ytd or 0) / revenue_ytd_decimal * Decimal("100"))
        if revenue_ytd_decimal > 0
        else Decimal("0")
    )

    # --- Inventory Turnover ---
    # COGS YTD / Average inventory value.  Higher = faster turnover.
    avg_inventory = Decimal(inventory_value or 0)
    inventory_turnover = (
        (margin_cost / avg_inventory)
        if avg_inventory > 0
        else Decimal("0")
    )

    return {
        "revenue": Decimal(revenue_ytd or 0),
        "revenue_mtd": Decimal(revenue_mtd or 0),
        "revenue_ytd": Decimal(revenue_ytd or 0),
        "gross_margin_pct": gross_margin_pct.quantize(Decimal("0.01")),
        "inventory_value": Decimal(inventory_value or 0),
        "inventory_value_total": Decimal(inventory_value or 0),
        "ar_total": Decimal(ar_total or 0),
        "ar_90_plus": Decimal(overdue_90_plus or 0),
        "cash_forecast_30d": cash_forecast_30_days.quantize(Decimal("0.01")),
        "backlog_value": backlog_summary.total_backlog_value,
        "top_shortages": top_shortages,
        "dso_days": dso_days.quantize(Decimal("0.1")),
        "fulfillment_rate_pct": fulfillment_rate_pct.quantize(Decimal("0.1")),
        "collection_rate_pct": min(collection_rate_pct, Decimal("100")).quantize(Decimal("0.1")),
        "inventory_turnover": inventory_turnover.quantize(Decimal("0.1")),
    }
