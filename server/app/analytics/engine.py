"""Core analytics computation engine.

Provides time-series aggregation, rolling averages, trend detection,
variance analysis, and anomaly detection primitives.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import Invoice, InvoiceLine, JournalEntry, JournalLine, Payment

# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

Granularity = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]


def period_start(d: date, granularity: Granularity) -> date:
    if granularity == "daily":
        return d
    if granularity == "weekly":
        return d - timedelta(days=d.weekday())  # Monday
    if granularity == "monthly":
        return date(d.year, d.month, 1)
    if granularity == "quarterly":
        q = (d.month - 1) // 3
        return date(d.year, q * 3 + 1, 1)
    # yearly
    return date(d.year, 1, 1)


def add_periods(d: date, n: int, granularity: Granularity) -> date:
    if granularity == "daily":
        return d + timedelta(days=n)
    if granularity == "weekly":
        return d + timedelta(weeks=n)
    if granularity == "monthly":
        return _add_months(d, n)
    if granularity == "quarterly":
        return _add_months(d, n * 3)
    # yearly
    return _add_months(d, n * 12)


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, 1)


def generate_period_range(
    start: date, end: date, granularity: Granularity
) -> List[date]:
    periods: List[date] = []
    current = period_start(start, granularity)
    while current <= end:
        periods.append(current)
        current = add_periods(current, 1, granularity)
    return periods


def period_label(d: date, granularity: Granularity) -> str:
    if granularity == "daily":
        return d.isoformat()
    if granularity == "weekly":
        return f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"
    if granularity == "monthly":
        return d.strftime("%Y-%m")
    if granularity == "quarterly":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    return str(d.year)


# ---------------------------------------------------------------------------
# Dialect-aware SQL date truncation
# ---------------------------------------------------------------------------


def _trunc_expr(db: Session, column, granularity: Granularity):
    dialect = db.get_bind().dialect.name
    if granularity == "daily":
        if dialect == "sqlite":
            return func.date(column)
        return func.date_trunc("day", column).cast(db.get_bind().dialect)
    if granularity == "weekly":
        if dialect == "sqlite":
            return func.date(column, "weekday 1", "-7 days")
        return func.date_trunc("week", column)
    if granularity == "monthly":
        if dialect == "sqlite":
            return func.strftime("%Y-%m-01", column)
        return func.date_trunc("month", column)
    if granularity == "quarterly":
        if dialect == "sqlite":
            return func.strftime("%Y-", column)  # imprecise; use month_key
        return func.date_trunc("quarter", column)
    # yearly
    if dialect == "sqlite":
        return func.strftime("%Y-01-01", column)
    return func.date_trunc("year", column)


def month_expression(db: Session, column):
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        return func.strftime("%Y-%m", column)
    return func.to_char(func.date_trunc("month", column), "YYYY-MM")


# ---------------------------------------------------------------------------
# Time-series aggregation
# ---------------------------------------------------------------------------


def aggregate_time_series(
    values: List[Tuple[str, float]],
    period_labels: List[str],
) -> List[Dict[str, Any]]:
    lookup = {label: val for label, val in values}
    return [
        {"period": label, "value": lookup.get(label, 0.0)} for label in period_labels
    ]


# ---------------------------------------------------------------------------
# Rolling averages
# ---------------------------------------------------------------------------


def rolling_average(values: Sequence[float], window: int) -> List[Optional[float]]:
    result: List[Optional[float]] = []
    for i in range(len(values)):
        if i < window - 1:
            result.append(None)
        else:
            window_vals = values[i - window + 1 : i + 1]
            result.append(sum(window_vals) / window)
    return result


# ---------------------------------------------------------------------------
# Period-over-period comparison
# ---------------------------------------------------------------------------


def period_comparison(
    current_value: float,
    previous_value: float,
) -> Dict[str, Any]:
    change_absolute = current_value - previous_value
    if previous_value != 0:
        change_percent = (change_absolute / abs(previous_value)) * 100
    else:
        change_percent = 100.0 if current_value > 0 else 0.0

    direction = "up" if change_absolute > 0 else ("down" if change_absolute < 0 else "flat")
    return {
        "current_value": current_value,
        "previous_value": previous_value,
        "change_absolute": round(change_absolute, 2),
        "change_percent": round(change_percent, 2),
        "direction": direction,
    }


# ---------------------------------------------------------------------------
# Variance analysis
# ---------------------------------------------------------------------------


def variance_analysis(
    actual: float,
    target: float,
    label: str = "",
) -> Dict[str, Any]:
    variance_abs = actual - target
    variance_pct = ((actual - target) / abs(target) * 100) if target != 0 else 0.0
    favorable = variance_abs >= 0
    return {
        "label": label,
        "actual": round(actual, 2),
        "target": round(target, 2),
        "variance_absolute": round(variance_abs, 2),
        "variance_percent": round(variance_pct, 2),
        "favorable": favorable,
    }


# ---------------------------------------------------------------------------
# Trend detection (linear regression slope)
# ---------------------------------------------------------------------------


def linear_trend(values: Sequence[float]) -> Dict[str, Any]:
    n = len(values)
    if n < 2:
        return {"slope": 0.0, "direction": "flat", "r_squared": 0.0}

    x_vals = list(range(n))
    x_mean = sum(x_vals) / n
    y_mean = sum(values) / n

    ss_xy = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, values))
    ss_xx = sum((x - x_mean) ** 2 for x in x_vals)
    ss_yy = sum((y - y_mean) ** 2 for y in values)

    if ss_xx == 0:
        return {"slope": 0.0, "direction": "flat", "r_squared": 0.0}

    slope = ss_xy / ss_xx
    r_squared = (ss_xy**2 / (ss_xx * ss_yy)) if ss_yy != 0 else 0.0

    direction = "up" if slope > 0.01 else ("down" if slope < -0.01 else "flat")
    return {
        "slope": round(slope, 4),
        "direction": direction,
        "r_squared": round(r_squared, 4),
    }


# ---------------------------------------------------------------------------
# Anomaly detection (Z-score)
# ---------------------------------------------------------------------------


def detect_anomalies(
    values: Sequence[float],
    labels: Optional[Sequence[str]] = None,
    threshold: float = 2.5,
) -> List[Dict[str, Any]]:
    if len(values) < 3:
        return []

    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std_dev = math.sqrt(variance) if variance > 0 else 0.0

    if std_dev == 0:
        return []

    anomalies: List[Dict[str, Any]] = []
    for i, v in enumerate(values):
        z_score = abs(v - mean) / std_dev
        if z_score >= threshold:
            anomalies.append(
                {
                    "index": i,
                    "label": labels[i] if labels else str(i),
                    "value": v,
                    "z_score": round(z_score, 2),
                    "severity": "high" if z_score >= 3.5 else "medium",
                    "direction": "above" if v > mean else "below",
                    "mean": round(mean, 2),
                    "std_dev": round(std_dev, 2),
                }
            )
    return anomalies


# ---------------------------------------------------------------------------
# Account balance helpers
# ---------------------------------------------------------------------------

OPEN_STATUSES = ("SENT", "SHIPPED", "PARTIALLY_PAID")
REVENUE_STATUSES = ("SENT", "SHIPPED", "PARTIALLY_PAID", "PAID")


def get_account_balance(
    db: Session,
    account_id: int,
    as_of: Optional[date] = None,
) -> Decimal:
    q = (
        db.query(
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .filter(JournalLine.account_id == account_id)
    )
    if as_of:
        q = q.filter(JournalEntry.txn_date <= as_of)
    row = q.one()
    return Decimal(str(row[0])) - Decimal(str(row[1]))


def get_account_balances_by_type(
    db: Session,
    account_type: str,
    as_of: Optional[date] = None,
) -> Decimal:
    from app.models import Account

    q = (
        db.query(
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(Account.type == account_type)
    )
    if as_of:
        q = q.filter(JournalEntry.txn_date <= as_of)
    row = q.one()
    total_debit = Decimal(str(row[0]))
    total_credit = Decimal(str(row[1]))

    if account_type in ("ASSET", "EXPENSE", "COGS"):
        return total_debit - total_credit
    return total_credit - total_debit


def get_revenue_for_period(
    db: Session,
    start_date: date,
    end_date: date,
) -> Decimal:
    result = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .scalar()
    )
    return Decimal(str(result or 0))


def get_cogs_for_period(
    db: Session,
    start_date: date,
    end_date: date,
) -> Decimal:
    result = (
        db.query(
            func.coalesce(func.sum(InvoiceLine.quantity * InvoiceLine.landed_unit_cost), 0)
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .scalar()
    )
    return Decimal(str(result or 0))


def get_payments_for_period(
    db: Session,
    start_date: date,
    end_date: date,
) -> Decimal:
    result = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)
        .scalar()
    )
    return Decimal(str(result or 0))


def get_revenue_trend(
    db: Session,
    start_date: date,
    end_date: date,
    granularity: Granularity = "monthly",
) -> List[Dict[str, Any]]:
    me = month_expression(db, Invoice.issue_date)
    rows = (
        db.query(me.label("period"), func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .group_by("period")
        .order_by("period")
        .all()
    )
    periods = generate_period_range(start_date, end_date, granularity)
    labels = [period_label(p, granularity) for p in periods]
    lookup = {str(row[0]): float(row[1]) for row in rows}
    return [{"period": lbl, "value": lookup.get(lbl, 0.0)} for lbl in labels]


def get_expense_trend(
    db: Session,
    start_date: date,
    end_date: date,
) -> List[Dict[str, Any]]:
    from app.models import Account

    me = month_expression(db, JournalEntry.txn_date)
    rows = (
        db.query(me.label("period"), func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(Account.type == "EXPENSE")
        .filter(JournalEntry.txn_date >= start_date, JournalEntry.txn_date <= end_date)
        .group_by("period")
        .order_by("period")
        .all()
    )
    periods = generate_period_range(start_date, end_date, "monthly")
    labels = [period_label(p, "monthly") for p in periods]
    lookup = {str(row[0]): float(row[1]) for row in rows}
    return [{"period": lbl, "value": lookup.get(lbl, 0.0)} for lbl in labels]
