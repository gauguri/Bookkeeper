"""Pydantic schemas for SAP-level inventory management."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# UoM
# ---------------------------------------------------------------------------

class UomCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    category: str = Field(default="quantity", max_length=20)
    is_base: bool = False


class UomResponse(BaseModel):
    id: int
    code: str
    name: str
    category: str
    is_base: bool
    model_config = ConfigDict(from_attributes=True)


class UomConversionCreate(BaseModel):
    item_id: Optional[int] = None
    from_uom_id: int
    to_uom_id: int
    conversion_factor: Decimal


class UomConversionResponse(BaseModel):
    id: int
    item_id: Optional[int] = None
    from_uom_id: int
    to_uom_id: int
    conversion_factor: Decimal
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Item Categories
# ---------------------------------------------------------------------------

class CategoryCreate(BaseModel):
    parent_id: Optional[int] = None
    name: str = Field(..., max_length=200)
    code: str = Field(..., max_length=50)
    description: Optional[str] = None
    sort_order: int = 0
    inherited_properties: Optional[dict] = None


class CategoryResponse(BaseModel):
    id: int
    parent_id: Optional[int] = None
    name: str
    code: str
    description: Optional[str] = None
    level: int
    sort_order: int
    is_active: bool
    path: str
    children: list["CategoryResponse"] = []
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Warehouses & Hierarchy
# ---------------------------------------------------------------------------

class WarehouseCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    warehouse_type: str = "standard"
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None


class WarehouseResponse(BaseModel):
    id: int
    code: str
    name: str
    warehouse_type: str
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ZoneCreate(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    zone_type: str = "storage"
    temperature_min: Optional[Decimal] = None
    temperature_max: Optional[Decimal] = None


class ZoneResponse(BaseModel):
    id: int
    warehouse_id: int
    code: str
    name: str
    zone_type: str
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class BinResponse(BaseModel):
    id: int
    shelf_id: int
    code: str
    name: str
    bin_type: str
    is_occupied: bool
    is_active: bool
    current_utilization_pct: Optional[Decimal] = None
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Batches & Serials
# ---------------------------------------------------------------------------

class BatchCreate(BaseModel):
    item_id: int
    batch_number: Optional[str] = None
    vendor_batch_number: Optional[str] = None
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    received_date: Optional[date] = None
    country_of_origin: Optional[str] = None
    notes: Optional[str] = None


class BatchResponse(BaseModel):
    id: int
    item_id: int
    batch_number: str
    vendor_batch_number: Optional[str] = None
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    received_date: Optional[date] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SerialCreate(BaseModel):
    item_id: int
    serial_number: str
    batch_id: Optional[int] = None
    current_warehouse_id: Optional[int] = None
    notes: Optional[str] = None


class SerialResponse(BaseModel):
    id: int
    item_id: int
    serial_number: str
    batch_id: Optional[int] = None
    status: str
    current_warehouse_id: Optional[int] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

class TransactionLineInput(BaseModel):
    item_id: int
    quantity: Decimal = Field(..., gt=0)
    batch_id: Optional[int] = None
    serial_id: Optional[int] = None
    source_bin_id: Optional[int] = None
    destination_bin_id: Optional[int] = None
    unit_cost: Optional[Decimal] = None
    reason_code_id: Optional[int] = None
    notes: Optional[str] = None


class GoodsReceiptCreate(BaseModel):
    warehouse_id: int
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    transaction_date: Optional[date] = None
    notes: Optional[str] = None
    lines: list[TransactionLineInput]


class GoodsIssueCreate(BaseModel):
    warehouse_id: int
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    transaction_date: Optional[date] = None
    notes: Optional[str] = None
    lines: list[TransactionLineInput]


class StockTransferCreate(BaseModel):
    source_warehouse_id: int
    destination_warehouse_id: int
    reference_number: Optional[str] = None
    transaction_date: Optional[date] = None
    notes: Optional[str] = None
    lines: list[TransactionLineInput]


class StockAdjustmentCreate(BaseModel):
    warehouse_id: int
    reason_code_id: Optional[int] = None
    transaction_date: Optional[date] = None
    notes: Optional[str] = None
    lines: list[TransactionLineInput]


class TransactionLineResponse(BaseModel):
    id: int
    item_id: int
    line_number: int
    quantity: Decimal
    batch_id: Optional[int] = None
    serial_id: Optional[int] = None
    unit_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class TransactionHeaderResponse(BaseModel):
    id: int
    transaction_number: str
    transaction_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    source_warehouse_id: Optional[int] = None
    destination_warehouse_id: Optional[int] = None
    transaction_date: date
    posting_date: date
    status: str
    reversal_of_id: Optional[int] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    lines: list[TransactionLineResponse] = []
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Stock
# ---------------------------------------------------------------------------

class StockOnHandResponse(BaseModel):
    id: int
    item_id: int
    warehouse_id: int
    zone_id: Optional[int] = None
    bin_id: Optional[int] = None
    batch_id: Optional[int] = None
    serial_id: Optional[int] = None
    stock_type: str
    quantity: Decimal
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------

class ReservationCreate(BaseModel):
    item_id: int
    warehouse_id: Optional[int] = None
    reservation_type: str = "soft"
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reserved_quantity: Decimal = Field(..., gt=0)
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None


class ReservationResponse(BaseModel):
    id: int
    item_id: int
    warehouse_id: Optional[int] = None
    reservation_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    reserved_quantity: Decimal
    fulfilled_quantity: Decimal
    status: str
    reserved_at: datetime
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Count Plans
# ---------------------------------------------------------------------------

class CountPlanCreate(BaseModel):
    plan_type: str = "cycle_count"
    warehouse_id: Optional[int] = None
    scheduled_date: Optional[date] = None
    freeze_stock: bool = False
    notes: Optional[str] = None
    item_ids: list[int] = []


class CountPlanItemResponse(BaseModel):
    id: int
    item_id: int
    system_quantity: Decimal
    counted_quantity: Optional[Decimal] = None
    variance_quantity: Optional[Decimal] = None
    variance_pct: Optional[Decimal] = None
    count_status: str
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CountPlanResponse(BaseModel):
    id: int
    plan_number: str
    plan_type: str
    warehouse_id: Optional[int] = None
    status: str
    scheduled_date: Optional[date] = None
    items: list[CountPlanItemResponse] = []
    model_config = ConfigDict(from_attributes=True)


class RecordCountInput(BaseModel):
    counted_quantity: Decimal = Field(..., ge=0)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------

class InspectionLotCreate(BaseModel):
    item_id: int
    batch_id: Optional[int] = None
    transaction_id: Optional[int] = None
    inspection_type: str = "goods_receipt"
    quantity: Decimal
    sample_size: Optional[Decimal] = None


class InspectionParameterInput(BaseModel):
    parameter_name: str
    parameter_type: str = "quantitative"
    target_value: Optional[str] = None
    min_value: Optional[Decimal] = None
    max_value: Optional[Decimal] = None
    actual_value: Optional[str] = None
    result: Optional[str] = None


class InspectionLotResponse(BaseModel):
    id: int
    lot_number: str
    item_id: int
    batch_id: Optional[int] = None
    inspection_type: str
    status: str
    quantity: Decimal
    sample_size: Optional[Decimal] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class NcrCreate(BaseModel):
    inspection_lot_id: Optional[int] = None
    item_id: int
    batch_id: Optional[int] = None
    defect_type: Optional[str] = None
    severity: str = "minor"
    description: Optional[str] = None


class NcrResponse(BaseModel):
    id: int
    ncr_number: str
    item_id: int
    batch_id: Optional[int] = None
    defect_type: Optional[str] = None
    severity: str
    status: str
    description: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class StockOverviewRow(BaseModel):
    item_id: int
    item_name: str
    item_sku: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    unrestricted_qty: Decimal = Decimal("0")
    quality_qty: Decimal = Decimal("0")
    blocked_qty: Decimal = Decimal("0")
    in_transit_qty: Decimal = Decimal("0")
    reserved_qty: Decimal = Decimal("0")
    total_qty: Decimal = Decimal("0")
    unit_cost: Decimal = Decimal("0")
    total_value: Decimal = Decimal("0")


class DashboardKPIs(BaseModel):
    total_stock_value: Decimal = Decimal("0")
    total_items: int = 0
    stockout_count: int = 0
    below_reorder_count: int = 0
    pending_receipts: int = 0
    expiring_soon: int = 0
    warehouse_count: int = 0


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SettingUpdate(BaseModel):
    value: str


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel):
    data: list = []
    meta: dict = {}
