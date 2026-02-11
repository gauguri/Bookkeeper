from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class PurchaseOrderLineBase(BaseModel):
    item_id: int
    quantity: DecimalValue = Field(..., gt=0)
    unit_cost: Optional[DecimalValue] = None
    freight_cost: Optional[DecimalValue] = None
    tariff_cost: Optional[DecimalValue] = None


class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass


class PurchaseOrderLineResponse(BaseModel):
    id: int
    item_id: int
    item_name: str
    quantity: DecimalValue
    unit_cost: DecimalValue
    freight_cost: DecimalValue
    tariff_cost: DecimalValue
    landed_cost: DecimalValue
    qty_received: DecimalValue
    line_total: DecimalValue

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderBase(BaseModel):
    supplier_id: int
    order_date: date
    expected_date: Optional[date] = None
    notes: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    po_number: Optional[str] = None
    lines: List[PurchaseOrderLineCreate]


class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[int] = None
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    notes: Optional[str] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None


class PurchaseOrderListResponse(BaseModel):
    id: int
    po_number: str
    supplier_name: str
    order_date: date
    status: str
    total: DecimalValue


class PurchaseOrderSendResponse(BaseModel):
    id: int
    status: str
    sent_at: Optional[datetime]


class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    po_number: str
    status: str
    total: DecimalValue
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime] = None
    lines: List[PurchaseOrderLineResponse]

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderReceiveLine(BaseModel):
    line_id: int
    qty_received: DecimalValue = Field(..., gt=0)


class PurchaseOrderReceivePayload(BaseModel):
    lines: List[PurchaseOrderReceiveLine]
