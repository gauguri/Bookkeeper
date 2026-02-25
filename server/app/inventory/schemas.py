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


class InventoryAvailabilityResponse(BaseModel):
    item_id: int
    available_qty: DecimalValue


class InventoryAvailabilityBulkResponse(BaseModel):
    items: list[InventoryAvailabilityResponse]


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


class ReservationDetailResponse(BaseModel):
    source_type: str
    source_id: int
    source_label: str
    qty_reserved: DecimalValue


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


class InventorySummaryResponse(BaseModel):
    inventory_value: DecimalValue
    low_stock_items: int
    stockouts: int
    at_risk_items: int
    excess_dead_stock: int
    reserved_pressure_items: int


class InventoryQueueCount(BaseModel):
    key: str
    label: str
    count: int


class InventoryItemRow(BaseModel):
    id: int
    sku: Optional[str] = None
    item: str
    on_hand: DecimalValue
    reserved: DecimalValue
    available: DecimalValue
    reorder_point: DecimalValue
    safety_stock: DecimalValue
    lead_time_days: int
    avg_daily_usage: DecimalValue
    days_of_supply: DecimalValue
    suggested_reorder_qty: DecimalValue
    preferred_supplier: Optional[str] = None
    preferred_supplier_id: Optional[int] = None
    last_receipt: Optional[datetime] = None
    last_issue: Optional[datetime] = None
    total_value: DecimalValue
    inbound_qty: DecimalValue
    health_flag: str


class InventoryItemsResponse(BaseModel):
    items: list[InventoryItemRow]
    queue_counts: list[InventoryQueueCount]
    page: int
    page_size: int
    total: int


class InventoryTrendPoint(BaseModel):
    period: str
    value: DecimalValue


class InventoryHealthPoint(BaseModel):
    name: str
    value: int


class InventoryConsumptionPoint(BaseModel):
    item: str
    value: DecimalValue


class InventoryFlowPoint(BaseModel):
    period: str
    receipts: DecimalValue
    issues: DecimalValue
    reserved: DecimalValue


class InventoryAnalyticsResponse(BaseModel):
    value_trend: list[InventoryTrendPoint]
    health_breakdown: list[InventoryHealthPoint]
    top_consumption: list[InventoryConsumptionPoint]
    net_flow: list[InventoryFlowPoint]


class InventoryItemDetailResponse(BaseModel):
    item: InventoryItemRow
    movements: list[dict]
    reservations: list[ReservationDetailResponse]
    reorder_explanation: str


class InventoryPlanningUpdate(BaseModel):
    reorder_point_qty: Optional[DecimalValue] = Field(default=None, ge=0)
    safety_stock_qty: Optional[DecimalValue] = Field(default=None, ge=0)
    target_days_supply: Optional[DecimalValue] = Field(default=None, ge=1)


class ReorderRecommendationResponse(BaseModel):
    item_id: int
    item: str
    supplier_id: Optional[int] = None
    supplier: Optional[str] = None
    suggested_order_qty: DecimalValue
    days_of_supply: DecimalValue
