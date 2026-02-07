from decimal import Decimal
import pytest

from app.accounting.posting import (
    UnbalancedEntryError,
    build_invoice_entry,
    build_payment_entry,
    ensure_balanced,
    JournalLineInput,
)


def test_balanced_entry_passes():
    lines = [
        JournalLineInput(account_id=1, debit=Decimal("10.00"), credit=Decimal("0.00")),
        JournalLineInput(account_id=2, debit=Decimal("0.00"), credit=Decimal("10.00")),
    ]
    ensure_balanced(lines)


def test_unbalanced_entry_raises():
    lines = [
        JournalLineInput(account_id=1, debit=Decimal("10.00"), credit=Decimal("0.00")),
        JournalLineInput(account_id=2, debit=Decimal("0.00"), credit=Decimal("9.00")),
    ]
    with pytest.raises(UnbalancedEntryError):
        ensure_balanced(lines)


def test_invoice_entry_balances():
    entry = build_invoice_entry(
        company_id=1,
        txn_date="2024-01-01",
        accounts_receivable_id=10,
        revenue_account_id=20,
        amount=Decimal("250.00"),
        description="Invoice #1001",
    )
    debits = sum(line.debit for line in entry.lines)
    credits = sum(line.credit for line in entry.lines)
    assert debits == credits == Decimal("250.00")


def test_payment_entry_balances():
    entry = build_payment_entry(
        company_id=1,
        txn_date="2024-01-02",
        cash_account_id=30,
        accounts_receivable_id=10,
        amount=Decimal("250.00"),
        description="Payment #2001",
    )
    debits = sum(line.debit for line in entry.lines)
    credits = sum(line.credit for line in entry.lines)
    assert debits == credits == Decimal("250.00")
