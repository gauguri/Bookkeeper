from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal, model_validator


DecimalValue = condecimal(max_digits=14, decimal_places=2)
SalesRequestStatus = Literal["OPEN", "IN_PROGRESS", "INVOICED", "SHIPPED", "CLOSED"]


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

    model_config = ConfigDict(from_attributes=True)


class SalesRequestCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None
    requested_fulfillment_date: Optional[date] = None
    status: SalesRequestStatus = "OPEN"
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
    status: SalesRequestStatus


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


# --- Enriched detail schemas for fulfillment workflow ---


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
