from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


AccountType = Literal["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS", "OTHER"]
ChartAccountImportMode = Literal["CREATE_ONLY", "UPDATE_EXISTING", "UPSERT"]
ChartAccountImportAction = Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
ChartAccountImportStatus = Literal["VALID", "ERROR"]


class AccountParentSummary(BaseModel):
    id: int
    name: str
    code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ChartAccountBase(BaseModel):
    name: str = Field(..., max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    type: AccountType
    subtype: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    is_active: bool = True
    parent_account_id: Optional[int] = None


class ChartAccountCreate(ChartAccountBase):
    pass


class ChartAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    type: Optional[AccountType] = None
    subtype: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    parent_account_id: Optional[int] = None


class ChartAccountResponse(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    type: str
    subtype: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    parent_account_id: Optional[int] = None
    parent_account: Optional[AccountParentSummary] = None
    created_at: datetime
    updated_at: datetime
    balance: Decimal = Decimal("0.00")

    model_config = ConfigDict(from_attributes=True)


class ChartAccountImportRequest(BaseModel):
    csv_data: str = Field(..., min_length=1)
    has_header: bool = True
    conflict_strategy: ChartAccountImportMode = "UPSERT"


class ChartAccountImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    accepted_values: list[str] = Field(default_factory=list)
    example: Optional[str] = None


class ChartAccountImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int


class ChartAccountImportRowResult(BaseModel):
    row_number: int
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    parent_code: Optional[str] = None
    action: ChartAccountImportAction
    status: ChartAccountImportStatus
    messages: list[str] = Field(default_factory=list)


class ChartAccountImportAccountResult(BaseModel):
    id: int
    code: str
    name: str
    action: Literal["CREATED", "UPDATED"]
    parent_account_id: Optional[int] = None


class ChartAccountImportResponse(BaseModel):
    summary: ChartAccountImportSummary
    rows: list[ChartAccountImportRowResult]
    imported_accounts: list[ChartAccountImportAccountResult] = Field(default_factory=list)


class ChartAccountImportFormatResponse(BaseModel):
    delimiter: str
    has_header: bool
    required_fields: list[str]
    optional_fields: list[str]
    fields: list[ChartAccountImportFieldSpec]
    sample_csv: str
    notes: list[str]
