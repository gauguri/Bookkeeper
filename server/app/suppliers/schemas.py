from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, condecimal


DecimalValue = condecimal(max_digits=14, decimal_places=2)
SupplierStatus = Literal["active", "inactive"]
SupplierImportConflictStrategy = Literal["CREATE_ONLY", "UPDATE_EXISTING", "UPSERT"]
SupplierImportRowAction = Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
SupplierImportRowStatus = Literal["VALID", "ERROR"]
SupplierImportRecordAction = Literal["CREATED", "UPDATED"]


class SupplierBase(BaseModel):
    vendor_number: Optional[str] = Field(None, max_length=100)
    name: str = Field(..., max_length=200)
    legal_name: Optional[str] = Field(None, max_length=200)
    website: Optional[HttpUrl] = None
    tax_id: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    remit_to_address: Optional[str] = None
    ship_from_address: Optional[str] = None
    status: SupplierStatus = "active"
    default_lead_time_days: Optional[int] = Field(None, ge=0)
    payment_terms: Optional[str] = Field(None, max_length=100)
    currency: str = Field("USD", max_length=10)
    shipping_terms: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    vendor_number: Optional[str] = Field(None, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    legal_name: Optional[str] = Field(None, max_length=200)
    website: Optional[HttpUrl] = None
    tax_id: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    remit_to_address: Optional[str] = None
    ship_from_address: Optional[str] = None
    status: Optional[SupplierStatus] = None
    default_lead_time_days: Optional[int] = Field(None, ge=0)
    payment_terms: Optional[str] = Field(None, max_length=100)
    currency: Optional[str] = Field(None, max_length=10)
    shipping_terms: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class SupplierStatusPatch(BaseModel):
    status: SupplierStatus


class SupplierResponse(SupplierBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupplierListResponse(BaseModel):
    data: List[SupplierResponse]
    total: int
    page: int
    page_size: int


class SupplierSummaryResponse(BaseModel):
    active_suppliers: int
    suppliers_with_open_pos: int
    average_lead_time_days: float
    on_time_delivery_percent: float
    catalog_coverage_percent: float


class SupplierItemBase(BaseModel):
    supplier_cost: DecimalValue = Field(Decimal("0.00"), ge=0)
    freight_cost: DecimalValue = Field(Decimal("0.00"), ge=0)
    tariff_cost: DecimalValue = Field(Decimal("0.00"), ge=0)
    default_unit_cost: Optional[DecimalValue] = Field(None, ge=0)
    supplier_sku: Optional[str] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[DecimalValue] = Field(None, ge=0)
    notes: Optional[str] = None
    is_preferred: bool = False
    is_active: bool = True


class SupplierItemCreate(SupplierItemBase):
    supplier_id: int


class SupplierItemCreateForSupplier(SupplierItemBase):
    item_id: int


class SupplierItemBulkCreate(BaseModel):
    items: List[SupplierItemCreateForSupplier]


class SupplierItemUpdate(BaseModel):
    supplier_cost: Optional[DecimalValue] = Field(None, ge=0)
    freight_cost: Optional[DecimalValue] = Field(None, ge=0)
    tariff_cost: Optional[DecimalValue] = Field(None, ge=0)
    default_unit_cost: Optional[DecimalValue] = Field(None, ge=0)
    supplier_sku: Optional[str] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[DecimalValue] = Field(None, ge=0)
    notes: Optional[str] = None
    is_preferred: Optional[bool] = None
    is_active: Optional[bool] = None


class SupplierItemResponse(SupplierItemBase):
    supplier_id: int
    item_id: int
    supplier_name: str
    landed_cost: Decimal

    model_config = ConfigDict(from_attributes=True)


class SupplierItemBySupplierResponse(SupplierItemBase):
    id: int
    supplier_id: int
    item_id: int
    item_name: str
    sku: Optional[str] = None
    item_sku: Optional[str] = None
    default_unit_cost: DecimalValue
    item_unit_price: Decimal
    landed_cost: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupplierImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    accepted_values: List[str] = Field(default_factory=list)
    example: Optional[str] = None


class SupplierImportFormatResponse(BaseModel):
    delimiter: str = ","
    has_header: bool = True
    required_fields: List[str]
    optional_fields: List[str]
    fields: List[SupplierImportFieldSpec]
    sample_csv: str
    notes: List[str]


class SupplierImportRequest(BaseModel):
    csv_data: str
    has_header: bool = True
    conflict_strategy: SupplierImportConflictStrategy = "UPSERT"


class SupplierImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int


class SupplierImportRowResult(BaseModel):
    row_number: int
    name: Optional[str] = None
    email: Optional[str] = None
    status_value: Optional[SupplierStatus] = None
    action: SupplierImportRowAction
    status: SupplierImportRowStatus
    messages: List[str]


class SupplierImportSupplierResult(BaseModel):
    id: int
    name: str
    action: SupplierImportRecordAction


class SupplierImportResponse(BaseModel):
    summary: SupplierImportSummary
    rows: List[SupplierImportRowResult]
    imported_suppliers: List[SupplierImportSupplierResult]
