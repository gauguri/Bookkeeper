from decimal import Decimal
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.module_keys import ModuleKey
from app.accounting import schemas
from app.accounting.service import create_journal_entry
from app.db import get_db
from app.models import Account, Company, GLAccount, GLJournalHeader, JournalEntry, JournalLine

router = APIRouter(prefix="/api/journal-entries", tags=["journal-entries"], dependencies=[Depends(require_module(ModuleKey.EXPENSES.value))])
EXPENSE_SOURCE_MODULES = {"EXPENSES", "PURCHASING"}


def _get_default_company_id(db: Session) -> int:
    company = db.query(Company).order_by(Company.id.asc()).first()
    if company:
        return company.id

    company = Company(name="Demo Company", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()
    return company.id


def _to_response(entry: JournalEntry) -> schemas.JournalEntryResponse:
    lines: list[schemas.JournalLineResponse] = []
    for line in entry.lines:
        if Decimal(line.debit or 0) > 0:
            lines.append(schemas.JournalLineResponse(id=line.id, account_id=line.account_id, direction="DEBIT", amount=line.debit))
        elif Decimal(line.credit or 0) > 0:
            lines.append(schemas.JournalLineResponse(id=line.id, account_id=line.account_id, direction="CREDIT", amount=line.credit))
    return schemas.JournalEntryResponse(
        id=entry.id,
        date=entry.txn_date,
        memo=entry.description,
        source_type=entry.source_type,
        source_id=entry.source_id,
        created_at=entry.posted_at,
        lines=lines,
    )


def _coa_lookup_by_code(db: Session) -> dict[str, Account]:
    rows = db.query(Account).filter(Account.code.isnot(None)).all()
    return {(row.code or "").strip(): row for row in rows if (row.code or "").strip()}


def _gl_lookup(db: Session) -> dict[int, GLAccount]:
    rows = db.query(GLAccount).all()
    return {row.id: row for row in rows}


@router.post("", response_model=schemas.JournalEntryResponse, status_code=status.HTTP_201_CREATED)
def create_journal_entry_endpoint(payload: schemas.JournalEntryCreate, db: Session = Depends(get_db)):
    debit_line = next((line for line in payload.lines if line.direction == "DEBIT"), None)
    credit_line = next((line for line in payload.lines if line.direction == "CREDIT"), None)
    try:
        entry = create_journal_entry(
            db,
            company_id=_get_default_company_id(db),
            entry_date=payload.date,
            memo=payload.memo,
            source_type=payload.source_type,
            source_id=payload.source_id,
            debit_account_id=debit_line.account_id,
            credit_account_id=credit_line.account_id,
            amount=debit_line.amount,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    return _to_response(entry)


@router.get("", response_model=list[schemas.JournalEntryListRow])
def list_journal_entries(
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    account_ids: Optional[str] = Query(None),
    end_date: Optional[date] = Query(None),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = (
        db.query(GLJournalHeader)
        .options(selectinload(GLJournalHeader.lines))
        .filter(GLJournalHeader.status == "POSTED")
        .filter(GLJournalHeader.source_module.in_(EXPENSE_SOURCE_MODULES))
        .order_by(GLJournalHeader.posting_date.desc(), GLJournalHeader.id.desc())
    )
    if search:
        like = f"%{search}%"
        query = query.filter((GLJournalHeader.header_text.ilike(like)) | (GLJournalHeader.reference.ilike(like)))
    if end_date:
        query = query.filter(GLJournalHeader.posting_date <= end_date)

    parsed_account_ids: set[int] = set()
    if account_ids:
        parsed_account_ids = {int(value.strip()) for value in account_ids.split(",") if value.strip().isdigit()}

    gl_lookup = _gl_lookup(db)
    coa_lookup = _coa_lookup_by_code(db)
    rows: list[schemas.JournalEntryListRow] = []

    for header in query.limit(limit * 4).all():
        debit_line = next((line for line in header.lines if Decimal(line.debit_amount or 0) > 0), None)
        credit_line = next((line for line in header.lines if Decimal(line.credit_amount or 0) > 0), None)
        if not debit_line or not credit_line:
            continue

        debit_gl = gl_lookup.get(debit_line.gl_account_id)
        credit_gl = gl_lookup.get(credit_line.gl_account_id)
        if not debit_gl or not credit_gl:
            continue

        debit_coa = coa_lookup.get((debit_gl.account_number or "").strip())
        credit_coa = coa_lookup.get((credit_gl.account_number or "").strip())
        debit_account_id = debit_coa.id if debit_coa else 0
        credit_account_id = credit_coa.id if credit_coa else 0
        line_account_ids = {debit_account_id, credit_account_id}
        if account_id and account_id not in line_account_ids:
            continue
        if parsed_account_ids and not (line_account_ids & parsed_account_ids):
            continue

        debit_type = (debit_coa.type if debit_coa else debit_gl.account_type) if debit_gl else None
        credit_type = (credit_coa.type if credit_coa else credit_gl.account_type) if credit_gl else None
        if type and type not in {debit_type, credit_type}:
            continue

        rows.append(
            schemas.JournalEntryListRow(
                id=header.id,
                date=header.posting_date,
                memo=header.header_text,
                amount=Decimal(debit_line.debit_amount or 0),
                source_type="PURCHASE_ORDER" if header.source_module == "PURCHASING" else "MANUAL",
                debit_account_id=debit_account_id,
                credit_account_id=credit_account_id,
                debit_account=debit_coa.name if debit_coa else debit_gl.name,
                credit_account=credit_coa.name if credit_coa else credit_gl.name,
                debit_account_code=debit_gl.account_number,
                credit_account_code=credit_gl.account_number,
                debit_account_type=debit_type,
                credit_account_type=credit_type,
            )
        )
        if len(rows) >= limit:
            break

    return rows
