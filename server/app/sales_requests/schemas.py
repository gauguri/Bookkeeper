from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal, model_validator


DecimalValue = condecimal(max_digits=14, decimal_places=2)
SalesRequestStatus = Literal["OPEN", "IN_PROGRESS", "CLOSED"]


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
