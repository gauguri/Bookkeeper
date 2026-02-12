import csv
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.chart_of_accounts import schemas
from app.db import get_db
from app.models import Account, Company, Item, JournalLine

router = APIRouter(prefix="/api", tags=["chart-of-accounts"])


def _normalize_type(account_type: Optional[str]) -> Optional[str]:
    if account_type is None:
        return None
    return account_type.upper()


def _get_default_company_id(db: Session) -> int:
    company = db.query(Company).order_by(Company.id.asc()).first()
    if company:
        return company.id

    company = Company(name="Demo Company", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()
    return company.id


def _serialize_account(account: Account) -> schemas.ChartAccountResponse:
    parent_summary = None
    if account.parent:
        parent_summary = schemas.AccountParentSummary(id=account.parent.id, name=account.parent.name, code=account.parent.code)
    return schemas.ChartAccountResponse(
        id=account.id,
        name=account.name,
        code=account.code,
        type=_normalize_type(account.type) or "OTHER",
        subtype=account.subtype,
        description=account.description,
        is_active=account.is_active,
        parent_account_id=account.parent_id,
        parent_account=parent_summary,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


@router.get("/chart-of-accounts", response_model=List[schemas.ChartAccountResponse])
def list_chart_of_accounts(
    type: Optional[schemas.AccountType] = None,
    active: Optional[bool] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Account).options(selectinload(Account.parent))
    if type:
        query = query.filter(func.upper(Account.type) == _normalize_type(type))
    if active is not None:
        query = query.filter(Account.is_active.is_(active))
    if q:
        like = f"%{q}%"
        query = query.filter((Account.name.ilike(like)) | (Account.code.ilike(like)))

    accounts = query.order_by(Account.type.asc(), Account.name.asc()).all()
    return [_serialize_account(account) for account in accounts]


@router.post("/chart-of-accounts", response_model=schemas.ChartAccountResponse, status_code=status.HTTP_201_CREATED)
def create_chart_account(payload: schemas.ChartAccountCreate, db: Session = Depends(get_db)):
    parent = None
    if payload.parent_account_id:
        parent = db.query(Account).filter(Account.id == payload.parent_account_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent account not found.")

    account = Account(
        company_id=_get_default_company_id(db),
        code=payload.code,
        name=payload.name,
        type=_normalize_type(payload.type),
        subtype=payload.subtype,
        description=payload.description,
        is_active=payload.is_active,
        parent_id=payload.parent_account_id,
        normal_balance="debit" if payload.type in {"ASSET", "EXPENSE", "COGS"} else "credit",
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Account code already exists.") from None
    db.refresh(account)
    if parent:
        account.parent = parent
    return _serialize_account(account)


@router.get("/chart-of-accounts/{account_id}", response_model=schemas.ChartAccountResponse)
def get_chart_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).options(selectinload(Account.parent)).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return _serialize_account(account)


@router.put("/chart-of-accounts/{account_id}", response_model=schemas.ChartAccountResponse)
@router.patch("/chart-of-accounts/{account_id}", response_model=schemas.ChartAccountResponse)
def update_chart_account(account_id: int, payload: schemas.ChartAccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).options(selectinload(Account.parent)).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    data = payload.model_dump(exclude_unset=True)
    if "parent_account_id" in data:
        parent_id = data["parent_account_id"]
        if parent_id == account.id:
            raise HTTPException(status_code=400, detail="An account cannot be its own parent.")
        if parent_id is not None:
            parent = db.query(Account).filter(Account.id == parent_id).first()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent account not found.")
        account.parent_id = parent_id
    if "type" in data:
        account.type = _normalize_type(data["type"])
        account.normal_balance = "debit" if account.type in {"ASSET", "EXPENSE", "COGS"} else "credit"

    for key in ["name", "code", "subtype", "description", "is_active"]:
        if key in data:
            setattr(account, key, data[key])

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Account code already exists.") from None

    db.refresh(account)
    account = db.query(Account).options(selectinload(Account.parent)).filter(Account.id == account_id).first()
    return _serialize_account(account)


@router.delete("/chart-of-accounts/{account_id}", response_model=dict)
def delete_chart_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    in_use = (
        db.query(JournalLine.id).filter(JournalLine.account_id == account_id).first() is not None
        or db.query(Item.id).filter(Item.income_account_id == account_id).first() is not None
        or db.query(Account.id).filter(Account.parent_id == account_id).first() is not None
    )
    if in_use:
        raise HTTPException(status_code=409, detail="Cannot delete account that is in use.")

    try:
        db.delete(account)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete account that is in use.") from None

    return {"status": "ok"}


@router.post("/chart-of-accounts/bulk-import", response_model=schemas.ChartAccountBulkImportResponse, status_code=status.HTTP_201_CREATED)
def bulk_import_chart_of_accounts(payload: schemas.ChartAccountBulkImportRequest, db: Session = Depends(get_db)):
    rows = list(csv.reader(StringIO(payload.csv_data.strip())))
    if not rows:
        raise HTTPException(status_code=400, detail="CSV data is empty.")

    default_company_id = _get_default_company_id(db)
    existing_accounts = db.query(Account).all()
    code_to_id = {account.code.strip().upper(): account.id for account in existing_accounts if account.code}

    pending_rows: list[tuple[str, str, Optional[str]]] = []
    for index, row in enumerate(rows, start=1):
        if len(row) != 3:
            raise HTTPException(status_code=400, detail=f"Invalid row format at line {index}. Expected: Code, Name, Parent.")

        code = row[0].strip()
        name = row[1].strip()
        parent_code_raw = row[2].strip()

        if not code or not name:
            raise HTTPException(status_code=400, detail=f"Code and Name are required at line {index}.")

        normalized_code = code.upper()
        if normalized_code in code_to_id or any(existing_code == normalized_code for existing_code, _, _ in pending_rows):
            raise HTTPException(status_code=409, detail=f"Duplicate account code '{code}' at line {index}.")

        parent_code = None
        if parent_code_raw and parent_code_raw.lower() != "null":
            parent_code = parent_code_raw.upper()

        pending_rows.append((normalized_code, name, parent_code))

    created_accounts: list[Account] = []
    pending_by_code = {code: (name, parent_code) for code, name, parent_code in pending_rows}

    while pending_by_code:
        created_this_pass = False
        for code, (name, parent_code) in list(pending_by_code.items()):
            if parent_code is not None and parent_code not in code_to_id:
                continue

            account = Account(
                company_id=default_company_id,
                code=code,
                name=name,
                type="OTHER",
                subtype=None,
                description=None,
                is_active=True,
                parent_id=code_to_id.get(parent_code),
                normal_balance="credit",
            )
            db.add(account)
            db.flush()

            code_to_id[code] = account.id
            created_accounts.append(account)
            pending_by_code.pop(code)
            created_this_pass = True

        if not created_this_pass:
            unresolved = ", ".join(sorted(code for _, (_, code) in pending_by_code.items() if code))
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Unable to resolve parent account codes: {unresolved}.")

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="One or more account codes already exist.") from None

    for account in created_accounts:
        db.refresh(account)

    return schemas.ChartAccountBulkImportResponse(
        created_count=len(created_accounts),
        accounts=[
            schemas.ChartAccountBulkImportResult(
                code=account.code or "",
                name=account.name,
                parent_account_id=account.parent_id,
            )
            for account in created_accounts
        ],
    )
