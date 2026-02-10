from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)
TaxRateValue = condecimal(max_digits=5, decimal_places=4)


class CustomerBase(BaseModel):
    name: str = Field(..., max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemBase(BaseModel):
    sku: Optional[str] = None
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    unit_price: DecimalValue
    income_account_id: Optional[int] = None
    is_active: bool = True


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    unit_price: Optional[DecimalValue] = None
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
    supplier_id: Optional[int] = None
    discount: DecimalValue = Field(0, ge=0)
    tax_rate: TaxRateValue = Field(0, ge=0, le=1)


class InvoiceLineCreate(InvoiceLineBase):
    pass


class InvoiceLineResponse(InvoiceLineBase):
    id: int
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


class PaymentApplicationCreate(BaseModel):
    invoice_id: int
    applied_amount: DecimalValue


class PaymentBase(BaseModel):
    customer_id: int
    amount: DecimalValue
    payment_date: date
    method: Optional[str] = None
    reference: Optional[str] = None
    memo: Optional[str] = None


class PaymentCreate(PaymentBase):
    applications: List[PaymentApplicationCreate]


class PaymentApplicationResponse(BaseModel):
    invoice_id: int
    applied_amount: DecimalValue

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(PaymentBase):
    id: int
    created_at: datetime
    applications: List[PaymentApplicationResponse]

    model_config = ConfigDict(from_attributes=True)


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
