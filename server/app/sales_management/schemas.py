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
    lines: list[QuoteLineInput] = Field(default_factory=list)


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


class QuoteDetailOpportunity(BaseModel):
    id: int
    name: str
    account_id: int
    account_name: str | None = None


class QuoteDetailResponse(QuoteResponse):
    opportunity: QuoteDetailOpportunity | None = None


class DealDeskCustomerContext(BaseModel):
    account_id: int | None = None
    account_name: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    tier: str = "STANDARD"
    ytd_revenue: Decimal = Decimal("0")
    lifetime_revenue: Decimal = Decimal("0")
    outstanding_ar: Decimal = Decimal("0")
    avg_days_to_pay: float | None = None
    gross_margin_percent: Decimal | float | None = None
    payment_score: str = "unknown"
    overdue_amount: Decimal = Decimal("0")
    top_items: list[dict] = Field(default_factory=list)


class DealDeskSummary(BaseModel):
    subtotal: Decimal = Decimal("0")
    discount_total: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    recommended_total: Decimal = Decimal("0")
    recommended_revenue_uplift: Decimal = Decimal("0")
    gross_margin_percent: Decimal | None = None
    approval_required: bool = False
    approval_reasons: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    deal_score: int = 0
    average_confidence_score: float = 0.0
    discount_policy_limit_percent: Decimal = Decimal("0")
    margin_floor_percent: Decimal = Decimal("0")
    next_best_actions: list[str] = Field(default_factory=list)


class DealDeskLineEvaluation(BaseModel):
    line_number: int
    item_id: int | None = None
    description: str | None = None
    sku: str | None = None
    qty: Decimal = Decimal("0")
    entered_unit_price: Decimal = Decimal("0")
    entered_net_unit_price: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    line_total: Decimal = Decimal("0")
    list_price: Decimal | None = None
    recommended_unit_price: Decimal | None = None
    recommended_net_unit_price: Decimal | None = None
    recommended_line_total: Decimal | None = None
    floor_unit_price: Decimal | None = None
    preferred_landed_cost: Decimal | None = None
    margin_percent: Decimal | None = None
    confidence: str = "Low"
    confidence_score: float = 0.0
    source_level: str = "manual"
    available_qty: Decimal = Decimal("0")
    stock_risk: str = "unknown"
    approval_reasons: list[str] = Field(default_factory=list)
    opportunity_uplift: Decimal = Decimal("0")
    warnings: list[str] = Field(default_factory=list)


class DealDeskUpsellSuggestion(BaseModel):
    item_id: int
    name: str
    sku: str | None = None
    reason: str
    available_qty: Decimal = Decimal("0")
    unit_price: Decimal | None = None
    recommended_price: Decimal | None = None
    co_purchase_count: int = 0
    revenue: Decimal | None = None


class DealDeskEvaluationRequest(BaseModel):
    opportunity_id: int
    valid_until: date | None = None
    lines: list[QuoteLineInput] = Field(default_factory=list)


class DealDeskEvaluationResponse(BaseModel):
    opportunity_id: int
    opportunity_name: str
    account_id: int | None = None
    account_name: str | None = None
    customer: DealDeskCustomerContext
    summary: DealDeskSummary
    lines: list[DealDeskLineEvaluation]
    upsell_suggestions: list[DealDeskUpsellSuggestion]


class RevenueControlOpportunity(BaseModel):
    quote_id: int
    quote_number: str
    account_name: str | None = None
    uplift: Decimal | None = None


class RevenueControlSummaryResponse(BaseModel):
    quotes_reviewed: int = 0
    pending_approvals: int = 0
    low_margin_quotes: int = 0
    revenue_uplift: Decimal | None = None
    largest_opportunities: list[RevenueControlOpportunity] = Field(default_factory=list)


class SalesOrderCreate(BaseModel):
    account_id: int
    opportunity_id: int | None = None
    quote_id: int | None = None
    order_date: date
    requested_ship_date: date | None = None
    fulfillment_type: str = "SHIPPING"
    shipping_address: str | None = None
    lines: list[QuoteLineInput] = Field(default_factory=list)


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


class SalesExecutionSupplierOption(BaseModel):
    supplier_id: int
    supplier_name: str
    supplier_cost: Decimal = Decimal("0")
    freight_cost: Decimal = Decimal("0")
    tariff_cost: Decimal = Decimal("0")
    landed_cost: Decimal = Decimal("0")
    is_preferred: bool = False
    lead_time_days: int | None = None


class SalesOrderExecutionLine(BaseModel):
    id: int
    item_id: int | None = None
    item_name: str
    quantity: Decimal = Decimal("0")
    unit_price: Decimal = Decimal("0")
    line_total: Decimal = Decimal("0")
    mwb_unit_price: Decimal | None = None
    mwb_confidence: str | None = None
    mwb_confidence_score: float | None = None
    mwb_explanation: str | None = None
    mwb_computed_at: datetime | None = None
    invoice_unit_price: Decimal | None = None
    invoice_line_total: Decimal | None = None
    on_hand_qty: Decimal = Decimal("0")
    reserved_qty: Decimal = Decimal("0")
    available_qty: Decimal = Decimal("0")
    supplier_options: list[SalesExecutionSupplierOption] = Field(default_factory=list)


class SalesExecutionTimelineEntry(BaseModel):
    status: str
    label: str
    occurred_at: datetime | None = None
    completed: bool = False
    current: bool = False


class SalesOrderExecutionKpis(BaseModel):
    total_amount: Decimal = Decimal("0")
    line_count: int = 0
    avg_line_value: Decimal | None = None
    estimated_margin_percent: float | None = None
    estimated_margin_amount: Decimal | None = None
    days_open: int = 0
    fulfillment_days_remaining: int | None = None


class RelatedSalesOrderSummary(BaseModel):
    id: int
    request_number: str
    status: str
    total_amount: Decimal = Decimal("0")
    created_at: datetime


class SalesOrderExecutionResponse(BaseModel):
    id: int
    order_number: str
    account_id: int
    account_name: str | None = None
    customer_id: int | None = None
    customer_name: str | None = None
    opportunity_id: int | None = None
    quote_id: int | None = None
    invoice_id: int | None = None
    invoice_number: str | None = None
    status: str
    order_date: date
    requested_ship_date: date | None = None
    fulfillment_type: str
    shipping_address: str | None = None
    subtotal: Decimal = Decimal("0")
    tax_total: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime
    lines: list[SalesOrderExecutionLine] = Field(default_factory=list)
    linked_invoice_id: int | None = None
    linked_invoice_number: str | None = None
    linked_invoice_status: str | None = None
    linked_invoice_shipped_at: datetime | None = None
    allowed_transitions: list[str] = Field(default_factory=list)
    timeline: list[SalesExecutionTimelineEntry] = Field(default_factory=list)
    kpis: SalesOrderExecutionKpis
    customer_recent_orders: list[RelatedSalesOrderSummary] = Field(default_factory=list)


class GenerateInvoiceFromOrderLineSelection(BaseModel):
    sales_order_line_id: int
    supplier_id: int | None = None
    unit_cost: Decimal | None = None
    unit_price: Decimal | None = None
    discount: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")


class GenerateInvoiceFromOrderRequest(BaseModel):
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    terms: str | None = None
    markup_percent: Decimal = Decimal("20.00")
    line_selections: list[GenerateInvoiceFromOrderLineSelection] = Field(default_factory=list)
class ActivityCreate(BaseModel):
    entity_type: str
    entity_id: int
    type: str
    subject: str
    body: str | None = None
    due_date: date | None = None
    status: str | None = None
    priority: str | None = None
    owner_user_id: int | None = None


class ActivityResponse(ActivityCreate):
    id: int
    completed_at: datetime | None = None
    created_by: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FollowUpCreate(BaseModel):
    entity_type: str
    entity_id: int
    subject: str
    body: str | None = None
    due_date: date | None = None
    priority: str = "MEDIUM"
    owner_user_id: int | None = None


class FollowUpUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    due_date: date | None = None
    priority: str | None = None
    status: str | None = None
    owner_user_id: int | None = None


class FollowUpResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    type: str
    subject: str
    body: str | None = None
    due_date: date | None = None
    status: str
    priority: str
    owner_user_id: int | None = None
    completed_at: datetime | None = None
    created_by: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FollowUpSummaryItem(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    subject: str
    due_date: date | None = None
    priority: str
    status: str
    owner_user_id: int | None = None
    age_days: int = 0


class FollowUpSummaryResponse(BaseModel):
    open_count: int
    due_today_count: int
    overdue_count: int
    stale_opportunities_count: int
    stale_quotes_count: int
    due_today: list[FollowUpSummaryItem] = Field(default_factory=list)
    overdue: list[FollowUpSummaryItem] = Field(default_factory=list)
    stale_opportunities: list[FollowUpSummaryItem] = Field(default_factory=list)
    stale_quotes: list[FollowUpSummaryItem] = Field(default_factory=list)


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


class PipelineTrendPoint(BaseModel):
    period: str
    value: Decimal


class ConversionSummary(BaseModel):
    quotes: int
    orders: int
    invoices: int

