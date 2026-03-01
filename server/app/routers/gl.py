from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.db import get_db
from app.gl import schemas, service
from app.models import (
    CompanyCode,
    FiscalYearVariant,
    GLAccount,
    GLJournalHeader,
    GLPostingBatch,
    GLJournalLine,
    GLLedger,
    PostingPeriodStatus,
)
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api/gl", tags=["gl"], dependencies=[Depends(require_module(ModuleKey.GENERAL_LEDGER.value))])


@router.get("/accounts", response_model=list[schemas.GLAccountResponse])
def list_accounts(search: str | None = None, type: str | None = None, active: bool | None = None, db: Session = Depends(get_db)):
    query = db.query(GLAccount).order_by(GLAccount.account_number.asc())
    if search:
        like = f"%{search}%"
        query = query.filter(or_(GLAccount.account_number.ilike(like), GLAccount.name.ilike(like)))
    if type:
        query = query.filter(GLAccount.account_type == type)
    if active is not None:
        query = query.filter(GLAccount.is_active == active)
    return query.all()


@router.post("/accounts", response_model=schemas.GLAccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(payload: schemas.GLAccountCreate, db: Session = Depends(get_db)):
    account = GLAccount(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/accounts/{account_id}", response_model=schemas.GLAccountResponse)
def update_account(account_id: int, payload: schemas.GLAccountUpdate, db: Session = Depends(get_db)):
    account = db.get(GLAccount, account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    return account


@router.get("/accounts/hierarchy", response_model=list[schemas.GLAccountResponse])
def accounts_hierarchy(db: Session = Depends(get_db)):
    return db.query(GLAccount).order_by(GLAccount.parent_account_id.nullsfirst(), GLAccount.account_number.asc()).all()


@router.get("/ledgers", response_model=list[schemas.LedgerResponse])
def list_ledgers(db: Session = Depends(get_db)):
    return db.query(GLLedger).order_by(GLLedger.id.asc()).all()


@router.post("/ledgers", response_model=schemas.LedgerResponse, status_code=status.HTTP_201_CREATED)
def create_ledger(payload: schemas.LedgerCreate, db: Session = Depends(get_db)):
    ledger = GLLedger(**payload.model_dump())
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.get("/periods")
def list_periods(ledger_id: int, year: int, db: Session = Depends(get_db)):
    ledger = db.get(GLLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "Ledger not found")
    rows = db.query(PostingPeriodStatus).filter(PostingPeriodStatus.company_code_id == ledger.company_code_id, PostingPeriodStatus.fiscal_year == year).all()
    return rows


@router.post("/periods/{year}/{period}/open")
def open_period(year: int, period: int, ledger_id: int = Query(...), opened_by: str = "system", db: Session = Depends(get_db)):
    ledger = db.get(GLLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "Ledger not found")
    row = db.query(PostingPeriodStatus).filter_by(company_code_id=ledger.company_code_id, fiscal_year=year, period_number=period).first()
    if not row:
        row = PostingPeriodStatus(company_code_id=ledger.company_code_id, fiscal_year=year, period_number=period)
        db.add(row)
    row.is_open = True
    row.opened_by = opened_by
    row.opened_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/periods/{year}/{period}/close")
def close_period(year: int, period: int, ledger_id: int = Query(...), closed_by: str = "system", db: Session = Depends(get_db)):
    ledger = db.get(GLLedger, ledger_id)
    if not ledger:
        raise HTTPException(404, "Ledger not found")
    row = db.query(PostingPeriodStatus).filter_by(company_code_id=ledger.company_code_id, fiscal_year=year, period_number=period).first()
    if not row:
        row = PostingPeriodStatus(company_code_id=ledger.company_code_id, fiscal_year=year, period_number=period)
        db.add(row)
    row.is_open = False
    row.closed_by = closed_by
    row.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/journals")
def list_journals(
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    source: str | None = None,
    period: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).order_by(GLJournalHeader.posting_date.desc(), GLJournalHeader.id.desc())
    if status:
        query = query.filter(GLJournalHeader.status == status)
    if source:
        query = query.filter(GLJournalHeader.source_module == source)
    if period:
        query = query.filter(GLJournalHeader.period_number == period)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(GLJournalHeader.document_number.ilike(like), GLJournalHeader.reference.ilike(like), GLJournalHeader.header_text.ilike(like)))
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "items": [
            {
                "id": h.id,
                "document_number": h.document_number,
                "posting_date": h.posting_date,
                "document_type": h.document_type,
                "source_module": h.source_module,
                "reference": h.reference,
                "debits": sum((line.debit_amount for line in h.lines), 0),
                "credits": sum((line.credit_amount for line in h.lines), 0),
                "status": h.status,
                "updated_at": h.posted_at or h.created_at,
            }
            for h in rows
        ],
    }


@router.get("/journals/{journal_id}")
def get_journal(journal_id: int, db: Session = Depends(get_db)):
    header = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).filter(GLJournalHeader.id == journal_id).first()
    if not header:
        raise HTTPException(404, "Journal not found")
    return header


@router.post("/journals")
def create_journal(payload: schemas.JournalCreate, db: Session = Depends(get_db)):
    try:
        header = service.create_journal(db, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.commit()
    db.refresh(header)
    return header


@router.put("/journals/{journal_id}")
def update_journal(journal_id: int, payload: schemas.JournalUpdate, db: Session = Depends(get_db)):
    header = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).filter(GLJournalHeader.id == journal_id).first()
    if not header:
        raise HTTPException(404, "Journal not found")
    if header.status != "DRAFT":
        raise HTTPException(400, "Only draft journals can be edited")
    if payload.reference is not None:
        header.reference = payload.reference
    if payload.header_text is not None:
        header.header_text = payload.header_text
    if payload.lines is not None:
        header.lines.clear()
        for idx, line in enumerate(payload.lines, start=1):
            header.lines.append(
                GLJournalLine(
                    line_number=idx,
                    gl_account_id=line.gl_account_id,
                    description=line.description,
                    debit_amount=line.debit_amount,
                    credit_amount=line.credit_amount,
                    amount_in_doc_currency=line.debit_amount or line.credit_amount,
                    currency=header.currency,
                )
            )
    db.commit()
    return header


@router.post("/journals/{journal_id}/post")
def post_journal(journal_id: int, posted_by: str = "system", db: Session = Depends(get_db)):
    header = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).filter(GLJournalHeader.id == journal_id).first()
    if not header:
        raise HTTPException(404, "Journal not found")
    try:
        service.post_journal(db, header, posted_by=posted_by)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.commit()
    return {"ok": True}


@router.post("/journals/{journal_id}/reverse")
def reverse_journal(journal_id: int, reversed_by: str = "system", db: Session = Depends(get_db)):
    header = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).filter(GLJournalHeader.id == journal_id).first()
    if not header:
        raise HTTPException(404, "Journal not found")
    try:
        service.reverse_journal(db, header, reversed_by=reversed_by)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.commit()
    return {"ok": True}


@router.post("/posting/run")
def run_posting(source_module: str, period: str, ledger_id: int = Query(...), db: Session = Depends(get_db)):
    try:
        batch = service.run_subledger_posting(db, ledger_id=ledger_id, source_module=source_module, period=period)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.commit()
    return batch


@router.get("/posting/batches", response_model=list[schemas.PostingBatchResponse])
def list_batches(db: Session = Depends(get_db)):
    return db.query(GLPostingBatch).order_by(GLPostingBatch.created_at.desc()).all()


@router.get("/posting/batches/{batch_id}", response_model=schemas.PostingBatchResponse)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(GLPostingBatch, batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    return batch


@router.get("/reports/trial-balance", response_model=list[schemas.TrialBalanceRow])
def report_trial_balance(ledger_id: int, year: int, period_from: int, period_to: int, db: Session = Depends(get_db)):
    return service.trial_balance(db, ledger_id, year, period_from, period_to)


@router.get("/reports/account-analysis")
def account_analysis(account_id: int, date_from: str | None = None, date_to: str | None = None, include_lines: bool = True, db: Session = Depends(get_db)):
    query = db.query(GLJournalHeader).join(GLJournalHeader.lines).filter(GLJournalHeader.lines.any(gl_account_id=account_id))
    if date_from:
        query = query.filter(GLJournalHeader.posting_date >= date_from)
    if date_to:
        query = query.filter(GLJournalHeader.posting_date <= date_to)
    rows = query.order_by(GLJournalHeader.posting_date.desc()).limit(200).all()
    return rows


@router.get("/reports/financials/pnl", response_model=list[schemas.FinancialStatementRow])
def report_pnl(ledger_id: int, year: int, period_to: int, db: Session = Depends(get_db)):
    rows = service.financial_summary(db, ledger_id=ledger_id, year=year, period_to=period_to)
    return [row for row in rows if row["account_type"] in {"REVENUE", "EXPENSE"}]


@router.get("/reports/financials/balance-sheet", response_model=list[schemas.FinancialStatementRow])
def report_bs(ledger_id: int, year: int, period_to: int, db: Session = Depends(get_db)):
    rows = service.financial_summary(db, ledger_id=ledger_id, year=year, period_to=period_to)
    return [row for row in rows if row["account_type"] in {"ASSET", "LIABILITY", "EQUITY"}]


@router.get("/reports/close-checklist")
def close_checklist(ledger_id: int, year: int, period: int, db: Session = Depends(get_db)):
    draft_count = db.query(func.count(GLJournalHeader.id)).filter(GLJournalHeader.ledger_id == ledger_id, GLJournalHeader.fiscal_year == year, GLJournalHeader.period_number == period, GLJournalHeader.status == "DRAFT").scalar()
    failed_batches = db.query(func.count(GLPostingBatch.id)).filter(GLPostingBatch.ledger_id == ledger_id, GLPostingBatch.status == "FAILED").scalar()
    return {
        "unposted_journals": int(draft_count or 0),
        "failed_posting_batches": int(failed_batches or 0),
        "trial_balance_balanced": True,
        "subledger_posting_complete": (failed_batches or 0) == 0,
    }


@router.post("/bootstrap")
def bootstrap_defaults(db: Session = Depends(get_db)):
    company_code = db.query(CompanyCode).filter(CompanyCode.code == "1000").first()
    if not company_code:
        company_code = CompanyCode(code="1000", name="Main Company", base_currency="USD")
        db.add(company_code)
        db.flush()

    fyv = db.query(FiscalYearVariant).filter(FiscalYearVariant.name == "K4").first()
    if not fyv:
        fyv = FiscalYearVariant(name="K4", periods_per_year=12, special_periods=4)
        db.add(fyv)
        db.flush()

    ledger = db.query(GLLedger).filter(GLLedger.company_code_id == company_code.id, GLLedger.name == "Leading Ledger").first()
    if not ledger:
        ledger = GLLedger(company_code_id=company_code.id, name="Leading Ledger", currency="USD", fiscal_year_variant_id=fyv.id, is_leading=True)
        db.add(ledger)
        db.flush()

    defaults = [
        ("1000", "Cash", "ASSET", "DEBIT", False),
        ("1100", "Accounts Receivable", "ASSET", "DEBIT", True),
        ("1200", "Inventory", "ASSET", "DEBIT", False),
        ("2000", "Accounts Payable", "LIABILITY", "CREDIT", True),
        ("4000", "Revenue", "REVENUE", "CREDIT", False),
        ("5000", "Operating Expense", "EXPENSE", "DEBIT", False),
    ]
    for num, name, typ, normal, control in defaults:
        exists = db.query(GLAccount).filter(GLAccount.company_code_id == company_code.id, GLAccount.account_number == num).first()
        if not exists:
            db.add(GLAccount(company_code_id=company_code.id, account_number=num, name=name, account_type=typ, normal_balance=normal, is_control_account=control))

    db.commit()
    return {"company_code_id": company_code.id, "ledger_id": ledger.id}
