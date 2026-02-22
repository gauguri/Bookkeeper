"""Pydantic schemas for analytics API responses."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class TimeSeriesPoint(BaseModel):
    period: str
    value: float


class SparklineData(BaseModel):
    values: List[float] = []


# ---------------------------------------------------------------------------
# KPI Response
# ---------------------------------------------------------------------------


class KpiResponse(BaseModel):
    kpi_key: str
    label: str
    category: str = ""
    current_value: float
    previous_value: float = 0.0
    change_absolute: float = 0.0
    change_percent: float = 0.0
    direction: str = "flat"  # up | down | flat
    status: str = "good"  # good | warning | critical
    target_value: Optional[float] = None
    sparkline: List[float] = []
    period: str = ""
    comparison_period: str = ""
    unit: str = ""  # currency | percent | ratio | days | months
    drill_down_url: str = ""


class KpiListResponse(BaseModel):
    kpis: List[KpiResponse]
    computed_at: datetime


# ---------------------------------------------------------------------------
# Aging
# ---------------------------------------------------------------------------


class AgingBuckets(BaseModel):
    kpi_key: str
    label: str
    category: str
    total: float
    buckets: Dict[str, float]
    bucket_labels: List[str]
    bucket_values: List[float]


# ---------------------------------------------------------------------------
# P&L
# ---------------------------------------------------------------------------


class WaterfallItem(BaseModel):
    label: str
    value: float
    type: str = "total"  # total | increase | decrease | subtotal


class PnlResponse(BaseModel):
    revenue: float
    cogs: float
    gross_profit: float
    gross_margin: float
    operating_expenses: float
    operating_income: float
    operating_margin: float
    net_income: float
    net_margin: float
    waterfall: List[WaterfallItem]


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------


class BalanceSheetSection(BaseModel):
    label: str
    total: float
    items: List[Dict[str, Any]] = []


class BalanceSheetResponse(BaseModel):
    total_assets: float
    total_liabilities: float
    total_equity: float
    inventory_value: float
    net_assets: float
    sections: Dict[str, BalanceSheetSection]


# ---------------------------------------------------------------------------
# Financial Health
# ---------------------------------------------------------------------------


class FinancialHealthResponse(BaseModel):
    score: int
    status: str
    ratios: List[KpiResponse]


# ---------------------------------------------------------------------------
# Cash Flow
# ---------------------------------------------------------------------------


class CashFlowForecastPeriod(BaseModel):
    period: str
    projected_inflows: float
    projected_outflows: float
    net_cash_flow: float
    cumulative: float


class CashFlowResponse(BaseModel):
    historical_inflows: List[float]
    historical_outflows: List[float]
    forecast_periods: List[CashFlowForecastPeriod]
    expected_collections: float
    burn_rate_monthly: float
    trend: Dict[str, Any]


# ---------------------------------------------------------------------------
# Receivables
# ---------------------------------------------------------------------------


class TopCustomerOutstanding(BaseModel):
    customer_id: int
    customer_name: str
    outstanding: float


class ReceivablesResponse(BaseModel):
    ar_total: KpiResponse
    dso: KpiResponse
    overdue_receivables: KpiResponse
    collection_effectiveness: KpiResponse
    average_invoice_value: KpiResponse
    aging: AgingBuckets
    top_customers: List[TopCustomerOutstanding]


# ---------------------------------------------------------------------------
# Payables
# ---------------------------------------------------------------------------


class TopVendorSpend(BaseModel):
    vendor_id: int
    vendor_name: str
    total_spend: float


class PayablesResponse(BaseModel):
    aging: AgingBuckets
    top_vendors: List[TopVendorSpend]


# ---------------------------------------------------------------------------
# Revenue
# ---------------------------------------------------------------------------


class CategoryBreakdown(BaseModel):
    category: str
    value: float


class RevenueResponse(BaseModel):
    revenue_mtd: KpiResponse
    revenue_ytd: KpiResponse
    revenue_growth_mom: KpiResponse
    revenue_growth_yoy: KpiResponse
    avg_revenue_per_customer: KpiResponse
    revenue_by_category: List[CategoryBreakdown]
    revenue_trend: List[TimeSeriesPoint]
    active_customer_count: int


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


class ExpenseResponse(BaseModel):
    total_operating_expenses: KpiResponse
    cogs_total: KpiResponse
    expense_by_category: List[CategoryBreakdown]


# ---------------------------------------------------------------------------
# Anomalies
# ---------------------------------------------------------------------------


class AnomalyItem(BaseModel):
    id: str
    type: str
    entity_type: str
    entity_id: int
    reference: str
    description: str
    value: float
    z_score: float
    severity: str
    reason: str
    date: str
    customer_name: str = ""


class AnomaliesResponse(BaseModel):
    anomalies: List[AnomalyItem]
    total_count: int


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------


class ForecastResponse(BaseModel):
    method: str
    historical: List[float]
    forecast: List[float]
    trend: Dict[str, Any]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


class DashboardResponse(BaseModel):
    kpis: List[KpiResponse]
    revenue_trend: List[TimeSeriesPoint]
    ar_aging: AgingBuckets
    ap_aging: AgingBuckets
    anomalies: List[AnomalyItem]
    pnl_summary: PnlResponse
    computed_at: datetime


# ---------------------------------------------------------------------------
# Variance
# ---------------------------------------------------------------------------


class VarianceItem(BaseModel):
    label: str
    actual: float
    target: float
    variance_absolute: float
    variance_percent: float
    favorable: bool


# ---------------------------------------------------------------------------
# Dashboard Config
# ---------------------------------------------------------------------------


class DashboardConfigUpdate(BaseModel):
    layout: Optional[Dict[str, Any]] = None
    pinned_kpis: Optional[List[str]] = None
    default_period: Optional[str] = None
    theme: Optional[str] = None


class DashboardConfigResponse(BaseModel):
    id: int
    user_id: int
    layout: Dict[str, Any]
    pinned_kpis: List[str]
    default_period: str
    theme: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# KPI Alert
# ---------------------------------------------------------------------------


class KpiAlertCreate(BaseModel):
    kpi_key: str
    condition: str  # above | below | change_pct
    threshold: float


class KpiAlertResponse(BaseModel):
    id: int
    kpi_key: str
    condition: str
    threshold: float
    is_active: bool
    last_triggered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
