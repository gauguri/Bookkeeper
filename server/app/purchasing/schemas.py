from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class PurchaseOrderLineBase(BaseModel):
    item_id: int
    qty_ordered: DecimalValue = Field(..., gt=0)
    unit_cost: Optional[DecimalValue] = None
    freight_cost: Optional[DecimalValue] = None
    tariff_cost: Optional[DecimalValue] = None


class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass


class PurchaseOrderLineResponse(BaseModel):
    id: int
    item_id: int
    qty_ordered: DecimalValue
    unit_cost: DecimalValue
    freight_cost: DecimalValue
    tariff_cost: DecimalValue
    landed_cost: DecimalValue
    qty_received: DecimalValue

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderBase(BaseModel):
    supplier_id: int
    order_date: date
    expected_date: Optional[date] = None
    notes: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    lines: List[PurchaseOrderLineCreate]


class PurchaseOrderUpdate(BaseModel):
    status: Optional[str] = None
    expected_date: Optional[date] = None
    notes: Optional[str] = None


class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    status: str
    created_at: datetime
    lines: List[PurchaseOrderLineResponse]

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderReceiveLine(BaseModel):
    line_id: int
    qty_received: DecimalValue = Field(..., gt=0)


class PurchaseOrderReceivePayload(BaseModel):
    lines: List[PurchaseOrderReceiveLine]
