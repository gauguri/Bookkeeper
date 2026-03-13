from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.gl import schemas as gl_schemas
from app.gl import service as gl_service
from app.models import (
    Account,
    CompanyCode,
    FiscalYearVariant,
    GLAccount,
    GLJournalHeader,
    GLLedger,
    GLEntry,
    GLPostingLink,
    Invoice,
    JournalBatch,
    JournalEntry,
    Payment,
)

ZERO = Decimal("0.00")
COA_TO_GL_TYPE = {
    "ASSET": "ASSET",
    "LIABILITY": "LIABILITY",
    "EQUITY": "EQUITY",
    "INCOME": "REVENUE",
    "REVENUE": "REVENUE",
    "EXPENSE": "EXPENSE",
    "COGS": "EXPENSE",
    "OTHER": "EXPENSE",
}
LEGACY_EVENT_SOURCE_MODULE = {
    "INVOICE_POSTED": "INVOICES",
    "PAYMENT": "PAYMENTS",
    "PAYMENT_POSTED": "PAYMENTS",
    "SHIPMENT": "SALES",
    "SHIPMENT_POSTED": "SALES",
    "SHIPMENT_FOR_PREPAID_ORDER": "SALES",
    "SHIPMENT_COGS": "SALES",
    "CASH_SALE": "SALES",
    "PREPAYMENT_RECEIVED": "PAYMENTS",
    "CREDIT_MEMO": "SALES",
    "WRITE_OFF": "AR",
}
LEGACY_EVENT_DOCUMENT_TYPE = {
    "INVOICE_POSTED": "RV",
    "PAYMENT": "DZ",
    "PAYMENT_POSTED": "DZ",
    "SHIPMENT": "SA",
    "SHIPMENT_POSTED": "SA",
    "SHIPMENT_FOR_PREPAID_ORDER": "SA",
    "SHIPMENT_COGS": "SA",
    "CASH_SALE": "RV",
    "PREPAYMENT_RECEIVED": "DZ",
    "CREDIT_MEMO": "DG",
    "WRITE_OFF": "WO",
}


def _to_decimal(value: Decimal | int | float | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _normal_balance_for_type(account_type: str) -> str:
    return "DEBIT" if account_type in {"ASSET", "EXPENSE"} else "CREDIT"


def bootstrap_gl_context(db: Session, company_id: int | None) -> tuple[CompanyCode, GLLedger]:
    company_code = None
    if company_id is not None:
        company_code = db.query(CompanyCode).filter(CompanyCode.id == company_id).first()
    if not company_code:
        company_code = db.query(CompanyCode).order_by(CompanyCode.id.asc()).first()
    if not company_code:
        code = str(company_id or 1000).zfill(4)
        company_code = CompanyCode(code=code, name="Main Company", base_currency="USD")
        db.add(company_code)
        db.flush()

    fyv = db.query(FiscalYearVariant).filter(FiscalYearVariant.name == "K4").first()
    if not fyv:
        fyv = FiscalYearVariant(name="K4", periods_per_year=12, special_periods=4)
        db.add(fyv)
        db.flush()

    ledger = (
        db.query(GLLedger)
        .filter(GLLedger.company_code_id == company_code.id, GLLedger.is_leading.is_(True))
        .order_by(GLLedger.id.asc())
        .first()
    )
    if not ledger:
        ledger = GLLedger(
            company_code_id=company_code.id,
            name="Leading Ledger",
            currency=company_code.base_currency or "USD",
            fiscal_year_variant_id=fyv.id,
            is_leading=True,
        )
        db.add(ledger)
        db.flush()

    return company_code, ledger


def sync_gl_accounts_from_coa(db: Session, company_code_id: int, company_id: int | None) -> None:
    coa_accounts = []
    if company_id is not None:
        coa_accounts = db.query(Account).filter(Account.company_id == company_id).all()
    if not coa_accounts:
        coa_accounts = db.query(Account).filter(Account.company_id == company_code_id).all()
    if not coa_accounts:
        fallback_company = db.query(Account.company_id).order_by(Account.company_id.asc()).first()
        if fallback_company is not None:
            coa_accounts = db.query(Account).filter(Account.company_id == fallback_company[0]).all()

    existing = {
        row.account_number: row
        for row in db.query(GLAccount).filter(GLAccount.company_code_id == company_code_id).all()
    }

    for coa in coa_accounts:
        account_code = (coa.code or "").strip()
        if not account_code:
            continue
        mapped_type = COA_TO_GL_TYPE.get((coa.type or "").upper(), "EXPENSE")
        gl_account = existing.get(account_code)
        if not gl_account:
            gl_account = GLAccount(
                company_code_id=company_code_id,
                account_number=account_code,
                name=coa.name,
                account_type=mapped_type,
                normal_balance=_normal_balance_for_type(mapped_type),
                is_control_account=False,
                is_active=bool(coa.is_active),
            )
            db.add(gl_account)
            existing[account_code] = gl_account
            continue

        gl_account.name = coa.name
        gl_account.account_type = mapped_type
        gl_account.normal_balance = _normal_balance_for_type(mapped_type)
        gl_account.is_active = bool(coa.is_active)

    db.flush()


def resolve_gl_account_id_for_coa(
    db: Session,
    *,
    coa_account_id: int,
    company_code_id: int,
    company_id: int | None,
) -> int:
    coa_account = db.query(Account).filter(Account.id == coa_account_id).first()
    if not coa_account:
        raise ValueError(f"Account {coa_account_id} not found.")

    sync_gl_accounts_from_coa(db, company_code_id=company_code_id, company_id=company_id)

    gl_account = None
    if coa_account.code:
        gl_account = (
            db.query(GLAccount)
            .filter(
                GLAccount.company_code_id == company_code_id,
                GLAccount.account_number == coa_account.code,
            )
            .first()
        )
    if not gl_account:
        gl_account = (
            db.query(GLAccount)
            .filter(
                GLAccount.company_code_id == company_code_id,
                GLAccount.name == coa_account.name,
            )
            .order_by(GLAccount.id.asc())
            .first()
        )
    if not gl_account:
        mapped_type = COA_TO_GL_TYPE.get((coa_account.type or "").upper(), "EXPENSE")
        gl_account = GLAccount(
            company_code_id=company_code_id,
            account_number=(coa_account.code or str(coa_account.id)).strip(),
            name=coa_account.name,
            account_type=mapped_type,
            normal_balance=_normal_balance_for_type(mapped_type),
            is_control_account=False,
            is_active=bool(coa_account.is_active),
        )
        db.add(gl_account)
        db.flush()

    return gl_account.id


def mirror_journal_entry_to_gl(
    db: Session,
    entry: JournalEntry,
    *,
    source_module: str,
    document_type: str = "SA",
    link_source_module: str = "JOURNAL_ENTRY",
) -> GLJournalHeader:
    existing_link = (
        db.query(GLPostingLink)
        .filter(GLPostingLink.source_module == link_source_module, GLPostingLink.source_id == entry.id)
        .first()
    )
    if existing_link:
        header = db.get(GLJournalHeader, existing_link.gl_journal_header_id)
        if header:
            return header

    company_code, ledger = bootstrap_gl_context(db, entry.company_id)
    sync_gl_accounts_from_coa(db, company_code_id=company_code.id, company_id=entry.company_id)

    payload = gl_schemas.JournalCreate(
        company_code_id=company_code.id,
        ledger_id=ledger.id,
        document_type=document_type,
        posting_date=entry.txn_date,
        document_date=entry.txn_date,
        currency=ledger.currency or company_code.base_currency or "USD",
        reference=f"JE-{entry.id}",
        header_text=entry.description,
        source_module=source_module,
        created_by="system",
        idempotency_key=f"journal_entry:{entry.id}",
        lines=[
            gl_schemas.JournalLineIn(
                gl_account_id=resolve_gl_account_id_for_coa(
                    db,
                    coa_account_id=line.account_id,
                    company_code_id=company_code.id,
                    company_id=entry.company_id,
                ),
                description=line.description or entry.description,
                debit_amount=_to_decimal(line.debit),
                credit_amount=_to_decimal(line.credit),
            )
            for line in entry.lines
        ],
    )
    header = gl_service.create_journal(db, payload)
    gl_service.post_journal(db, header, posted_by="system")
    db.add(
        GLPostingLink(
            source_module=link_source_module,
            source_id=entry.id,
            gl_journal_header_id=header.id,
        )
    )
    db.flush()
    return header


def _legacy_batch_reference(db: Session, batch: JournalBatch, entries: list[GLEntry]) -> tuple[str | None, str | None]:
    invoice = db.query(Invoice).filter(Invoice.id == entries[0].invoice_id).first() if entries and entries[0].invoice_id else None
    payment = db.query(Payment).filter(Payment.id == entries[0].payment_id).first() if entries and entries[0].payment_id else None

    if invoice and batch.event_type == "INVOICE_POSTED":
        return invoice.invoice_number, f"Invoice {invoice.invoice_number}"
    if invoice and batch.event_type in {"SHIPMENT_POSTED", "SHIPMENT", "SHIPMENT_FOR_PREPAID_ORDER", "SHIPMENT_COGS"}:
        return invoice.invoice_number, f"Shipment accounting for {invoice.invoice_number}"
    if payment:
        return payment.reference or f"PAY-{payment.id}", payment.memo or payment.notes or f"Payment {payment.id}"
    return f"{batch.reference_type}-{batch.reference_id}", f"Legacy GL {batch.event_type} {batch.reference_id}"


def mirror_legacy_batch_to_gl(db: Session, batch_id: int) -> GLJournalHeader | None:
    existing_link = (
        db.query(GLPostingLink)
        .filter(GLPostingLink.source_module == "LEGACY_BATCH", GLPostingLink.source_id == batch_id)
        .first()
    )
    if existing_link:
        header = db.get(GLJournalHeader, existing_link.gl_journal_header_id)
        if header:
            return header

    batch = db.get(JournalBatch, batch_id)
    if not batch:
        raise ValueError(f"Legacy journal batch {batch_id} not found.")

    entries = (
        db.query(GLEntry)
        .filter(GLEntry.journal_batch_id == batch_id)
        .order_by(GLEntry.id.asc())
        .all()
    )
    if not entries:
        return None

    first_account = db.query(Account).filter(Account.id == entries[0].account_id).first()
    company_id = first_account.company_id if first_account else 1
    company_code, ledger = bootstrap_gl_context(db, company_id)
    sync_gl_accounts_from_coa(db, company_code_id=company_code.id, company_id=company_id)
    reference, header_text = _legacy_batch_reference(db, batch, entries)
    posting_date = entries[0].posting_date or (batch.posted_at.date() if batch.posted_at else date.today())
    source_module = LEGACY_EVENT_SOURCE_MODULE.get(batch.event_type, "ACCOUNTING")
    document_type = LEGACY_EVENT_DOCUMENT_TYPE.get(batch.event_type, "SA")

    payload = gl_schemas.JournalCreate(
        company_code_id=company_code.id,
        ledger_id=ledger.id,
        document_type=document_type,
        posting_date=posting_date,
        document_date=posting_date,
        currency=ledger.currency or company_code.base_currency or "USD",
        reference=reference,
        header_text=header_text,
        source_module=source_module,
        created_by="system",
        idempotency_key=f"legacy_batch:{batch.id}",
        lines=[
            gl_schemas.JournalLineIn(
                gl_account_id=resolve_gl_account_id_for_coa(
                    db,
                    coa_account_id=entry.account_id,
                    company_code_id=company_code.id,
                    company_id=company_id,
                ),
                description=header_text,
                debit_amount=_to_decimal(entry.debit_amount),
                credit_amount=_to_decimal(entry.credit_amount),
            )
            for entry in entries
        ],
    )
    header = gl_service.create_journal(db, payload)
    gl_service.post_journal(db, header, posted_by="system")
    db.add(GLPostingLink(source_module="LEGACY_BATCH", source_id=batch.id, gl_journal_header_id=header.id))
    db.flush()
    return header


def backfill_manual_journal_entries_to_gl(db: Session) -> int:
    linked_ids = {
        row[0]
        for row in db.query(GLPostingLink.source_id)
        .filter(GLPostingLink.source_module == "JOURNAL_ENTRY")
        .all()
    }
    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.source_type == "MANUAL")
        .order_by(JournalEntry.id.asc())
        .all()
    )
    count = 0
    for entry in entries:
        if entry.id in linked_ids:
            continue
        mirror_journal_entry_to_gl(db, entry, source_module="EXPENSES")
        count += 1
    return count


def backfill_legacy_batches_to_gl(db: Session) -> int:
    linked_ids = {
        row[0]
        for row in db.query(GLPostingLink.source_id)
        .filter(GLPostingLink.source_module == "LEGACY_BATCH")
        .all()
    }
    batch_ids = [
        row[0]
        for row in db.query(JournalBatch.id)
        .order_by(JournalBatch.id.asc())
        .all()
        if row[0] not in linked_ids
    ]
    count = 0
    for batch_id in batch_ids:
        header = mirror_legacy_batch_to_gl(db, batch_id)
        if header:
            count += 1
    return count
