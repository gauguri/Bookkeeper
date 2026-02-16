from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import Invoice, Payment

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
