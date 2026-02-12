from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from app.models import Account, JournalEntry, JournalLine

DEBIT_NORMAL_TYPES = {"ASSET", "EXPENSE", "COGS"}


def create_journal_entry(
    db: Session,
    *,
    company_id: int,
    entry_date: date,
    memo: Optional[str],
    source_type: str,
    source_id: Optional[int],
    debit_account_id: int,
    credit_account_id: int,
    amount: Decimal,
) -> JournalEntry:
    if debit_account_id == credit_account_id:
        raise ValueError("Debit and credit accounts must be different.")
    if amount <= 0:
        raise ValueError("Amount must be greater than zero.")

    account_ids = {debit_account_id, credit_account_id}
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    if len(accounts) != 2:
        raise ValueError("One or more accounts were not found.")

    entry = JournalEntry(
        company_id=company_id,
        txn_date=entry_date,
        description=memo,
        source_type=source_type,
        source_id=source_id,
    )
    entry.lines = [
        JournalLine(account_id=debit_account_id, debit=amount, credit=Decimal("0.00")),
        JournalLine(account_id=credit_account_id, debit=Decimal("0.00"), credit=amount),
    ]
    db.add(entry)
    db.flush()
    return (
        db.query(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .filter(JournalEntry.id == entry.id)
        .first()
    )


def compute_account_balance(account_type: str, debit: Decimal, credit: Decimal) -> Decimal:
    """MVP balance rules by account type: debit-normal types increase on debit, others on credit."""
    if (account_type or "").upper() in DEBIT_NORMAL_TYPES:
        return debit - credit
    return credit - debit
