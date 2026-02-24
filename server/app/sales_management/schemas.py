from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

PageItemT = TypeVar("PageItemT")


class Page(BaseModel, Generic[PageItemT]):
    items: list[PageItemT]
    total_count: int

class SalesAccountBase(BaseModel):
    name: str
    website: str | None = None
    phone: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None
    industry: str | None = None
    tags: str | None = None
    owner_user_id: int | None = None

class SalesAccountCreate(SalesAccountBase):
    customer_id: int | None = None

class SalesAccountUpdate(BaseModel):
    name: str | None = None
    website: str | None = None
    phone: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None
    industry: str | None = None
    tags: str | None = None
    owner_user_id: int | None = None

class SalesAccountResponse(SalesAccountBase):
    id: int
    customer_id: int | None = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class SalesContactCreate(BaseModel):
    account_id: int
    name: str
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    is_primary: bool = False

class SalesContactResponse(SalesContactCreate):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class OpportunityCreate(BaseModel):
    account_id: int
    name: str
    stage: str = "Prospecting"
    amount_estimate: Decimal = Decimal("0")
    probability: int = Field(default=10, ge=0, le=100)
    expected_close_date: date | None = None
    owner_user_id: int | None = None
    forecast_category: str = "PIPELINE"
    source: str | None = None
    next_step: str | None = None

class OpportunityUpdate(BaseModel):
    name: str | None = None
    stage: str | None = None
    amount_estimate: Decimal | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None
    owner_user_id: int | None = None
    forecast_category: str | None = None
    source: str | None = None
    next_step: str | None = None

class OpportunityResponse(OpportunityCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class QuoteLineInput(BaseModel):
    item_id: int | None = None
    description: str | None = None
    qty: Decimal = Decimal("1")
    unit_price: Decimal = Decimal("0")
    discount_pct: Decimal = Decimal("0")

class QuoteCreate(BaseModel):
    opportunity_id: int
    valid_until: date | None = None
    notes: str | None = None
    status: str = "DRAFT"
    lines: list[QuoteLineInput] = []

class QuoteLineResponse(BaseModel):
    id: int
    item_id: int | None
    description: str | None
    qty: Decimal
    unit_price: Decimal
    discount_pct: Decimal
    discount_amount: Decimal
    line_total: Decimal
    class Config:
        from_attributes = True

class QuoteResponse(BaseModel):
    id: int
    opportunity_id: int
    quote_number: str
    version: int
    status: str
    valid_until: date | None
    notes: str | None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    approval_status: str
    lines: list[QuoteLineResponse]
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class SalesOrderCreate(BaseModel):
    account_id: int
    opportunity_id: int | None = None
    quote_id: int | None = None
    order_date: date
    requested_ship_date: date | None = None
    fulfillment_type: str = "SHIPPING"
    shipping_address: str | None = None

class SalesOrderStatusUpdate(BaseModel):
    status: str

class SalesOrderResponse(BaseModel):
    id: int
    order_number: str
    account_id: int
    opportunity_id: int | None
    quote_id: int | None
    invoice_id: int | None
    status: str
    order_date: date
    requested_ship_date: date | None
    fulfillment_type: str
    shipping_address: str | None
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

class ActivityCreate(BaseModel):
    entity_type: str
    entity_id: int
    type: str
    subject: str
    body: str | None = None
    due_date: date | None = None

class ActivityResponse(ActivityCreate):
    id: int
    completed_at: datetime | None = None
    created_by: int | None = None
    created_at: datetime
    class Config:
        from_attributes = True

class PriceBookResponse(BaseModel):
    id: int
    name: str
    is_default: bool
    class Config:
        from_attributes = True

class PipelineSummaryRow(BaseModel):
    stage: str
    count: int
    amount: Decimal

class ReportSummary(BaseModel):
    pipeline_value: Decimal
    open_opportunities: int
    quotes_pending_approval: int
    orders_pending_fulfillment: int
    won_last_30d: Decimal
    by_stage: list[PipelineSummaryRow]
