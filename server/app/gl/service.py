from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import re
from typing import Iterable, Sequence

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import (
    GLAccount,
    GLBalance,
    GLJournalHeader,
    GLJournalLine,
    GLLedger,
    GLPostingBatch,
    GLPostingLink,
    Invoice,
    Payment,
    PostingPeriodStatus,
    PurchaseOrder,
)

ZERO = Decimal("0.00")


def _to_decimal(value: Decimal | float | int | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _get_period(posting_date: date) -> tuple[int, int]:
    return posting_date.year, posting_date.month


def ensure_period_open(db: Session, company_code_id: int, fiscal_year: int, period_number: int) -> None:
    status = (
        db.query(PostingPeriodStatus)
        .filter(
            PostingPeriodStatus.company_code_id == company_code_id,
            PostingPeriodStatus.fiscal_year == fiscal_year,
            PostingPeriodStatus.period_number == period_number,
        )
        .first()
    )
    if status and not status.is_open:
        raise ValueError(f"Posting period {fiscal_year}-{period_number:02d} is closed.")


def validate_balanced(lines: Sequence[GLJournalLine]) -> tuple[Decimal, Decimal]:
    debits = sum((_to_decimal(line.debit_amount) for line in lines), ZERO)
    credits = sum((_to_decimal(line.credit_amount) for line in lines), ZERO)
    if debits != credits:
        raise ValueError(f"Journal is unbalanced: debits={debits} credits={credits}")
    return debits, credits


def next_doc_number(db: Session, ledger_id: int, fiscal_year: int) -> str:
    prefix = f"GL-{fiscal_year}-"
    latest = (
        db.query(GLJournalHeader.document_number)
        .filter(
            GLJournalHeader.ledger_id == ledger_id,
            GLJournalHeader.fiscal_year == fiscal_year,
            GLJournalHeader.document_number.like(f"{prefix}%"),
        )
        .order_by(GLJournalHeader.document_number.desc())
        .first()
    )
    next_number = 1
    if latest and latest[0]:
        match = re.match(rf"^GL-{fiscal_year}-(\d+)$", latest[0])
        if match:
            next_number = int(match.group(1)) + 1
    return f"{prefix}{next_number:06d}"


def apply_balances(db: Session, header: GLJournalHeader, reverse: bool = False) -> None:
    multiplier = Decimal("-1") if reverse else Decimal("1")
    by_account: dict[int, tuple[Decimal, Decimal]] = defaultdict(lambda: (ZERO, ZERO))
    for line in header.lines:
        debit = _to_decimal(line.debit_amount) * multiplier
        credit = _to_decimal(line.credit_amount) * multiplier
        prior_d, prior_c = by_account[line.gl_account_id]
        by_account[line.gl_account_id] = (prior_d + debit, prior_c + credit)

    for gl_account_id, (debit, credit) in by_account.items():
        bal = (
            db.query(GLBalance)
            .filter(
                GLBalance.ledger_id == header.ledger_id,
                GLBalance.fiscal_year == header.fiscal_year,
                GLBalance.period_number == header.period_number,
                GLBalance.gl_account_id == gl_account_id,
            )
            .first()
        )
        if not bal:
            bal = GLBalance(
                ledger_id=header.ledger_id,
                fiscal_year=header.fiscal_year,
                period_number=header.period_number,
                gl_account_id=gl_account_id,
                opening_balance=ZERO,
                period_debits=ZERO,
                period_credits=ZERO,
                closing_balance=ZERO,
            )
            db.add(bal)
        bal.period_debits = _to_decimal(bal.period_debits) + debit
        bal.period_credits = _to_decimal(bal.period_credits) + credit
        account = db.get(GLAccount, gl_account_id)
        if account and account.normal_balance == "DEBIT":
            bal.closing_balance = _to_decimal(bal.opening_balance) + _to_decimal(bal.period_debits) - _to_decimal(bal.period_credits)
        else:
            bal.closing_balance = _to_decimal(bal.opening_balance) - _to_decimal(bal.period_debits) + _to_decimal(bal.period_credits)


def create_journal(db: Session, payload) -> GLJournalHeader:
    fiscal_year, period_number = _get_period(payload.posting_date)
    ensure_period_open(db, payload.company_code_id, fiscal_year, period_number)

    def _existing_by_idempotency() -> GLJournalHeader | None:
        if not payload.idempotency_key:
            return None
        return (
            db.query(GLJournalHeader)
            .filter(
                GLJournalHeader.ledger_id == payload.ledger_id,
                GLJournalHeader.idempotency_key == payload.idempotency_key,
            )
            .first()
        )

    existing = _existing_by_idempotency()
    if existing:
        return existing

    line_account_ids = {line.gl_account_id for line in payload.lines}
    if line_account_ids:
        valid_ids = {
            row[0]
            for row in db.query(GLAccount.id)
            .filter(GLAccount.company_code_id == payload.company_code_id, GLAccount.id.in_(line_account_ids))
            .all()
        }
        missing_ids = sorted(line_account_ids - valid_ids)
        if missing_ids:
            raise ValueError(f"Invalid GL account(s) for company_code_id={payload.company_code_id}: {', '.join(str(i) for i in missing_ids)}")

    last_error: IntegrityError | None = None
    for _attempt in range(5):
        try:
            with db.begin_nested():
                header = GLJournalHeader(
                    company_code_id=payload.company_code_id,
                    ledger_id=payload.ledger_id,
                    document_number=next_doc_number(db, payload.ledger_id, fiscal_year),
                    document_type=payload.document_type,
                    posting_date=payload.posting_date,
                    document_date=payload.document_date,
                    fiscal_year=fiscal_year,
                    period_number=period_number,
                    currency=payload.currency,
                    reference=payload.reference,
                    header_text=payload.header_text,
                    source_module=payload.source_module,
                    created_by=payload.created_by,
                    idempotency_key=payload.idempotency_key,
                    status="DRAFT",
                )
                db.add(header)
                db.flush()
                for idx, line in enumerate(payload.lines, start=1):
                    db.add(
                        GLJournalLine(
                            header_id=header.id,
                            line_number=idx,
                            gl_account_id=line.gl_account_id,
                            description=line.description,
                            debit_amount=_to_decimal(line.debit_amount),
                            credit_amount=_to_decimal(line.credit_amount),
                            amount_in_doc_currency=_to_decimal(line.debit_amount or line.credit_amount),
                            currency=payload.currency,
                        )
                    )
                db.flush()
            return header
        except IntegrityError as exc:
            last_error = exc
            existing = _existing_by_idempotency()
            if existing:
                return existing
            message = str(exc.orig) if getattr(exc, "orig", None) else str(exc)
            if "uq_gl_doc_number_year" in message:
                continue
            raise

    if last_error is not None:
        raise last_error
    raise ValueError("Failed to create journal header after retries.")


def post_journal(db: Session, header: GLJournalHeader, posted_by: str | None = None) -> GLJournalHeader:
    if header.status != "DRAFT":
        raise ValueError("Only draft journals can be posted")
    validate_balanced(header.lines)
    ensure_period_open(db, header.company_code_id, header.fiscal_year, header.period_number)
    apply_balances(db, header)
    header.status = "POSTED"
    header.posted_by = posted_by
    header.posted_at = datetime.utcnow()
    db.flush()
    return header


def reverse_journal(db: Session, header: GLJournalHeader, reversed_by: str | None = None) -> GLJournalHeader:
    if header.status != "POSTED":
        raise ValueError("Only posted journals can be reversed")
    apply_balances(db, header, reverse=True)
    header.status = "REVERSED"
    header.reversed_by = reversed_by
    header.reversed_at = datetime.utcnow()
    return header


def run_subledger_posting(db: Session, ledger_id: int, source_module: str, period: str) -> GLPostingBatch:
    ledger = db.get(GLLedger, ledger_id)
    if not ledger:
        raise ValueError("Ledger not found")

    year, month = [int(v) for v in period.split("-")]
    ensure_period_open(db, ledger.company_code_id, year, month)
    batch = (
        db.query(GLPostingBatch)
        .filter(GLPostingBatch.ledger_id == ledger_id, GLPostingBatch.source_module == source_module, GLPostingBatch.source_batch_key == period)
        .first()
    )
    if not batch:
        batch = GLPostingBatch(ledger_id=ledger_id, source_module=source_module, source_batch_key=period, status="READY")
        db.add(batch)
        db.flush()

    def post_one(source_id: int, amount: Decimal, debit_id: int, credit_id: int):
        exists = (
            db.query(GLPostingLink)
            .filter(GLPostingLink.source_module == source_module, GLPostingLink.source_id == source_id)
            .first()
        )
        if exists:
            return
        header = create_journal(
            db,
            type("Payload", (), {
                "company_code_id": ledger.company_code_id,
                "ledger_id": ledger.id,
                "document_type": source_module[:2],
                "posting_date": date(year, month, 1),
                "document_date": date(year, month, 1),
                "currency": ledger.currency,
                "reference": f"{source_module}-{source_id}",
                "header_text": f"Auto-posted from {source_module}",
                "source_module": source_module,
                "created_by": "system",
                "idempotency_key": f"{source_module}:{source_id}",
                "lines": [
                    type("Line", (), {"gl_account_id": debit_id, "description": None, "debit_amount": amount, "credit_amount": ZERO}),
                    type("Line", (), {"gl_account_id": credit_id, "description": None, "debit_amount": ZERO, "credit_amount": amount}),
                ],
            })(),
        )
        post_journal(db, header, posted_by="system")
        db.add(GLPostingLink(source_module=source_module, source_id=source_id, gl_journal_header_id=header.id))

    ar = _find_account(db, ledger.company_code_id, "1100")
    revenue = _find_account(db, ledger.company_code_id, "4000")
    cash = _find_account(db, ledger.company_code_id, "1000")
    expense = _find_account(db, ledger.company_code_id, "5000")
    inventory = _find_account(db, ledger.company_code_id, "1200")

    try:
        if source_module == "AR":
            rows = db.query(Invoice.id, Invoice.total).filter(func.extract("year", Invoice.issue_date) == year, func.extract("month", Invoice.issue_date) == month)
            for source_id, amount in rows:
                post_one(source_id, _to_decimal(amount), ar.id, revenue.id)
        elif source_module == "PAYMENTS":
            rows = db.query(Payment.id, Payment.amount).filter(func.extract("year", Payment.payment_date) == year, func.extract("month", Payment.payment_date) == month)
            for source_id, amount in rows:
                post_one(source_id, _to_decimal(amount), cash.id, ar.id)
        elif source_module in {"PURCHASING", "INVENTORY"}:
            rows = db.query(PurchaseOrder.id, PurchaseOrder.total_amount).filter(func.extract("year", PurchaseOrder.order_date) == year, func.extract("month", PurchaseOrder.order_date) == month)
            for source_id, amount in rows:
                post_one(source_id, _to_decimal(amount), inventory.id, cash.id)
        else:
            # Expenses source fallback for future extension.
            post_one(-batch.id, Decimal("0.01"), expense.id, cash.id)

        batch.status = "POSTED"
        batch.posted_at = datetime.utcnow()
    except Exception as exc:
        batch.status = "FAILED"
        batch.error_message = str(exc)
        raise

    return batch


def _find_account(db: Session, company_code_id: int, account_number: str) -> GLAccount:
    account = db.query(GLAccount).filter(GLAccount.company_code_id == company_code_id, GLAccount.account_number == account_number).first()
    if not account:
        raise ValueError(f"Missing GL account mapping {account_number}")
    return account


def trial_balance(db: Session, ledger_id: int, year: int, period_from: int, period_to: int):
    rows = (
        db.query(
            GLAccount.id,
            GLAccount.account_number,
            GLAccount.name,
            GLAccount.account_type,
            func.sum(GLBalance.period_debits).label("debit"),
            func.sum(GLBalance.period_credits).label("credit"),
        )
        .join(GLBalance, GLBalance.gl_account_id == GLAccount.id)
        .filter(GLBalance.ledger_id == ledger_id, GLBalance.fiscal_year == year, GLBalance.period_number >= period_from, GLBalance.period_number <= period_to)
        .group_by(GLAccount.id, GLAccount.account_number, GLAccount.name, GLAccount.account_type)
        .all()
    )
    result = []
    for row in rows:
        debit = _to_decimal(row.debit)
        credit = _to_decimal(row.credit)
        result.append({
            "gl_account_id": row.id,
            "account_number": row.account_number,
            "account_name": row.name,
            "account_type": row.account_type,
            "debit": debit,
            "credit": credit,
            "balance": debit - credit,
        })
    return result


def financial_summary(db: Session, ledger_id: int, year: int, period_to: int):
    rows = (
        db.query(GLAccount.account_type, func.sum(GLBalance.closing_balance))
        .join(GLBalance, GLBalance.gl_account_id == GLAccount.id)
        .filter(GLBalance.ledger_id == ledger_id, GLBalance.fiscal_year == year, GLBalance.period_number <= period_to)
        .group_by(GLAccount.account_type)
        .all()
    )
    return [{"account_type": account_type, "amount": _to_decimal(amount)} for account_type, amount in rows]
