from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class InventoryItemResponse(BaseModel):
    id: int
    sku: Optional[str] = None
    name: str
    on_hand_qty: DecimalValue
    reserved_qty: DecimalValue
    available_qty: DecimalValue
    reorder_point: Optional[DecimalValue] = None

    model_config = ConfigDict(from_attributes=True)


class InventoryAdjustmentCreate(BaseModel):
    item_id: int
    qty_delta: DecimalValue = Field(..., description="Positive or negative adjustment quantity.")
    reason: Optional[str] = None


class InventoryAdjustmentResponse(BaseModel):
    id: int
    item_id: int
    txn_type: str
    qty_delta: DecimalValue
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
