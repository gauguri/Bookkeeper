from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class SalesRequestLineBase(BaseModel):
    item_id: int
    qty_requested: DecimalValue = Field(..., gt=0)
    unit_price_quote: Optional[DecimalValue] = None


class SalesRequestLineCreate(SalesRequestLineBase):
    pass


class SalesRequestLineResponse(SalesRequestLineBase):
    id: int
    qty_reserved: DecimalValue
    status: str

    model_config = ConfigDict(from_attributes=True)


class SalesRequestBase(BaseModel):
    customer_id: Optional[int] = None
    requested_by_user_id: Optional[int] = None
    notes: Optional[str] = None


class SalesRequestCreate(SalesRequestBase):
    lines: List[SalesRequestLineCreate]


class SalesRequestResponse(SalesRequestBase):
    id: int
    status: str
    requested_at: datetime
    lines: List[SalesRequestLineResponse]

    model_config = ConfigDict(from_attributes=True)


class SalesRequestSubmitResponse(BaseModel):
    id: int
    status: str
    lines: List[SalesRequestLineResponse]

    model_config = ConfigDict(from_attributes=True)
