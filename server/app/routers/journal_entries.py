from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.accounting import schemas
from app.accounting.service import create_journal_entry
from app.db import get_db
from app.models import Account, Company, JournalEntry, JournalLine

router = APIRouter(prefix="/api/journal-entries", tags=["journal-entries"], dependencies=[Depends(require_module("EXPENSES"))])


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
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(JournalEntry).options(selectinload(JournalEntry.lines)).order_by(JournalEntry.txn_date.desc(), JournalEntry.id.desc())
    if search:
        like = f"%{search}%"
        query = query.filter(JournalEntry.description.ilike(like))

    entries = query.limit(limit * 3).all()
    account_records = db.query(Account).all()
    account_lookup = {account.id: account.name for account in account_records}
    account_code_lookup = {account.id: account.code for account in account_records}
    account_type_lookup = {account.id: account.type for account in account_records}
    rows: list[schemas.JournalEntryListRow] = []

    for entry in entries:
        debit_line = next((line for line in entry.lines if Decimal(line.debit or 0) > 0), None)
        credit_line = next((line for line in entry.lines if Decimal(line.credit or 0) > 0), None)
        if not debit_line or not credit_line:
            continue
        if account_id and account_id not in {debit_line.account_id, credit_line.account_id}:
            continue
        if type and type not in {account_type_lookup.get(debit_line.account_id), account_type_lookup.get(credit_line.account_id)}:
            continue

        rows.append(
            schemas.JournalEntryListRow(
                id=entry.id,
                date=entry.txn_date,
                memo=entry.description,
                amount=Decimal(debit_line.debit or 0),
                source_type=entry.source_type,
                debit_account_id=debit_line.account_id,
                credit_account_id=credit_line.account_id,
                debit_account=account_lookup.get(debit_line.account_id, f"Account #{debit_line.account_id}"),
                credit_account=account_lookup.get(credit_line.account_id, f"Account #{credit_line.account_id}"),
                debit_account_code=account_code_lookup.get(debit_line.account_id),
                credit_account_code=account_code_lookup.get(credit_line.account_id),
                debit_account_type=account_type_lookup.get(debit_line.account_id),
                credit_account_type=account_type_lookup.get(credit_line.account_id),
            )
        )
        if len(rows) >= limit:
            break

    return rows
