from decimal import Decimal
from typing import List

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
