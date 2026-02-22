from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal, model_validator


DecimalValue = condecimal(max_digits=14, decimal_places=2)
SalesRequestStatus = Literal[
    "NEW",
    "QUOTED",
    "CONFIRMED",
    "INVOICED",
    "SHIPPED",
    "CLOSED",
    "LOST",
    "CANCELLED",
]


class SalesRequestTimelineEntry(BaseModel):
    status: SalesRequestStatus
    label: str
    occurred_at: Optional[datetime] = None
    completed: bool = False
    current: bool = False


class SalesRequestLineCreate(BaseModel):
    item_id: int
    quantity: DecimalValue = Field(..., gt=0)
    unit_price: DecimalValue = Field(..., ge=0)


class SalesRequestLineResponse(BaseModel):
    id: int
    item_id: int
    item_name: str
    quantity: DecimalValue
    unit_price: DecimalValue
    line_total: DecimalValue
    mwb_unit_price: Optional[DecimalValue] = None
    mwb_explanation: Optional[str] = None
    mwb_computed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SalesRequestCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None
    requested_fulfillment_date: Optional[date] = None
    status: SalesRequestStatus = "NEW"
    created_by_user_id: Optional[int] = None
    lines: List[SalesRequestLineCreate]

    @model_validator(mode="after")
    def validate_customer_and_lines(self):
        if not self.customer_id and not (self.customer_name and self.customer_name.strip()):
            raise ValueError("Select a customer or provide a walk-in customer name.")
        if not self.lines:
            raise ValueError("Add at least one line item.")
        return self


class SalesRequestUpdate(BaseModel):
    status: Optional[SalesRequestStatus] = None
    workflow_status: Optional[SalesRequestStatus] = None

    @model_validator(mode="after")
    def validate_status_payload(self):
        if self.status is None and self.workflow_status is None:
            raise ValueError("Provide status or workflow_status.")
        if self.status is not None and self.workflow_status is not None and self.status != self.workflow_status:
            raise ValueError("status and workflow_status must match when both are provided.")
        return self


class SalesRequestLineEdit(BaseModel):
    item_id: int
    quantity: DecimalValue = Field(..., gt=0)
    requested_price: DecimalValue = Field(..., ge=0)


class SalesRequestEdit(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None
    requested_fulfillment_date: Optional[date] = None
    line_items: List[SalesRequestLineEdit]

    @model_validator(mode="after")
    def validate_customer_and_lines(self):
        if not self.customer_id and not (self.customer_name and self.customer_name.strip()):
            raise ValueError("Select a customer or provide a walk-in customer name.")
        if not self.line_items:
            raise ValueError("Add at least one line item.")
        return self


class SalesRequestResponse(BaseModel):
    id: int
    request_number: str
    customer_id: Optional[int]
    customer_name: Optional[str]
    status: SalesRequestStatus
    created_at: datetime
    updated_at: datetime
    created_by_user_id: Optional[int]
    notes: Optional[str]
    requested_fulfillment_date: Optional[date]
    total_amount: DecimalValue
    lines: List[SalesRequestLineResponse]

    model_config = ConfigDict(from_attributes=True)


class SupplierOptionResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    supplier_cost: DecimalValue
    freight_cost: DecimalValue
    tariff_cost: DecimalValue
    landed_cost: DecimalValue
    is_preferred: bool
    lead_time_days: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SalesRequestLineDetailResponse(BaseModel):
    id: int
    item_id: int
    item_name: str
    quantity: DecimalValue
    unit_price: DecimalValue
    line_total: DecimalValue
    mwb_unit_price: Optional[DecimalValue] = None
    mwb_confidence: Optional[str] = None
    mwb_confidence_score: Optional[float] = None
    mwb_explanation: Optional[str] = None
    mwb_computed_at: Optional[datetime] = None
    invoice_unit_price: Optional[DecimalValue] = None
    invoice_line_total: Optional[DecimalValue] = None
    on_hand_qty: DecimalValue
    reserved_qty: DecimalValue
    available_qty: DecimalValue
    supplier_options: List[SupplierOptionResponse]

    model_config = ConfigDict(from_attributes=True)


class SalesRequestDetailResponse(BaseModel):
    id: int
    request_number: str
    customer_id: Optional[int]
    customer_name: Optional[str]
    status: SalesRequestStatus
    created_at: datetime
    updated_at: datetime
    created_by_user_id: Optional[int]
    notes: Optional[str]
    requested_fulfillment_date: Optional[date]
    total_amount: DecimalValue
    lines: List[SalesRequestLineDetailResponse]
    linked_invoice_id: Optional[int] = None
    linked_invoice_number: Optional[str] = None
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    linked_invoice_status: Optional[str] = None
    linked_invoice_shipped_at: Optional[datetime] = None
    allowed_transitions: List[SalesRequestStatus] = Field(default_factory=list)
    timeline: List[SalesRequestTimelineEntry] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class LineSelectionCreate(BaseModel):
    sales_request_line_id: int
    supplier_id: Optional[int] = None
    unit_cost: Optional[DecimalValue] = None
    unit_price: Optional[DecimalValue] = None
    discount: DecimalValue = Field(0, ge=0)
    tax_rate: DecimalValue = Field(0, ge=0, le=1)


class GenerateInvoiceFromSRRequest(BaseModel):
    issue_date: date
    due_date: date
    notes: Optional[str] = None
    terms: Optional[str] = None
    markup_percent: DecimalValue = Field(..., ge=0)
    line_selections: List[LineSelectionCreate]


class MWBPricingResponse(BaseModel):
    unit_price: DecimalValue
    currency: str = "USD"
    source_level: str
    confidence: str
    confidence_score: float = 0.0
    explanation: dict
    computed_at: datetime


class ApplyMWBRequest(BaseModel):
    qty: Optional[DecimalValue] = Field(None, gt=0)


class ApplyMWBResponse(BaseModel):
    line_id: int
    sales_request_id: int
    quoted_unit_price: DecimalValue
    line_total: DecimalValue
    mwb_unit_price: DecimalValue
    source_level: str
    confidence: str
    confidence_score: float = 0.0
    explanation: dict
    computed_at: datetime


# ── Enriched / 360 schemas ──────────────────────────────────


class SalesRequestsSummaryResponse(BaseModel):
    """Aggregate pipeline KPIs for the list-page header."""
    total_orders: int = 0
    pipeline_value: Decimal = Decimal("0")
    conversion_rate: Optional[float] = None
    avg_deal_size: Optional[Decimal] = None
    overdue_orders: int = 0
    avg_cycle_time_days: Optional[float] = None
    orders_by_status: dict = Field(default_factory=dict)


class SalesRequestListEnriched(BaseModel):
    """Single row in the enriched sales-order list."""
    id: int
    request_number: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: SalesRequestStatus
    created_at: datetime
    updated_at: datetime
    requested_fulfillment_date: Optional[date] = None
    total_amount: Decimal = Decimal("0")
    line_count: int = 0
    days_open: int = 0
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    has_linked_invoice: bool = False
    fulfillment_urgency: str = "none"
    estimated_margin_percent: Optional[float] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedSalesRequestList(BaseModel):
    """Paginated response wrapper for the enriched sales-order list."""
    items: List[SalesRequestListEnriched]
    total_count: int
    limit: int
    offset: int


class SalesRequestKpis(BaseModel):
    """Computed KPIs for the 360 detail header."""
    total_amount: Decimal = Decimal("0")
    line_count: int = 0
    avg_line_value: Optional[Decimal] = None
    estimated_margin_percent: Optional[float] = None
    estimated_margin_amount: Optional[Decimal] = None
    days_open: int = 0
    fulfillment_days_remaining: Optional[int] = None


class CustomerRecentOrder(BaseModel):
    """Lightweight summary of another order from the same customer."""
    id: int
    request_number: str
    status: SalesRequestStatus
    total_amount: Decimal = Decimal("0")
    created_at: datetime


class SalesRequest360Response(SalesRequestDetailResponse):
    """Full 360 view — extends the detail response with KPIs + related orders."""
    kpis: SalesRequestKpis = Field(default_factory=SalesRequestKpis)
    customer_recent_orders: List[CustomerRecentOrder] = Field(default_factory=list)
