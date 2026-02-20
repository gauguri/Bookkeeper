from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class RevenueTrendPoint(BaseModel):
    month: str
    value: DecimalValue


class RevenueDashboardResponse(BaseModel):
    total_revenue_ytd: DecimalValue
    outstanding_ar: DecimalValue
    paid_this_month: DecimalValue
    open_invoices_count: int
    revenue_trend: List[RevenueTrendPoint]

    model_config = ConfigDict(from_attributes=True)


class OwnerCockpitShortage(BaseModel):
    item_id: int
    item_name: str
    shortage_qty: DecimalValue
    backlog_qty: DecimalValue
    next_inbound_eta: Optional[date] = None


class OwnerCockpitResponse(BaseModel):
    revenue: DecimalValue
    revenue_mtd: DecimalValue
    revenue_ytd: DecimalValue
    gross_margin_pct: Decimal
    inventory_value: DecimalValue
    inventory_value_total: DecimalValue
    ar_total: DecimalValue
    ar_90_plus: DecimalValue
    cash_forecast_30d: DecimalValue
    backlog_value: DecimalValue
    top_shortages: List[OwnerCockpitShortage]
    dso_days: Decimal = Decimal("0")
    fulfillment_rate_pct: Decimal = Decimal("0")
    collection_rate_pct: Decimal = Decimal("0")
    inventory_turnover: Decimal = Decimal("0")

    model_config = ConfigDict(from_attributes=True)
