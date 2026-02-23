from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BankAccountResponse(BaseModel):
    id: int
    name: str
    institution: str
    account_type: str
    last4: str
    currency: str
    opening_balance: Decimal
    current_balance: Optional[Decimal] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class BankTransactionResponse(BaseModel):
    id: int
    bank_account_id: int
    posted_date: date
    description: str
    amount: Decimal
    currency: str
    direction: str
    category: Optional[str] = None
    vendor: Optional[str] = None
    reference: Optional[str] = None
    source: str
    status: str
    excluded_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MatchLinkCreate(BaseModel):
    bank_transaction_id: int
    linked_entity_type: str
    linked_entity_id: int
    match_confidence: Optional[Decimal] = None
    match_type: str = "manual"


class MatchLinkResponse(BaseModel):
    id: int
    bank_transaction_id: int
    linked_entity_type: str
    linked_entity_id: int
    match_confidence: Optional[Decimal] = None
    match_type: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReconciliationSessionCreate(BaseModel):
    bank_account_id: int
    period_start: date
    period_end: date
    statement_ending_balance: Decimal


class ReconciliationSessionResponse(BaseModel):
    id: int
    bank_account_id: int
    period_start: date
    period_end: date
    statement_ending_balance: Decimal
    status: str
    reconciled_at: Optional[datetime] = None
    created_by: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BankingKpiResponse(BaseModel):
    cash_balance: Decimal
    unreconciled_transactions: int
    items_needing_review: int
    reconciled_this_month: int
    exceptions_count: int


class CategoryPoint(BaseModel):
    category: str
    value: Decimal


class TrendPoint(BaseModel):
    day: date
    balance: Decimal


class ReconciliationProgressPoint(BaseModel):
    account: str
    reconciled: int
    unreconciled: int


class BankingDashboardResponse(BaseModel):
    kpis: BankingKpiResponse
    cash_trend: list[TrendPoint]
    category_breakdown: list[CategoryPoint]
    reconciliation_progress: list[ReconciliationProgressPoint]


class TransactionListResponse(BaseModel):
    items: list[BankTransactionResponse]
    total: int


class CsvImportRow(BaseModel):
    date: str
    description: str
    amount: Optional[str] = None
    debit: Optional[str] = None
    credit: Optional[str] = None
    currency: Optional[str] = "USD"
    reference: Optional[str] = None
    vendor: Optional[str] = None


class CsvImportPayload(BaseModel):
    bank_account_id: int
    source: str = "csv"
    rows: list[CsvImportRow] = Field(default_factory=list)


class CsvImportResult(BaseModel):
    imported_count: int
    errors: list[str]


class MatchCandidate(BaseModel):
    entity_type: str
    entity_id: int
    date: date
    description: str
    amount: Decimal
    confidence: Decimal


class ReconciliationWorkspaceResponse(BaseModel):
    session: ReconciliationSessionResponse
    cleared_count: int
    uncleared_count: int
    difference: Decimal
    uncleared_transactions: list[BankTransactionResponse]
    needs_review_transactions: list[BankTransactionResponse]
    candidates: dict[int, list[MatchCandidate]]
