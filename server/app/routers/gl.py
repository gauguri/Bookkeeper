from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased, selectinload

from app.auth import require_module
from app.db import get_db
from app.gl import schemas, service
from app.models import (
    Account,
    CompanyCode,
    FiscalYearVariant,
    GLAccount,
    GLJournalHeader,
    GLPostingBatch,
    GLJournalLine,
    GLLedger,
    GLBalance,
    PostingPeriodStatus,
)
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api/gl", tags=["gl"], dependencies=[Depends(require_module(ModuleKey.GENERAL_LEDGER.value))])
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


def _normal_balance_for_type(account_type: str) -> str:
    return "DEBIT" if account_type in {"ASSET", "EXPENSE"} else "CREDIT"


def _cash_balance_account_filter():
    lowered_name = func.lower(GLAccount.name)
    return or_(
        GLAccount.account_number.like("10%"),
        GLAccount.account_number.like("11%"),
        lowered_name.like("%cash%"),
        lowered_name.like("%checking%"),
        lowered_name.like("%money market%"),
        lowered_name.like("%petty cash%"),
        lowered_name.like("%cash equivalent%"),
    )


def _resolve_company_code_id(db: Session, requested_company_code_id: int | None) -> int | None:
    if requested_company_code_id is not None:
        exists = db.query(CompanyCode.id).filter(CompanyCode.id == requested_company_code_id).first()
        if exists:
            return requested_company_code_id

    first = db.query(CompanyCode.id).order_by(CompanyCode.id.asc()).first()
    return first[0] if first else None


def _sync_gl_accounts_from_coa(db: Session, company_code_id: int) -> None:
    """Mirror COA rows into GL accounts so posting and account selection share one source dataset."""
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
            db.add(
                GLAccount(
                    company_code_id=company_code_id,
                    account_number=account_code,
                    name=coa.name,
                    account_type=mapped_type,
                    normal_balance=_normal_balance_for_type(mapped_type),
                    is_control_account=False,
                    is_active=bool(coa.is_active),
                )
            )
            continue

        gl_account.name = coa.name
        gl_account.account_type = mapped_type
        gl_account.normal_balance = _normal_balance_for_type(mapped_type)
        gl_account.is_active = bool(coa.is_active)

    db.flush()


@router.get("/accounts", response_model=list[schemas.GLAccountResponse])
def list_accounts(
    search: str | None = None,
    type: str | None = None,
    active: bool | None = None,
    active_only: bool = False,
    postable_only: bool = False,
    company_code_id: int | None = None,
    db: Session = Depends(get_db),
):
    normalized_company_code_id = _resolve_company_code_id(db, company_code_id)
    if normalized_company_code_id is None:
        return []

    _sync_gl_accounts_from_coa(db, normalized_company_code_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()

    child_account = aliased(GLAccount)
    query = db.query(GLAccount).order_by(GLAccount.account_number.asc())
    if search:
        like = f"%{search}%"
        query = query.filter(or_(GLAccount.account_number.ilike(like), GLAccount.name.ilike(like)))
    if type:
        query = query.filter(GLAccount.account_type == type)
    effective_active = True if active_only else active
    if effective_active is not None:
        query = query.filter(GLAccount.is_active == effective_active)
    query = query.filter(GLAccount.company_code_id == normalized_company_code_id)
    if postable_only:
        query = (
            query.outerjoin(child_account, child_account.parent_account_id == GLAccount.id)
            .filter(child_account.id.is_(None))
            .filter(GLAccount.account_number.isnot(None))
            .filter(func.trim(GLAccount.account_number) != "")
            .filter(GLAccount.account_number != "—")
            .filter(GLAccount.is_control_account.is_(False))
        )
    if hasattr(GLAccount, "allow_manual_posting"):
        query = query.filter(getattr(GLAccount, "allow_manual_posting").is_(True))
    rows = query.all()
    return [
        {
            "id": account.id,
            "company_code_id": account.company_code_id,
            "account_number": account.account_number,
            "name": account.name,
            "account_type": account.account_type,
            "normal_balance": account.normal_balance,
            "is_control_account": account.is_control_account,
            "is_active": account.is_active,
            "parent_account_id": account.parent_account_id,
            "parent_id": account.parent_account_id,
            "is_postable": bool(
                account.is_active
                and account.account_number
                and account.account_number.strip()
                and account.account_number.strip() != "—"
                and not account.is_control_account
            ),
        }
        for account in rows
    ]


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
    queue: str | None = None,
    status: str | None = None,
    source: str | None = None,
    period: str | None = None,
    date_range: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(GLJournalHeader).options(selectinload(GLJournalHeader.lines)).order_by(GLJournalHeader.posting_date.desc(), GLJournalHeader.id.desc())
    if queue:
        queue_key = queue.lower()
        if queue_key == "draft":
            query = query.filter(GLJournalHeader.status == "DRAFT")
        elif queue_key == "ready":
            query = query.filter(GLJournalHeader.status == "DRAFT")
        elif queue_key == "posted":
            query = query.filter(GLJournalHeader.status == "POSTED")
        elif queue_key == "reversed":
            query = query.filter(GLJournalHeader.status == "REVERSED")
        elif queue_key == "needs_attention":
            query = query.filter(GLJournalHeader.status == "DRAFT")
    if status:
        query = query.filter(GLJournalHeader.status == status)
    if source:
        query = query.filter(GLJournalHeader.source_module == source)
    if period:
        if "-" in period:
            year_str, month_str = period.split("-", 1)
            query = query.filter(GLJournalHeader.fiscal_year == int(year_str), GLJournalHeader.period_number == int(month_str))
        else:
            query = query.filter(GLJournalHeader.period_number == int(period))
    if date_range:
        now = datetime.utcnow()
        if date_range == "MTD":
            query = query.filter(GLJournalHeader.posting_date >= datetime(now.year, now.month, 1).date())
        elif date_range == "QTD":
            q_month = ((now.month - 1) // 3) * 3 + 1
            query = query.filter(GLJournalHeader.posting_date >= datetime(now.year, q_month, 1).date())
        elif date_range == "YTD":
            query = query.filter(GLJournalHeader.posting_date >= datetime(now.year, 1, 1).date())
        elif date_range == "12M":
            min_year = now.year - 1 if now.month < 12 else now.year
            min_month = now.month + 1 if now.month < 12 else 1
            query = query.filter(
                or_(
                    GLJournalHeader.fiscal_year > min_year,
                    (GLJournalHeader.fiscal_year == min_year) & (GLJournalHeader.period_number >= min_month),
                )
            )
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
                "description": h.header_text,
                "debits": sum((line.debit_amount for line in h.lines), 0),
                "credits": sum((line.credit_amount for line in h.lines), 0),
                "status": h.status,
                "period_label": f"{h.fiscal_year}-{h.period_number:02d}",
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


@router.get("/reports/trial-balance-status")
def trial_balance_status(period: str, ledger_id: int | None = None, db: Session = Depends(get_db)):
    period_year, period_number = [int(v) for v in period.split("-", 1)]
    ledger = db.query(GLLedger).order_by(GLLedger.id.asc()).first() if ledger_id is None else db.get(GLLedger, ledger_id)
    if not ledger:
        return {"balanced": True, "imbalance_amount": 0, "last_refreshed": datetime.utcnow().isoformat()}
    rows = (
        db.query(GLBalance, GLAccount)
        .join(GLAccount, GLBalance.gl_account_id == GLAccount.id)
        .filter(GLBalance.ledger_id == ledger.id, GLBalance.fiscal_year == period_year, GLBalance.period_number == period_number)
        .all()
    )
    debit_total = Decimal("0.00")
    credit_total = Decimal("0.00")
    last_refreshed = None
    for bal, account in rows:
        if account.normal_balance == "DEBIT":
            debit_total += bal.closing_balance
        else:
            credit_total += bal.closing_balance
        last_refreshed = max(last_refreshed, bal.updated_at) if last_refreshed else bal.updated_at
    imbalance = abs(debit_total - credit_total)
    return {
        "balanced": imbalance == 0,
        "imbalance_amount": float(imbalance),
        "last_refreshed": (last_refreshed or datetime.utcnow()).isoformat(),
    }


@router.get("/command-center/summary")
def command_center_summary(date_range: str = Query("MTD", alias="range", pattern="^(MTD|QTD|YTD|12M)$"), ledger_id: int | None = None, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    ledger = db.query(GLLedger).order_by(GLLedger.id.asc()).first() if ledger_id is None else db.get(GLLedger, ledger_id)
    if not ledger:
        return {
            "unposted_count": 0,
            "exceptions_count": 0,
            "trial_balance_balanced": True,
            "trial_balance_imbalance_amount": 0,
            "current_period_label": f"{now.year}-{now.month:02d}",
            "current_period_open": True,
            "ytd_net_income": 0,
            "cash_balance": 0,
            "posted_volume_series": [],
            "net_income_series": [],
            "revenue_series": [],
            "expense_series": [],
            "account_balance_composition": [],
        }

    current_year = now.year
    current_period = now.month
    period_status = db.query(PostingPeriodStatus).filter(
        PostingPeriodStatus.company_code_id == ledger.company_code_id,
        PostingPeriodStatus.fiscal_year == current_year,
        PostingPeriodStatus.period_number == current_period,
    ).first()
    current_period_open = period_status.is_open if period_status else True

    unposted_count = db.query(func.count(GLJournalHeader.id)).filter(GLJournalHeader.ledger_id == ledger.id, GLJournalHeader.status == "DRAFT").scalar() or 0
    exceptions_count = db.query(func.count(GLPostingBatch.id)).filter(GLPostingBatch.ledger_id == ledger.id, GLPostingBatch.status == "FAILED").scalar() or 0

    monthly_rows = (
        db.query(GLBalance.period_number, GLAccount.account_type, func.sum(GLBalance.closing_balance))
        .join(GLAccount, GLBalance.gl_account_id == GLAccount.id)
        .filter(GLBalance.ledger_id == ledger.id, GLBalance.fiscal_year == current_year)
        .group_by(GLBalance.period_number, GLAccount.account_type)
        .all()
    )
    monthly_map: dict[int, dict[str, Decimal]] = {}
    for period_number, account_type, balance in monthly_rows:
        bucket = monthly_map.setdefault(period_number, {})
        bucket[account_type] = Decimal(str(balance or 0))

    months = list(range(max(1, current_period - 11), current_period + 1))
    revenue_series = []
    expense_series = []
    net_income_series = []
    for month in months:
        revenue = float(monthly_map.get(month, {}).get("REVENUE", Decimal("0.00")))
        expense = float(monthly_map.get(month, {}).get("EXPENSE", Decimal("0.00")))
        revenue_series.append({"period": f"{current_year}-{month:02d}", "value": revenue})
        expense_series.append({"period": f"{current_year}-{month:02d}", "value": expense})
        net_income_series.append({"period": f"{current_year}-{month:02d}", "value": revenue - expense})

    ytd_net_income = sum(point["value"] for point in net_income_series if int(point["period"].split("-")[1]) <= current_period)

    cash_balance = (
        db.query(func.sum(GLBalance.closing_balance))
        .join(GLAccount, GLBalance.gl_account_id == GLAccount.id)
        .filter(
            GLBalance.ledger_id == ledger.id,
            GLBalance.fiscal_year == current_year,
            GLBalance.period_number == current_period,
            GLAccount.account_type == "ASSET",
            _cash_balance_account_filter(),
        )
        .scalar()
        or 0
    )

    posted_volume_rows = (
        db.query(GLJournalHeader.period_number, func.count(GLJournalHeader.id))
        .filter(GLJournalHeader.ledger_id == ledger.id, GLJournalHeader.fiscal_year == current_year, GLJournalHeader.status == "POSTED")
        .group_by(GLJournalHeader.period_number)
        .all()
    )
    posted_volume_map = {period_number: count for period_number, count in posted_volume_rows}
    posted_volume_series = [{"period": f"{current_year}-{month:02d}", "value": int(posted_volume_map.get(month, 0))} for month in months]

    composition_rows = (
        db.query(GLAccount.name, func.sum(GLBalance.closing_balance))
        .join(GLAccount, GLBalance.gl_account_id == GLAccount.id)
        .filter(GLBalance.ledger_id == ledger.id, GLBalance.fiscal_year == current_year, GLBalance.period_number == current_period)
        .group_by(GLAccount.name)
        .all()
    )
    sorted_composition = sorted(
        [{"category": name, "value": float(abs(total or 0))} for name, total in composition_rows],
        key=lambda row: row["value"],
        reverse=True,
    )
    top_six = sorted_composition[:6]
    other_total = sum(row["value"] for row in sorted_composition[6:])
    if other_total > 0:
        top_six.append({"category": "Other", "value": other_total})

    trial_balance = trial_balance_status(period=f"{current_year}-{current_period:02d}", ledger_id=ledger.id, db=db)
    return {
        "unposted_count": int(unposted_count),
        "exceptions_count": int(exceptions_count),
        "trial_balance_balanced": bool(trial_balance["balanced"]),
        "trial_balance_imbalance_amount": float(trial_balance["imbalance_amount"]),
        "current_period_label": f"{current_year}-{current_period:02d}",
        "current_period_open": bool(current_period_open),
        "ytd_net_income": float(ytd_net_income),
        "cash_balance": float(cash_balance),
        "posted_volume_series": posted_volume_series,
        "net_income_series": net_income_series,
        "revenue_series": revenue_series,
        "expense_series": expense_series,
        "account_balance_composition": top_six,
    }


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
        try:
            company_code = CompanyCode(code="1000", name="Main Company", base_currency="USD")
            db.add(company_code)
            db.flush()
        except IntegrityError:
            db.rollback()
            company_code = db.query(CompanyCode).filter(CompanyCode.code == "1000").first()
            if not company_code:
                raise

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
