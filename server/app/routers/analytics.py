"""Analytics API endpoints.

Provides dashboard, KPI, financial health, cash flow, receivables,
payables, revenue, expense, P&L, balance sheet, anomaly, and forecast endpoints.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.module_keys import ModuleKey

from app.analytics.anomaly import detect_transaction_anomalies
from app.analytics.engine import (
    _add_months,
    get_revenue_trend,
    get_expense_trend,
)
from app.analytics.forecasting import cash_flow_forecast, forecast_metric
from app.analytics.kpis import (
    calc_all_kpis,
    calc_ap_aging,
    calc_ar_aging,
    calc_ar_total,
    calc_average_invoice_value,
    calc_balance_sheet,
    calc_collection_effectiveness,
    calc_current_ratio,
    calc_dso,
    calc_expense_kpis,
    calc_financial_health_scorecard,
    calc_gross_profit_margin,
    calc_net_profit_margin,
    calc_overdue_receivables,
    calc_pnl,
    calc_quick_ratio,
    calc_revenue_kpis,
    calc_top_customers_by_outstanding,
    calc_top_vendors_by_spend,
    calc_working_capital,
)
from app.analytics.schemas import (
    AnomaliesResponse,
    BalanceSheetResponse,
    CashFlowResponse,
    DashboardResponse,
    ExpenseResponse,
    FinancialHealthResponse,
    ForecastResponse,
    KpiListResponse,
    KpiResponse,
    PayablesResponse,
    PnlResponse,
    ReceivablesResponse,
    RevenueResponse,
)

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_module(ModuleKey.REPORTS.value))],
)


def _resolve_period(
    period: str, start_date: Optional[date], end_date: Optional[date]
) -> tuple[date, date]:
    today = datetime.utcnow().date()
    if period == "custom" and start_date and end_date:
        return start_date, end_date
    if period == "current_month":
        return date(today.year, today.month, 1), today
    if period == "current_quarter":
        q = (today.month - 1) // 3
        return date(today.year, q * 3 + 1, 1), today
    if period == "current_year" or period == "ytd":
        return date(today.year, 1, 1), today
    if period == "last_month":
        m = _add_months(today, -1)
        end = date(today.year, today.month, 1) - timedelta(days=1)
        return m, end
    if period == "last_quarter":
        q = (today.month - 1) // 3
        q_start = date(today.year, q * 3 + 1, 1) if q > 0 else date(today.year - 1, 10, 1)
        prev_q_start = _add_months(q_start, -3)
        return prev_q_start, q_start - timedelta(days=1)
    if period == "last_year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    # Default: YTD
    return date(today.year, 1, 1), today


# ---------------------------------------------------------------------------
# Dashboard — full payload
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=DashboardResponse)
def analytics_dashboard(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)
    now = datetime.utcnow()

    kpis_raw = calc_all_kpis(db, end)
    kpis = [KpiResponse(**k) for k in kpis_raw]

    trend_start = _add_months(end, -11)
    revenue_trend = get_revenue_trend(db, trend_start, end)

    ar_aging = calc_ar_aging(db, end)
    ap_aging = calc_ap_aging(db, end)

    anomalies_raw = detect_transaction_anomalies(db, end)
    pnl = calc_pnl(db, start, end)

    return DashboardResponse(
        kpis=kpis,
        revenue_trend=revenue_trend,
        ar_aging=ar_aging,
        ap_aging=ap_aging,
        anomalies=anomalies_raw[:5],
        pnl_summary=pnl,
        computed_at=now,
    )


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------


@router.get("/kpis", response_model=KpiListResponse)
def list_kpis(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    _, end = _resolve_period(period, start_date, end_date)
    kpis_raw = calc_all_kpis(db, end)
    return KpiListResponse(
        kpis=[KpiResponse(**k) for k in kpis_raw],
        computed_at=datetime.utcnow(),
    )


@router.get("/kpis/{kpi_id}", response_model=KpiResponse)
def get_kpi(
    kpi_id: str,
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)

    kpi_handlers = {
        "current_ratio": lambda: calc_current_ratio(db, end),
        "quick_ratio": lambda: calc_quick_ratio(db, end),
        "working_capital": lambda: calc_working_capital(db, end),
        "gross_profit_margin": lambda: calc_gross_profit_margin(db, start, end),
        "net_profit_margin": lambda: calc_net_profit_margin(db, start, end),
        "dso": lambda: calc_dso(db, end),
        "ar_total": lambda: calc_ar_total(db, end),
        "overdue_receivables": lambda: calc_overdue_receivables(db, end),
        "collection_effectiveness": lambda: calc_collection_effectiveness(db, start, end),
        "average_invoice_value": lambda: calc_average_invoice_value(db, start, end),
    }

    handler = kpi_handlers.get(kpi_id)
    if handler:
        return KpiResponse(**handler())

    # Check revenue KPIs
    if kpi_id in ("revenue_mtd", "revenue_ytd", "revenue_growth_mom", "revenue_growth_yoy", "avg_revenue_per_customer"):
        rev = calc_revenue_kpis(db, end)
        return KpiResponse(**rev[kpi_id])

    # Check expense KPIs
    if kpi_id in ("total_operating_expenses", "cogs_total"):
        exp = calc_expense_kpis(db, end)
        return KpiResponse(**exp[kpi_id])

    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail=f"KPI '{kpi_id}' not found")


@router.get("/kpis/{kpi_id}/trend")
def get_kpi_trend(
    kpi_id: str,
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)
    if kpi_id in ("revenue_mtd", "revenue_ytd"):
        trend = get_revenue_trend(db, start, end)
    elif kpi_id in ("total_operating_expenses", "cogs_total"):
        trend = get_expense_trend(db, start, end)
    else:
        trend = get_revenue_trend(db, start, end)
    return {"kpi_id": kpi_id, "trend": trend}


# ---------------------------------------------------------------------------
# Financial Health
# ---------------------------------------------------------------------------


@router.get("/financial-health", response_model=FinancialHealthResponse)
def financial_health(db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    result = calc_financial_health_scorecard(db, today)
    return FinancialHealthResponse(
        score=result["score"],
        status=result["status"],
        ratios=[KpiResponse(**r) for r in result["ratios"]],
    )


# ---------------------------------------------------------------------------
# Cash Flow
# ---------------------------------------------------------------------------


@router.get("/cash-flow", response_model=CashFlowResponse)
def cash_flow_analytics(
    periods: int = Query(3, ge=1, le=12),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    return CashFlowResponse(**cash_flow_forecast(db, today, periods))


# ---------------------------------------------------------------------------
# Receivables
# ---------------------------------------------------------------------------


@router.get("/receivables", response_model=ReceivablesResponse)
def receivables_analytics(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)
    return ReceivablesResponse(
        ar_total=KpiResponse(**calc_ar_total(db, end)),
        dso=KpiResponse(**calc_dso(db, end)),
        overdue_receivables=KpiResponse(**calc_overdue_receivables(db, end)),
        collection_effectiveness=KpiResponse(**calc_collection_effectiveness(db, start, end)),
        average_invoice_value=KpiResponse(**calc_average_invoice_value(db, start, end)),
        aging=calc_ar_aging(db, end),
        top_customers=calc_top_customers_by_outstanding(db),
    )


# ---------------------------------------------------------------------------
# Payables
# ---------------------------------------------------------------------------


@router.get("/payables", response_model=PayablesResponse)
def payables_analytics(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)
    return PayablesResponse(
        aging=calc_ap_aging(db, end),
        top_vendors=calc_top_vendors_by_spend(db, start, end),
    )


# ---------------------------------------------------------------------------
# Revenue
# ---------------------------------------------------------------------------


@router.get("/revenue", response_model=RevenueResponse)
def revenue_analytics(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    _, end = _resolve_period(period, start_date, end_date)
    result = calc_revenue_kpis(db, end)
    return RevenueResponse(**result)


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


@router.get("/expenses", response_model=ExpenseResponse)
def expense_analytics(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    _, end = _resolve_period(period, start_date, end_date)
    return ExpenseResponse(**calc_expense_kpis(db, end))


# ---------------------------------------------------------------------------
# P&L
# ---------------------------------------------------------------------------


@router.get("/pnl", response_model=PnlResponse)
def pnl_analytics(
    period: str = Query("ytd"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _resolve_period(period, start_date, end_date)
    return PnlResponse(**calc_pnl(db, start, end))


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def balance_sheet_analytics(
    as_of: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    target_date = as_of or datetime.utcnow().date()
    return BalanceSheetResponse(**calc_balance_sheet(db, target_date))


# ---------------------------------------------------------------------------
# Ratios
# ---------------------------------------------------------------------------


@router.get("/ratios")
def financial_ratios(db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    year_start = date(today.year, 1, 1)
    return {
        "ratios": [
            calc_current_ratio(db, today),
            calc_quick_ratio(db, today),
            calc_working_capital(db, today),
            calc_gross_profit_margin(db, year_start, today),
            calc_net_profit_margin(db, year_start, today),
        ]
    }


# ---------------------------------------------------------------------------
# Anomalies
# ---------------------------------------------------------------------------


@router.get("/anomalies", response_model=AnomaliesResponse)
def anomalies(
    lookback_days: int = Query(90, ge=7, le=365),
    threshold: float = Query(2.5, ge=1.5, le=4.0),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    results = detect_transaction_anomalies(db, today, lookback_days, threshold)
    return AnomaliesResponse(anomalies=results, total_count=len(results))


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------


@router.get("/forecast/{metric}", response_model=ForecastResponse)
def forecast_endpoint(
    metric: str,
    method: str = Query("sma"),
    periods: int = Query(3, ge=1, le=12),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    trend_start = _add_months(today, -11)

    if metric == "revenue":
        trend = get_revenue_trend(db, trend_start, today)
    elif metric == "expenses":
        trend = get_expense_trend(db, trend_start, today)
    else:
        trend = get_revenue_trend(db, trend_start, today)

    historical = [point["value"] for point in trend]
    return ForecastResponse(**forecast_metric(historical, method, periods))
