from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


class GLAccountBase(BaseModel):
    account_number: str
    name: str
    account_type: Literal["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]
    normal_balance: Literal["DEBIT", "CREDIT"]
    is_control_account: bool = False
    is_active: bool = True
    parent_account_id: Optional[int] = None


class GLAccountCreate(GLAccountBase):
    company_code_id: int


class GLAccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[Literal["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]] = None
    normal_balance: Optional[Literal["DEBIT", "CREDIT"]] = None
    is_control_account: Optional[bool] = None
    is_active: Optional[bool] = None
    parent_account_id: Optional[int] = None


class GLAccountResponse(GLAccountBase):
    id: int
    company_code_id: int

    class Config:
        from_attributes = True


class LedgerCreate(BaseModel):
    company_code_id: int
    name: str
    currency: str = "USD"
    fiscal_year_variant_id: int
    is_leading: bool = False
    timezone: str = "UTC"


class LedgerResponse(LedgerCreate):
    id: int

    class Config:
        from_attributes = True


class JournalLineIn(BaseModel):
    gl_account_id: int
    description: Optional[str] = None
    debit_amount: Decimal = Decimal("0.00")
    credit_amount: Decimal = Decimal("0.00")


class JournalCreate(BaseModel):
    company_code_id: int
    ledger_id: int
    document_type: str = "SA"
    posting_date: date
    document_date: date
    currency: str = "USD"
    reference: Optional[str] = None
    header_text: Optional[str] = None
    source_module: str = "MANUAL"
    created_by: Optional[str] = None
    idempotency_key: Optional[str] = None
    lines: list[JournalLineIn] = Field(default_factory=list)


class JournalUpdate(BaseModel):
    reference: Optional[str] = None
    header_text: Optional[str] = None
    lines: Optional[list[JournalLineIn]] = None


class JournalRow(BaseModel):
    id: int
    document_number: str
    posting_date: date
    document_type: str
    source_module: str
    reference: Optional[str]
    debits: Decimal
    credits: Decimal
    status: str
    updated_at: datetime


class JournalDetail(BaseModel):
    id: int
    document_number: str
    status: str
    posting_date: date
    period_number: int
    fiscal_year: int
    source_module: str
    lines: list[JournalLineIn]


class PostingBatchResponse(BaseModel):
    id: int
    ledger_id: int
    source_module: str
    source_batch_key: str
    status: str
    error_message: Optional[str]
    created_at: datetime
    posted_at: Optional[datetime]

    class Config:
        from_attributes = True


class TrialBalanceRow(BaseModel):
    gl_account_id: int
    account_number: str
    account_name: str
    account_type: str
    debit: Decimal
    credit: Decimal
    balance: Decimal


class FinancialStatementRow(BaseModel):
    account_type: str
    amount: Decimal
