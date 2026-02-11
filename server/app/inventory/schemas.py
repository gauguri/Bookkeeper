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


class InventoryRecordBase(BaseModel):
    item_id: int
    quantity_on_hand: DecimalValue = Field(default=Decimal("0"), ge=0)
    landed_unit_cost: DecimalValue = Field(default=Decimal("0"), ge=0)


class InventoryRecordCreate(InventoryRecordBase):
    pass


class InventoryRecordUpdate(BaseModel):
    quantity_on_hand: DecimalValue = Field(..., ge=0)
    landed_unit_cost: DecimalValue = Field(..., ge=0)


class InventoryRecordResponse(BaseModel):
    id: int
    item_id: int
    item_name: str
    item_sku: Optional[str] = None
    quantity_on_hand: DecimalValue
    landed_unit_cost: DecimalValue
    total_value: DecimalValue
    last_updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
