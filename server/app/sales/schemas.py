from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)
TaxRateValue = condecimal(max_digits=5, decimal_places=4)


class CustomerBase(BaseModel):
    customer_number: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., max_length=200)
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=120)
    state: Optional[str] = Field(None, max_length=120)
    zip_code: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = None
    phone: Optional[str] = None
    fax_number: Optional[str] = Field(None, max_length=50)
    primary_contact: Optional[str] = Field(None, max_length=200)
    credit_limit: Optional[DecimalValue] = Field(None, ge=0)
    shipping_method: Optional[str] = Field(None, max_length=120)
    payment_terms: Optional[str] = Field(None, max_length=100)
    upload_to_peach: bool = False
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    tier: str = "STANDARD"
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    customer_number: Optional[str] = Field(None, max_length=50)
    name: Optional[str] = Field(None, max_length=200)
    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=120)
    state: Optional[str] = Field(None, max_length=120)
    zip_code: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = None
    phone: Optional[str] = None
    fax_number: Optional[str] = Field(None, max_length=50)
    primary_contact: Optional[str] = Field(None, max_length=200)
    credit_limit: Optional[DecimalValue] = Field(None, ge=0)
    shipping_method: Optional[str] = Field(None, max_length=120)
    payment_terms: Optional[str] = Field(None, max_length=100)
    upload_to_peach: Optional[bool] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemBase(BaseModel):
    item_code: Optional[str] = Field(None, max_length=100)
    sku: Optional[str] = None
    name: str = Field(..., max_length=200)
    color: Optional[str] = Field(None, max_length=100)
    monument_type: Optional[str] = Field(None, max_length=100)
    lr_feet: Optional[DecimalValue] = None
    lr_inches: Optional[DecimalValue] = None
    fb_feet: Optional[DecimalValue] = None
    fb_inches: Optional[DecimalValue] = None
    tb_feet: Optional[DecimalValue] = None
    tb_inches: Optional[DecimalValue] = None
    shape: Optional[str] = Field(None, max_length=100)
    finish: Optional[str] = Field(None, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    sales_description: Optional[str] = None
    purchase_description: Optional[str] = None
    unit_price: DecimalValue
    cost_price: Optional[DecimalValue] = Field(None, ge=0)
    weight_lbs: Optional[DecimalValue] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=255)
    peach_id: Optional[str] = Field(None, max_length=100)
    new_code: Optional[str] = Field(None, max_length=100)
    exclude_from_price_list: bool = False
    upload_to_peach: bool = False
    item_type: Optional[str] = Field(None, max_length=100)
    inventory_check: bool = False
    income_account_id: Optional[int] = None
    is_active: bool = True


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    item_code: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    monument_type: Optional[str] = None
    lr_feet: Optional[DecimalValue] = None
    lr_inches: Optional[DecimalValue] = None
    fb_feet: Optional[DecimalValue] = None
    fb_inches: Optional[DecimalValue] = None
    tb_feet: Optional[DecimalValue] = None
    tb_inches: Optional[DecimalValue] = None
    shape: Optional[str] = None
    finish: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    sales_description: Optional[str] = None
    purchase_description: Optional[str] = None
    unit_price: Optional[DecimalValue] = None
    cost_price: Optional[DecimalValue] = Field(None, ge=0)
    weight_lbs: Optional[DecimalValue] = Field(None, ge=0)
    location: Optional[str] = None
    peach_id: Optional[str] = None
    new_code: Optional[str] = None
    exclude_from_price_list: Optional[bool] = None
    upload_to_peach: Optional[bool] = None
    item_type: Optional[str] = None
    inventory_check: Optional[bool] = None
    income_account_id: Optional[int] = None
    is_active: Optional[bool] = None


class ItemResponse(ItemBase):
    id: int
    created_at: datetime
    preferred_supplier_id: Optional[int] = None
    preferred_supplier_name: Optional[str] = None
    preferred_landed_cost: Optional[DecimalValue] = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceLineBase(BaseModel):
    item_id: Optional[int] = None
    description: Optional[str] = None
    quantity: DecimalValue = Field(..., gt=0)
    unit_price: DecimalValue = Field(..., ge=0)
    unit_cost: Optional[DecimalValue] = Field(None, ge=0)
    landed_unit_cost: Optional[DecimalValue] = Field(None, ge=0)
    supplier_id: Optional[int] = None
    discount: DecimalValue = Field(0, ge=0)
    tax_rate: TaxRateValue = Field(0, ge=0, le=1)


class InvoiceLineCreate(InvoiceLineBase):
    pass


class InvoiceLineResponse(InvoiceLineBase):
    id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    line_total: DecimalValue

    model_config = ConfigDict(from_attributes=True)


class InvoiceBase(BaseModel):
    customer_id: int
    issue_date: date
    due_date: date
    notes: Optional[str] = None
    terms: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    line_items: List[InvoiceLineCreate]


class InvoiceUpdate(BaseModel):
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    line_items: Optional[List[InvoiceLineCreate]] = None


class InvoiceResponse(InvoiceBase):
    id: int
    invoice_number: str
    status: str
    subtotal: DecimalValue
    tax_total: DecimalValue
    total: DecimalValue
    amount_due: DecimalValue
    sales_request_id: Optional[int] = None
    shipped_at: Optional[datetime] = None
    posted_to_gl: bool = False
    gl_journal_entry_id: Optional[int] = None
    gl_posted_at: Optional[datetime] = None
    posted_journal_entry_id: Optional[int] = None
    posted_at: Optional[datetime] = None
    gl_posting_last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    line_items: List[InvoiceLineResponse] = Field(alias="lines")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class InvoiceListResponse(BaseModel):
    id: int
    invoice_number: str
    customer_id: int
    customer_name: str
    status: str
    issue_date: date
    due_date: date
    total: DecimalValue
    amount_due: DecimalValue
    sales_request_id: Optional[int] = None


class InvoiceGLPostingStatus(BaseModel):
    invoice_id: int
    invoice_number: str
    posted_to_gl: bool
    gl_journal_entry_id: Optional[int] = None
    gl_posted_at: Optional[datetime] = None
    posted_journal_entry_id: Optional[int] = None
    posted_at: Optional[datetime] = None
    last_error: Optional[str] = None


class PaymentApplicationCreate(BaseModel):
    invoice_id: int
    applied_amount: DecimalValue


class PaymentBase(BaseModel):
    invoice_id: int
    amount: DecimalValue
    payment_date: date
    method: Optional[str] = None
    notes: Optional[str] = None


class PaymentCreate(PaymentBase):
    pass


class PaymentApplyRequest(BaseModel):
    allocations: List[PaymentApplicationCreate]


class PaymentWorkbenchItem(BaseModel):
    id: int
    payment_number: str
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    customer_id: int
    customer_name: Optional[str] = None
    amount: DecimalValue
    payment_date: date
    method: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    status: str
    applied_amount: DecimalValue
    unapplied_amount: DecimalValue
    exception_reason: Optional[str] = None
    updated_at: datetime


class PaymentSummaryResponse(BaseModel):
    payments_received: DecimalValue
    unapplied_payments: DecimalValue
    exceptions_count: int
    avg_days_to_pay: Optional[float] = None
    refunds_reversals: DecimalValue
    cash_forecast_impact: DecimalValue


class PaymentMethodMixPoint(BaseModel):
    method: str
    amount: DecimalValue


class PaymentTrendPoint(BaseModel):
    month: str
    received: DecimalValue
    applied: DecimalValue
    unapplied: DecimalValue


class TopCustomerPaymentPoint(BaseModel):
    customer_id: int
    customer_name: str
    amount: DecimalValue


class PaymentSummaryAnalytics(BaseModel):
    summary: PaymentSummaryResponse
    method_mix: List[PaymentMethodMixPoint]
    monthly_trend: List[PaymentTrendPoint]
    top_customers: List[TopCustomerPaymentPoint]


class PaymentApplicationResponse(BaseModel):
    invoice_id: int
    applied_amount: DecimalValue

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(PaymentBase):
    id: int
    customer_id: int
    invoice_number: Optional[str] = None
    created_at: datetime
    applications: List[PaymentApplicationResponse]

    model_config = ConfigDict(from_attributes=True)


class PaymentDetailResponse(PaymentWorkbenchItem):
    allocations: List[PaymentApplicationResponse]


class InvoicePaymentSummary(BaseModel):
    payment_id: int
    payment_date: date
    amount: DecimalValue
    applied_amount: DecimalValue
    method: Optional[str] = None
    reference: Optional[str] = None


class InvoiceDetailResponse(InvoiceResponse):
    customer: CustomerResponse
    payments: List[InvoicePaymentSummary]


class SalesSummaryResponse(BaseModel):
    status: str
    invoice_count: int
    total_amount: DecimalValue


class ARAgingBucket(BaseModel):
    bucket: str
    amount: DecimalValue


class CustomerRevenueResponse(BaseModel):
    customer_id: int
    customer_name: str
    total_revenue: DecimalValue


class ItemPricingContextResponse(BaseModel):
    item_id: int
    customer_id: Optional[int] = None
    customer_tier: str
    landed_unit_cost: Optional[DecimalValue] = None
    available_qty: DecimalValue
    last_paid_price: Optional[DecimalValue] = None
    avg_unit_price: Optional[DecimalValue] = None
    suggested_sell: Optional[DecimalValue] = None
    recommended_price: Optional[DecimalValue] = None
    default_markup_percent: DecimalValue
    margin_threshold_percent: DecimalValue
    warnings: List[str] = Field(default_factory=list)


class CustomerInsightInvoiceSummary(BaseModel):
    id: int
    invoice_number: str
    issue_date: date
    due_date: date
    status: str
    total: DecimalValue
    amount_due: DecimalValue


class CustomerInsightsResponse(BaseModel):
    customer_id: int
    customer_name: str
    ytd_revenue: DecimalValue
    ltm_revenue: DecimalValue
    gross_margin_percent: Optional[Decimal] = None
    outstanding_ar: DecimalValue
    average_days_to_pay: Optional[float] = None
    last_invoices: List[CustomerInsightInvoiceSummary]


# ── Customer 360 ────────────────────────────────────────────────


class CustomerActivityItem(BaseModel):
    id: str
    type: str  # invoice_created, invoice_sent, invoice_paid, payment_received, note_added, reminder_sent
    title: str
    description: str
    amount: Optional[Decimal] = None
    reference: Optional[str] = None
    date: datetime
    icon: str  # frontend icon hint: invoice, payment, note, reminder, shipped


class CustomerRevenueTrendPoint(BaseModel):
    period: str
    revenue: Decimal = Decimal("0")
    payments: Decimal = Decimal("0")


class CustomerAgingBuckets(BaseModel):
    current: Decimal = Decimal("0")
    days_1_30: Decimal = Decimal("0")
    days_31_60: Decimal = Decimal("0")
    days_61_90: Decimal = Decimal("0")
    days_90_plus: Decimal = Decimal("0")


class CustomerKpis(BaseModel):
    lifetime_revenue: Decimal = Decimal("0")
    ytd_revenue: Decimal = Decimal("0")
    outstanding_ar: Decimal = Decimal("0")
    avg_days_to_pay: Optional[float] = None
    gross_margin_percent: Optional[float] = None
    total_invoices: int = 0
    total_payments: int = 0
    overdue_amount: Decimal = Decimal("0")
    payment_score: str = "good"  # good, average, slow, at-risk


class Customer360Response(BaseModel):
    customer: CustomerResponse
    kpis: CustomerKpis
    aging: CustomerAgingBuckets
    revenue_trend: List[CustomerRevenueTrendPoint]
    recent_activity: List[CustomerActivityItem]
    top_items: List[dict]  # {item_name, quantity, revenue}


class CustomerListItem(BaseModel):
    id: int
    customer_number: Optional[str] = None
    name: str
    primary_contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    payment_terms: Optional[str] = None
    tier: str = "STANDARD"
    is_active: bool = True
    created_at: datetime
    total_revenue: Decimal = Decimal("0")
    outstanding_ar: Decimal = Decimal("0")
    invoice_count: int = 0
    last_invoice_date: Optional[date] = None
    avg_days_to_pay: Optional[float] = None
    payment_score: str = "good"


class CustomersSummaryResponse(BaseModel):
    total_customers: int = 0
    active_customers: int = 0
    total_revenue_ytd: Decimal = Decimal("0")
    total_outstanding_ar: Decimal = Decimal("0")
    avg_days_to_pay: Optional[float] = None
    customers_at_risk: int = 0


# ── Item 360 ────────────────────────────────────────────────


class ItemSupplierInfo(BaseModel):
    supplier_id: int
    supplier_name: str
    supplier_cost: Decimal = Decimal("0")
    freight_cost: Decimal = Decimal("0")
    tariff_cost: Decimal = Decimal("0")
    landed_cost: Decimal = Decimal("0")
    is_preferred: bool = False
    lead_time_days: Optional[int] = None
    min_order_qty: Optional[Decimal] = None


class ItemKpis(BaseModel):
    total_revenue: Decimal = Decimal("0")
    ytd_revenue: Decimal = Decimal("0")
    units_sold_ytd: Decimal = Decimal("0")
    units_sold_total: Decimal = Decimal("0")
    avg_selling_price: Optional[Decimal] = None
    gross_margin_percent: Optional[float] = None
    on_hand_qty: Decimal = Decimal("0")
    reserved_qty: Decimal = Decimal("0")
    available_qty: Decimal = Decimal("0")
    inventory_value: Decimal = Decimal("0")
    unique_customers: int = 0
    total_invoices: int = 0
    stock_status: str = "in_stock"  # in_stock, low_stock, out_of_stock, overstocked


class ItemSalesTrendPoint(BaseModel):
    period: str
    revenue: Decimal = Decimal("0")
    units: Decimal = Decimal("0")


class ItemTopCustomer(BaseModel):
    customer_id: int
    customer_name: str
    units: Decimal = Decimal("0")
    revenue: Decimal = Decimal("0")


class ItemMovement(BaseModel):
    id: int
    date: datetime
    reason: str
    qty_delta: Decimal
    ref_type: Optional[str] = None
    ref_id: Optional[int] = None


class ItemDetailResponse(ItemResponse):
    description: Optional[str] = None
    on_hand_qty: Decimal = Decimal("0")
    reserved_qty: Decimal = Decimal("0")
    reorder_point: Optional[Decimal] = None


class Item360Response(BaseModel):
    item: ItemDetailResponse
    kpis: ItemKpis
    sales_trend: List[ItemSalesTrendPoint]
    top_customers: List[ItemTopCustomer]
    suppliers: List[ItemSupplierInfo]
    recent_movements: List[ItemMovement]


class ItemListEnriched(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    unit_price: Decimal
    is_active: bool = True
    created_at: datetime
    on_hand_qty: Decimal = Decimal("0")
    available_qty: Decimal = Decimal("0")
    inventory_value: Decimal = Decimal("0")
    total_revenue_ytd: Decimal = Decimal("0")
    units_sold_ytd: Decimal = Decimal("0")
    gross_margin_percent: Optional[float] = None
    preferred_supplier_name: Optional[str] = None
    preferred_landed_cost: Optional[Decimal] = None
    stock_status: str = "in_stock"
    unique_customers: int = 0


class ItemListPageResponse(BaseModel):
    items: List[ItemListEnriched]
    total_count: int
    page: int
    page_size: int


class ItemsSummaryResponse(BaseModel):
    total_items: int = 0
    active_items: int = 0
    total_inventory_value: Decimal = Decimal("0")
    total_revenue_ytd: Decimal = Decimal("0")
    low_stock_items: int = 0
    out_of_stock_items: int = 0
