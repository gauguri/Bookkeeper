"""Pre-built KPI library.

Provides calculation functions for financial health, AR, AP, revenue,
expense, and cash flow KPIs. Each function returns a standardized KPI
result dict suitable for the analytics API.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Customer,
    Inventory,
    Invoice,
    InvoiceLine,
    Item,
    JournalEntry,
    JournalLine,
    Payment,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
)

from .engine import (
    OPEN_STATUSES,
    REVENUE_STATUSES,
    get_account_balances_by_type,
    get_cogs_for_period,
    get_payments_for_period,
    get_revenue_for_period,
    get_revenue_trend,
    linear_trend,
    month_expression,
    period_comparison,
)

D = Decimal
ZERO = D("0")
HUNDRED = D("100")


def _safe_div(num: Decimal, denom: Decimal) -> Decimal:
    if denom == 0:
        return ZERO
    return num / denom


def _quantize(val: Decimal, places: str = "0.01") -> Decimal:
    return val.quantize(D(places))


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, 1)


# ---------------------------------------------------------------------------
# KPI Registry
# ---------------------------------------------------------------------------

KPI_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    # Financial Health
    "current_ratio": {"label": "Current Ratio", "category": "financial_health", "unit": "ratio", "target": 2.0, "warning_below": 1.5, "critical_below": 1.0},
    "quick_ratio": {"label": "Quick Ratio", "category": "financial_health", "unit": "ratio", "target": 1.0, "warning_below": 0.8, "critical_below": 0.5},
    "working_capital": {"label": "Working Capital", "category": "financial_health", "unit": "currency", "target": None},
    "debt_to_equity": {"label": "Debt-to-Equity Ratio", "category": "financial_health", "unit": "ratio", "target": 1.5, "warning_above": 2.0, "critical_above": 3.0},
    "net_profit_margin": {"label": "Net Profit Margin", "category": "financial_health", "unit": "percent", "target": 15.0},
    "gross_profit_margin": {"label": "Gross Profit Margin", "category": "financial_health", "unit": "percent", "target": 40.0},
    "operating_expense_ratio": {"label": "Operating Expense Ratio", "category": "financial_health", "unit": "percent", "target": None},
    "roa": {"label": "Return on Assets", "category": "financial_health", "unit": "percent", "target": 5.0},
    "roe": {"label": "Return on Equity", "category": "financial_health", "unit": "percent", "target": 15.0},
    "ebitda": {"label": "EBITDA", "category": "financial_health", "unit": "currency", "target": None},
    # Cash Flow
    "operating_cash_flow": {"label": "Operating Cash Flow", "category": "cash_flow", "unit": "currency", "target": None},
    "free_cash_flow": {"label": "Free Cash Flow", "category": "cash_flow", "unit": "currency", "target": None},
    "cash_burn_rate": {"label": "Cash Burn Rate", "category": "cash_flow", "unit": "currency", "target": None},
    "cash_runway": {"label": "Cash Runway", "category": "cash_flow", "unit": "months", "target": 12.0, "warning_below": 6.0, "critical_below": 3.0},
    # Accounts Receivable
    "dso": {"label": "Days Sales Outstanding", "category": "receivables", "unit": "days", "target": 30.0, "warning_above": 45.0, "critical_above": 60.0},
    "ar_total": {"label": "A/R Total Outstanding", "category": "receivables", "unit": "currency", "target": None},
    "collection_effectiveness": {"label": "Collection Effectiveness Index", "category": "receivables", "unit": "percent", "target": 80.0},
    "average_invoice_value": {"label": "Average Invoice Value", "category": "receivables", "unit": "currency", "target": None},
    "overdue_receivables": {"label": "Overdue Receivables", "category": "receivables", "unit": "currency", "target": 0.0},
    # Accounts Payable
    "dpo": {"label": "Days Payable Outstanding", "category": "payables", "unit": "days", "target": 30.0},
    "ap_total": {"label": "A/P Total Outstanding", "category": "payables", "unit": "currency", "target": None},
    "on_time_payment_rate": {"label": "On-Time Payment Rate", "category": "payables", "unit": "percent", "target": 95.0},
    # Revenue
    "revenue_mtd": {"label": "Revenue MTD", "category": "revenue", "unit": "currency", "target": None},
    "revenue_ytd": {"label": "Revenue YTD", "category": "revenue", "unit": "currency", "target": None},
    "revenue_growth_mom": {"label": "Revenue Growth (MoM)", "category": "revenue", "unit": "percent", "target": None},
    "revenue_growth_yoy": {"label": "Revenue Growth (YoY)", "category": "revenue", "unit": "percent", "target": None},
    "avg_revenue_per_customer": {"label": "Avg Revenue Per Customer", "category": "revenue", "unit": "currency", "target": None},
    # Expenses
    "total_operating_expenses": {"label": "Total Operating Expenses", "category": "expenses", "unit": "currency", "target": None},
    "expense_growth_rate": {"label": "Expense Growth Rate", "category": "expenses", "unit": "percent", "target": None},
    "cogs_total": {"label": "Cost of Goods Sold", "category": "expenses", "unit": "currency", "target": None},
}


def get_kpi_status(kpi_key: str, value: float) -> str:
    defn = KPI_DEFINITIONS.get(kpi_key, {})
    if "critical_below" in defn and value < defn["critical_below"]:
        return "critical"
    if "warning_below" in defn and value < defn["warning_below"]:
        return "warning"
    if "critical_above" in defn and value > defn["critical_above"]:
        return "critical"
    if "warning_above" in defn and value > defn["warning_above"]:
        return "warning"
    return "good"


def _build_kpi_result(
    kpi_key: str,
    current_value: float,
    previous_value: float = 0.0,
    sparkline: Optional[List[float]] = None,
    period: str = "",
    comparison_period: str = "",
    drill_down_url: str = "",
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    defn = KPI_DEFINITIONS.get(kpi_key, {})
    comp = period_comparison(current_value, previous_value)
    result = {
        "kpi_key": kpi_key,
        "label": defn.get("label", kpi_key),
        "category": defn.get("category", ""),
        "current_value": round(current_value, 2),
        "previous_value": round(previous_value, 2),
        "change_absolute": comp["change_absolute"],
        "change_percent": comp["change_percent"],
        "direction": comp["direction"],
        "status": get_kpi_status(kpi_key, current_value),
        "target_value": defn.get("target"),
        "sparkline": sparkline or [],
        "period": period,
        "comparison_period": comparison_period,
        "unit": defn.get("unit", ""),
        "drill_down_url": drill_down_url,
    }
    if extra:
        result.update(extra)
    return result


# ---------------------------------------------------------------------------
# Financial Health KPIs
# ---------------------------------------------------------------------------


def calc_current_ratio(db: Session, as_of: date) -> Dict[str, Any]:
    current_assets = float(get_account_balances_by_type(db, "ASSET", as_of))
    current_liabilities = float(abs(get_account_balances_by_type(db, "LIABILITY", as_of)))
    value = current_assets / current_liabilities if current_liabilities else 0.0
    return _build_kpi_result("current_ratio", value,
                             drill_down_url="/api/analytics/financial-health")


def calc_quick_ratio(db: Session, as_of: date) -> Dict[str, Any]:
    current_assets = float(get_account_balances_by_type(db, "ASSET", as_of))
    inv_value = float(
        db.query(func.coalesce(func.sum(Inventory.total_value), 0)).scalar() or 0
    )
    current_liabilities = float(abs(get_account_balances_by_type(db, "LIABILITY", as_of)))
    value = (current_assets - inv_value) / current_liabilities if current_liabilities else 0.0
    return _build_kpi_result("quick_ratio", value,
                             drill_down_url="/api/analytics/financial-health")


def calc_working_capital(db: Session, as_of: date) -> Dict[str, Any]:
    current_assets = float(get_account_balances_by_type(db, "ASSET", as_of))
    current_liabilities = float(abs(get_account_balances_by_type(db, "LIABILITY", as_of)))
    value = current_assets - current_liabilities
    return _build_kpi_result("working_capital", value,
                             drill_down_url="/api/analytics/financial-health")


def calc_gross_profit_margin(db: Session, start: date, end: date) -> Dict[str, Any]:
    revenue = float(get_revenue_for_period(db, start, end))
    cogs = float(get_cogs_for_period(db, start, end))
    value = ((revenue - cogs) / revenue * 100) if revenue else 0.0

    prev_start = _add_months(start, -((end.month - start.month) or 1))
    prev_end = start - timedelta(days=1)
    prev_revenue = float(get_revenue_for_period(db, prev_start, prev_end))
    prev_cogs = float(get_cogs_for_period(db, prev_start, prev_end))
    prev_value = ((prev_revenue - prev_cogs) / prev_revenue * 100) if prev_revenue else 0.0

    return _build_kpi_result("gross_profit_margin", value, prev_value,
                             drill_down_url="/api/analytics/pnl")


def calc_net_profit_margin(db: Session, start: date, end: date) -> Dict[str, Any]:
    revenue = float(get_revenue_for_period(db, start, end))
    cogs = float(get_cogs_for_period(db, start, end))
    expenses = float(abs(get_account_balances_by_type(db, "EXPENSE", end)))
    net_income = revenue - cogs - expenses
    value = (net_income / revenue * 100) if revenue else 0.0
    return _build_kpi_result("net_profit_margin", value,
                             drill_down_url="/api/analytics/pnl")


# ---------------------------------------------------------------------------
# Accounts Receivable KPIs
# ---------------------------------------------------------------------------


def calc_dso(db: Session, as_of: date) -> Dict[str, Any]:
    year_start = date(as_of.year, 1, 1)
    paid_invoices = (
        db.query(Invoice.issue_date, func.min(Payment.payment_date).label("paid_date"))
        .join(Payment, Payment.invoice_id == Invoice.id)
        .filter(Invoice.status == "PAID")
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= as_of)
        .group_by(Invoice.id, Invoice.issue_date)
        .all()
    )
    if paid_invoices:
        total_days = sum((row.paid_date - row.issue_date).days for row in paid_invoices)
        value = total_days / len(paid_invoices)
    else:
        value = 0.0

    # Sparkline: monthly DSO for last 6 months
    sparkline = []
    for i in range(5, -1, -1):
        m_start = _add_months(as_of, -i)
        m_end = _add_months(m_start, 1) - timedelta(days=1)
        m_paid = (
            db.query(Invoice.issue_date, func.min(Payment.payment_date).label("paid_date"))
            .join(Payment, Payment.invoice_id == Invoice.id)
            .filter(Invoice.status == "PAID")
            .filter(Invoice.issue_date >= m_start, Invoice.issue_date <= m_end)
            .group_by(Invoice.id, Invoice.issue_date)
            .all()
        )
        if m_paid:
            m_dso = sum((r.paid_date - r.issue_date).days for r in m_paid) / len(m_paid)
            sparkline.append(round(m_dso, 1))
        else:
            sparkline.append(0.0)

    return _build_kpi_result("dso", value, sparkline=sparkline,
                             drill_down_url="/api/analytics/receivables")


def calc_ar_aging(db: Session, as_of: date) -> Dict[str, Any]:
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    open_invoices = (
        db.query(Invoice.due_date, Invoice.amount_due)
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .all()
    )
    for inv in open_invoices:
        days_overdue = (as_of - inv.due_date).days
        amount = float(inv.amount_due)
        if days_overdue <= 0:
            buckets["current"] += amount
        elif days_overdue <= 30:
            buckets["1_30"] += amount
        elif days_overdue <= 60:
            buckets["31_60"] += amount
        elif days_overdue <= 90:
            buckets["61_90"] += amount
        else:
            buckets["90_plus"] += amount

    total = sum(buckets.values())
    return {
        "kpi_key": "ar_aging",
        "label": "A/R Aging",
        "category": "receivables",
        "total": round(total, 2),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "bucket_labels": ["Current", "1-30", "31-60", "61-90", "90+"],
        "bucket_values": [round(buckets[k], 2) for k in ["current", "1_30", "31_60", "61_90", "90_plus"]],
    }


def calc_ar_total(db: Session, as_of: date) -> Dict[str, Any]:
    total = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .scalar() or 0
    )
    return _build_kpi_result("ar_total", total,
                             drill_down_url="/api/analytics/receivables")


def calc_overdue_receivables(db: Session, as_of: date) -> Dict[str, Any]:
    total = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .filter(Invoice.due_date < as_of)
        .scalar() or 0
    )
    return _build_kpi_result("overdue_receivables", total,
                             drill_down_url="/api/analytics/receivables")


def calc_collection_effectiveness(db: Session, start: date, end: date) -> Dict[str, Any]:
    beginning_ar = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.issue_date < start)
        .scalar() or 0
    )
    credit_sales = float(get_revenue_for_period(db, start, end))
    ending_ar = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.issue_date <= end)
        .scalar() or 0
    )
    # CEI = (Beginning AR + Credit Sales - Ending AR) / (Beginning AR + Credit Sales) * 100
    denom = beginning_ar + credit_sales
    if denom > 0:
        value = ((beginning_ar + credit_sales - ending_ar) / denom) * 100
    else:
        value = 0.0
    return _build_kpi_result("collection_effectiveness", value,
                             drill_down_url="/api/analytics/receivables")


def calc_average_invoice_value(db: Session, start: date, end: date) -> Dict[str, Any]:
    result = (
        db.query(func.avg(Invoice.total))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= start, Invoice.issue_date <= end)
        .scalar()
    )
    value = float(result or 0)
    return _build_kpi_result("average_invoice_value", value,
                             drill_down_url="/api/analytics/receivables")


def calc_top_customers_by_outstanding(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
    rows = (
        db.query(
            Customer.id,
            Customer.name,
            func.coalesce(func.sum(Invoice.amount_due), 0).label("outstanding"),
        )
        .join(Invoice, Invoice.customer_id == Customer.id)
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .group_by(Customer.id, Customer.name)
        .order_by(func.sum(Invoice.amount_due).desc())
        .limit(limit)
        .all()
    )
    return [{"customer_id": r.id, "customer_name": r.name, "outstanding": float(r.outstanding)} for r in rows]


# ---------------------------------------------------------------------------
# Accounts Payable KPIs
# ---------------------------------------------------------------------------


def calc_ap_aging(db: Session, as_of: date) -> Dict[str, Any]:
    buckets = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    open_pos = (
        db.query(PurchaseOrder.order_date, PurchaseOrder.expected_date,
                 func.coalesce(func.sum(PurchaseOrderLine.landed_cost * PurchaseOrderLine.qty_ordered), 0).label("total"))
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .filter(PurchaseOrder.status.in_(("SENT", "PARTIALLY_RECEIVED")))
        .group_by(PurchaseOrder.id, PurchaseOrder.order_date, PurchaseOrder.expected_date)
        .all()
    )
    for po in open_pos:
        ref_date = po.expected_date or po.order_date
        days = (as_of - ref_date).days
        amount = float(po.total)
        if days <= 0:
            buckets["current"] += amount
        elif days <= 30:
            buckets["1_30"] += amount
        elif days <= 60:
            buckets["31_60"] += amount
        elif days <= 90:
            buckets["61_90"] += amount
        else:
            buckets["90_plus"] += amount

    total = sum(buckets.values())
    return {
        "kpi_key": "ap_aging",
        "label": "A/P Aging",
        "category": "payables",
        "total": round(total, 2),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "bucket_labels": ["Current", "1-30", "31-60", "61-90", "90+"],
        "bucket_values": [round(buckets[k], 2) for k in ["current", "1_30", "31_60", "61_90", "90_plus"]],
    }


def calc_top_vendors_by_spend(db: Session, start: date, end: date, limit: int = 10) -> List[Dict[str, Any]]:
    rows = (
        db.query(
            Supplier.id,
            Supplier.name,
            func.coalesce(func.sum(PurchaseOrderLine.landed_cost * PurchaseOrderLine.qty_ordered), 0).label("total_spend"),
        )
        .join(PurchaseOrder, PurchaseOrder.supplier_id == Supplier.id)
        .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
        .filter(PurchaseOrder.order_date >= start, PurchaseOrder.order_date <= end)
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(PurchaseOrderLine.landed_cost * PurchaseOrderLine.qty_ordered).desc())
        .limit(limit)
        .all()
    )
    return [{"vendor_id": r.id, "vendor_name": r.name, "total_spend": float(r.total_spend)} for r in rows]


# ---------------------------------------------------------------------------
# Revenue KPIs
# ---------------------------------------------------------------------------


def calc_revenue_kpis(db: Session, as_of: date) -> Dict[str, Any]:
    month_start = _month_start(as_of)
    year_start = date(as_of.year, 1, 1)
    prev_month_start = _add_months(month_start, -1)
    prev_month_end = month_start - timedelta(days=1)
    prev_year_start = date(as_of.year - 1, 1, 1)
    prev_year_end = date(as_of.year - 1, as_of.month, as_of.day)

    rev_mtd = float(get_revenue_for_period(db, month_start, as_of))
    rev_prev_month = float(get_revenue_for_period(db, prev_month_start, prev_month_end))
    rev_ytd = float(get_revenue_for_period(db, year_start, as_of))
    rev_prev_ytd = float(get_revenue_for_period(db, prev_year_start, prev_year_end))

    mom_growth = ((rev_mtd - rev_prev_month) / rev_prev_month * 100) if rev_prev_month else 0.0
    yoy_growth = ((rev_ytd - rev_prev_ytd) / rev_prev_ytd * 100) if rev_prev_ytd else 0.0

    # Revenue by category (item-based)
    by_category = (
        db.query(
            func.coalesce(Item.name, "Uncategorized").label("category"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("total"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .outerjoin(Item, Item.id == InvoiceLine.item_id)
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= as_of)
        .group_by(func.coalesce(Item.name, "Uncategorized"))
        .order_by(func.sum(InvoiceLine.line_total).desc())
        .limit(10)
        .all()
    )

    # Revenue trend (12 months)
    trend_start = _add_months(as_of, -11)
    revenue_trend = get_revenue_trend(db, trend_start, as_of)

    # Active customer count
    active_customer_count = (
        db.query(func.count(func.distinct(Invoice.customer_id)))
        .filter(Invoice.status.in_(REVENUE_STATUSES))
        .filter(Invoice.issue_date >= year_start, Invoice.issue_date <= as_of)
        .scalar() or 0
    )
    avg_rev_per_customer = rev_ytd / active_customer_count if active_customer_count else 0.0

    return {
        "revenue_mtd": _build_kpi_result("revenue_mtd", rev_mtd, rev_prev_month,
                                          sparkline=[d["value"] for d in revenue_trend[-6:]]),
        "revenue_ytd": _build_kpi_result("revenue_ytd", rev_ytd, rev_prev_ytd),
        "revenue_growth_mom": _build_kpi_result("revenue_growth_mom", mom_growth),
        "revenue_growth_yoy": _build_kpi_result("revenue_growth_yoy", yoy_growth),
        "avg_revenue_per_customer": _build_kpi_result("avg_revenue_per_customer", avg_rev_per_customer),
        "revenue_by_category": [{"category": r.category, "value": float(r.total)} for r in by_category],
        "revenue_trend": revenue_trend,
        "active_customer_count": active_customer_count,
    }


# ---------------------------------------------------------------------------
# Expense KPIs
# ---------------------------------------------------------------------------


def calc_expense_kpis(db: Session, as_of: date) -> Dict[str, Any]:
    year_start = date(as_of.year, 1, 1)
    month_start = _month_start(as_of)
    prev_month_start = _add_months(month_start, -1)
    prev_month_end = month_start - timedelta(days=1)

    # Total operating expenses from journal lines
    total_opex = float(
        db.query(func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(Account.type == "EXPENSE")
        .filter(JournalEntry.txn_date >= year_start, JournalEntry.txn_date <= as_of)
        .scalar() or 0
    )

    # COGS
    cogs_total = float(get_cogs_for_period(db, year_start, as_of))

    # By category
    by_category = (
        db.query(
            Account.name.label("category"),
            func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0).label("total"),
        )
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(Account.type.in_(("EXPENSE", "COGS")))
        .filter(JournalEntry.txn_date >= year_start, JournalEntry.txn_date <= as_of)
        .group_by(Account.name)
        .order_by(func.sum(JournalLine.debit - JournalLine.credit).desc())
        .limit(10)
        .all()
    )

    return {
        "total_operating_expenses": _build_kpi_result("total_operating_expenses", total_opex),
        "cogs_total": _build_kpi_result("cogs_total", cogs_total),
        "expense_by_category": [{"category": r.category, "value": float(r.total)} for r in by_category],
    }


# ---------------------------------------------------------------------------
# P&L
# ---------------------------------------------------------------------------


def calc_pnl(db: Session, start: date, end: date) -> Dict[str, Any]:
    revenue = float(get_revenue_for_period(db, start, end))
    cogs = float(get_cogs_for_period(db, start, end))
    gross_profit = revenue - cogs

    # Operating expenses from journal entries
    opex = float(
        db.query(func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(Account.type == "EXPENSE")
        .filter(JournalEntry.txn_date >= start, JournalEntry.txn_date <= end)
        .scalar() or 0
    )

    operating_income = gross_profit - opex
    net_income = operating_income  # Simplified (no tax/interest yet)

    gross_margin = (gross_profit / revenue * 100) if revenue else 0.0
    operating_margin = (operating_income / revenue * 100) if revenue else 0.0
    net_margin = (net_income / revenue * 100) if revenue else 0.0

    return {
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin": round(gross_margin, 2),
        "operating_expenses": round(opex, 2),
        "operating_income": round(operating_income, 2),
        "operating_margin": round(operating_margin, 2),
        "net_income": round(net_income, 2),
        "net_margin": round(net_margin, 2),
        "waterfall": [
            {"label": "Revenue", "value": round(revenue, 2), "type": "total"},
            {"label": "COGS", "value": round(-cogs, 2), "type": "decrease"},
            {"label": "Gross Profit", "value": round(gross_profit, 2), "type": "subtotal"},
            {"label": "Operating Expenses", "value": round(-opex, 2), "type": "decrease"},
            {"label": "Net Income", "value": round(net_income, 2), "type": "total"},
        ],
    }


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------


def calc_balance_sheet(db: Session, as_of: date) -> Dict[str, Any]:
    assets = float(get_account_balances_by_type(db, "ASSET", as_of))
    liabilities = float(abs(get_account_balances_by_type(db, "LIABILITY", as_of)))
    equity = float(get_account_balances_by_type(db, "EQUITY", as_of))

    inventory_value = float(
        db.query(func.coalesce(func.sum(Inventory.total_value), 0)).scalar() or 0
    )

    return {
        "total_assets": round(assets, 2),
        "total_liabilities": round(liabilities, 2),
        "total_equity": round(equity, 2),
        "inventory_value": round(inventory_value, 2),
        "net_assets": round(assets - liabilities, 2),
        "sections": {
            "assets": {
                "label": "Assets",
                "total": round(assets, 2),
                "items": [
                    {"label": "Current Assets", "value": round(assets - inventory_value, 2)},
                    {"label": "Inventory", "value": round(inventory_value, 2)},
                ],
            },
            "liabilities": {
                "label": "Liabilities",
                "total": round(liabilities, 2),
                "items": [],
            },
            "equity": {
                "label": "Equity",
                "total": round(equity, 2),
                "items": [],
            },
        },
    }


# ---------------------------------------------------------------------------
# Financial Health Scorecard
# ---------------------------------------------------------------------------


def calc_financial_health_scorecard(db: Session, as_of: date) -> Dict[str, Any]:
    year_start = date(as_of.year, 1, 1)

    current_ratio = calc_current_ratio(db, as_of)
    quick_ratio = calc_quick_ratio(db, as_of)
    working_capital = calc_working_capital(db, as_of)
    gross_margin = calc_gross_profit_margin(db, year_start, as_of)
    net_margin = calc_net_profit_margin(db, year_start, as_of)

    ratios = [current_ratio, quick_ratio, working_capital, gross_margin, net_margin]
    good_count = sum(1 for r in ratios if r.get("status") == "good")
    total = len(ratios)
    score = round(good_count / total * 100) if total else 0

    return {
        "score": score,
        "status": "good" if score >= 70 else ("warning" if score >= 40 else "critical"),
        "ratios": ratios,
    }


# ---------------------------------------------------------------------------
# All KPIs summary
# ---------------------------------------------------------------------------


def calc_all_kpis(db: Session, as_of: date) -> List[Dict[str, Any]]:
    year_start = date(as_of.year, 1, 1)
    month_start = _month_start(as_of)
    kpis = []

    kpis.append(calc_current_ratio(db, as_of))
    kpis.append(calc_quick_ratio(db, as_of))
    kpis.append(calc_working_capital(db, as_of))
    kpis.append(calc_gross_profit_margin(db, year_start, as_of))
    kpis.append(calc_net_profit_margin(db, year_start, as_of))
    kpis.append(calc_dso(db, as_of))
    kpis.append(calc_ar_total(db, as_of))
    kpis.append(calc_overdue_receivables(db, as_of))
    kpis.append(calc_collection_effectiveness(db, year_start, as_of))
    kpis.append(calc_average_invoice_value(db, year_start, as_of))

    # Revenue KPIs
    rev = calc_revenue_kpis(db, as_of)
    kpis.append(rev["revenue_mtd"])
    kpis.append(rev["revenue_ytd"])
    kpis.append(rev["revenue_growth_mom"])
    kpis.append(rev["revenue_growth_yoy"])
    kpis.append(rev["avg_revenue_per_customer"])

    # Expense KPIs
    exp = calc_expense_kpis(db, as_of)
    kpis.append(exp["total_operating_expenses"])
    kpis.append(exp["cogs_total"])

    return kpis
