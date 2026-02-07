from dataclasses import dataclass
from decimal import Decimal
from typing import List


@dataclass(frozen=True)
class JournalLineInput:
    account_id: int
    debit: Decimal = Decimal("0.00")
    credit: Decimal = Decimal("0.00")
    description: str | None = None


@dataclass(frozen=True)
class JournalEntryInput:
    company_id: int
    txn_date: str
    description: str
    source_type: str
    source_id: int | None
    lines: List[JournalLineInput]


class UnbalancedEntryError(ValueError):
    pass


def ensure_balanced(lines: List[JournalLineInput]) -> None:
    total_debits = sum((line.debit for line in lines), Decimal("0.00"))
    total_credits = sum((line.credit for line in lines), Decimal("0.00"))
    if total_debits != total_credits:
        raise UnbalancedEntryError(
            f"Journal entry is unbalanced: debits={total_debits} credits={total_credits}"
        )


def build_invoice_entry(
    *,
    company_id: int,
    txn_date: str,
    accounts_receivable_id: int,
    revenue_account_id: int,
    amount: Decimal,
    description: str,
    source_id: int | None = None,
) -> JournalEntryInput:
    lines = [
        JournalLineInput(account_id=accounts_receivable_id, debit=amount, credit=Decimal("0.00")),
        JournalLineInput(account_id=revenue_account_id, debit=Decimal("0.00"), credit=amount),
    ]
    ensure_balanced(lines)
    return JournalEntryInput(
        company_id=company_id,
        txn_date=txn_date,
        description=description,
        source_type="invoice",
        source_id=source_id,
        lines=lines,
    )


def build_payment_entry(
    *,
    company_id: int,
    txn_date: str,
    cash_account_id: int,
    accounts_receivable_id: int,
    amount: Decimal,
    description: str,
    source_id: int | None = None,
) -> JournalEntryInput:
    lines = [
        JournalLineInput(account_id=cash_account_id, debit=amount, credit=Decimal("0.00")),
        JournalLineInput(account_id=accounts_receivable_id, debit=Decimal("0.00"), credit=amount),
    ]
    ensure_balanced(lines)
    return JournalEntryInput(
        company_id=company_id,
        txn_date=txn_date,
        description=description,
        source_type="payment",
        source_id=source_id,
        lines=lines,
    )
