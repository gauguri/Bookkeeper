from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class BacklogSummaryResponse(BaseModel):
    total_backlog_value: DecimalValue
    open_sales_requests_count: int
    open_invoices_count: int

    model_config = ConfigDict(from_attributes=True)


class BacklogItemConsumerResponse(BaseModel):
    source_type: str
    source_id: int
    source_number: str
    source_status: str
    customer: str
    reserved_qty: DecimalValue
    backlog_value: DecimalValue
    age_days: int


class BacklogItemResponse(BaseModel):
    item_id: int
    item_name: str
    on_hand_qty: DecimalValue
    reserved_qty: DecimalValue
    available_qty: DecimalValue
    backlog_qty: DecimalValue
    shortage_qty: DecimalValue
    next_inbound_eta: Optional[date] = None
    consumers: List[BacklogItemConsumerResponse]


class BacklogCustomerResponse(BaseModel):
    customer: str
    backlog_value: DecimalValue
    oldest_request_age_days: int
    status_mix: str
    risk_flag: str
