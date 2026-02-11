from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


AccountType = Literal["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS", "OTHER"]


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

    model_config = ConfigDict(from_attributes=True)
