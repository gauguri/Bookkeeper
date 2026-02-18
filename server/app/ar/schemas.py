from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal

DecimalValue = condecimal(max_digits=14, decimal_places=2)


class ARAgingCustomerRow(BaseModel):
    customer_id: int
    customer_name: str
    current: DecimalValue
    bucket_31_60: DecimalValue = Field(alias="31_60")
    bucket_61_90: DecimalValue = Field(alias="61_90")
    bucket_90_plus: DecimalValue = Field(alias="90_plus")
    total: DecimalValue
    avg_days_to_pay: Optional[Decimal] = None
    last_action_at: Optional[datetime] = None
    last_action_type: Optional[str] = None
    follow_up_date: Optional[date] = None

    model_config = ConfigDict(populate_by_name=True)


class ARNoteCreate(BaseModel):
    customer_id: int
    note: str = Field(..., min_length=1, max_length=2000)
    follow_up_date: Optional[date] = None


class ARReminderCreate(BaseModel):
    customer_id: int
    note: Optional[str] = Field(None, max_length=2000)
    follow_up_date: Optional[date] = None
    channel: str = Field(default="EMAIL", max_length=20)


class ARActivityResponse(BaseModel):
    id: int
    customer_id: int
    activity_type: str
    note: Optional[str] = None
    follow_up_date: Optional[date] = None
    reminder_channel: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
