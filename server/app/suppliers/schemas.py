from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)


class SupplierBase(BaseModel):
    name: str = Field(..., max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class SupplierResponse(SupplierBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupplierItemBase(BaseModel):
    supplier_cost: DecimalValue = Field(..., ge=0)
    freight_cost: DecimalValue = Field(0, ge=0)
    tariff_cost: DecimalValue = Field(0, ge=0)
    supplier_sku: Optional[str] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[DecimalValue] = Field(None, ge=0)
    notes: Optional[str] = None
    is_preferred: bool = False


class SupplierItemCreate(SupplierItemBase):
    supplier_id: int


class SupplierItemCreateForSupplier(SupplierItemBase):
    item_id: int


class SupplierItemUpdate(BaseModel):
    supplier_cost: Optional[DecimalValue] = Field(None, ge=0)
    freight_cost: Optional[DecimalValue] = Field(None, ge=0)
    tariff_cost: Optional[DecimalValue] = Field(None, ge=0)
    supplier_sku: Optional[str] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[DecimalValue] = Field(None, ge=0)
    notes: Optional[str] = None
    is_preferred: Optional[bool] = None


class SupplierItemResponse(SupplierItemBase):
    supplier_id: int
    item_id: int
    supplier_name: str
    landed_cost: Decimal

    model_config = ConfigDict(from_attributes=True)


class SupplierItemBySupplierResponse(SupplierItemBase):
    supplier_id: int
    item_id: int
    item_name: str
    item_sku: Optional[str] = None
    item_unit_price: Decimal
    landed_cost: Decimal

    model_config = ConfigDict(from_attributes=True)
