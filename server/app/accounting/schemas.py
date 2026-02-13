from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


JournalSourceType = Literal["MANUAL", "PURCHASE_ORDER"]
JournalDirection = Literal["DEBIT", "CREDIT"]


class JournalLineCreate(BaseModel):
    account_id: int
    direction: JournalDirection
    amount: Decimal = Field(..., gt=Decimal("0"))


class JournalEntryCreate(BaseModel):
    date: date
    memo: Optional[str] = None
    source_type: JournalSourceType = "MANUAL"
    source_id: Optional[int] = None
    lines: list[JournalLineCreate]

    @field_validator("lines")
    @classmethod
    def validate_lines(cls, value: list[JournalLineCreate]) -> list[JournalLineCreate]:
        if len(value) != 2:
            raise ValueError("Journal entries must include exactly 2 lines for this workflow.")
        directions = {line.direction for line in value}
        if directions != {"DEBIT", "CREDIT"}:
            raise ValueError("Journal entries must include one DEBIT line and one CREDIT line.")
        debit_total = sum((line.amount for line in value if line.direction == "DEBIT"), Decimal("0"))
        credit_total = sum((line.amount for line in value if line.direction == "CREDIT"), Decimal("0"))
        if debit_total != credit_total:
            raise ValueError("Debit and credit amounts must match.")
        return value


class JournalLineResponse(BaseModel):
    id: int
    account_id: int
    direction: JournalDirection
    amount: Decimal

    model_config = ConfigDict(from_attributes=True)


class JournalEntryResponse(BaseModel):
    id: int
    date: date
    memo: Optional[str] = None
    source_type: str
    source_id: Optional[int] = None
    created_at: datetime
    lines: list[JournalLineResponse]


class JournalEntryListRow(BaseModel):
    id: int
    date: date
    memo: Optional[str] = None
    amount: Decimal
    source_type: str
    debit_account_id: int
    credit_account_id: int
    debit_account: str
    credit_account: str
