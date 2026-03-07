import csv
from io import StringIO
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.accounting.service import compute_account_balance
from app.auth import require_module
from app.chart_of_accounts import schemas
from app.db import get_db
from app.models import Account, Company, Item, JournalLine
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api", tags=["chart-of-accounts"], dependencies=[Depends(require_module(ModuleKey.CHART_OF_ACCOUNTS.value))])

IMPORT_HEADER_ALIASES = {
    "code": "code",
    "account code": "code",
    "account_code": "code",
    "name": "name",
    "account name": "name",
    "account_name": "name",
    "type": "type",
    "account type": "type",
    "account_type": "type",
    "subtype": "subtype",
    "sub type": "subtype",
    "sub_type": "subtype",
    "description": "description",
    "parent": "parent_code",
    "parent code": "parent_code",
    "parent_code": "parent_code",
    "parent account": "parent_code",
    "parent_account": "parent_code",
    "parent account code": "parent_code",
    "parent_account_code": "parent_code",
    "is_active": "is_active",
    "active": "is_active",
    "status": "is_active",
}

IMPORT_FIELD_SPECS = [
    schemas.ChartAccountImportFieldSpec(
        field="code",
        label="Account Code",
        required=True,
        description="Unique account code. Recommended to align with your posting hierarchy.",
        example="110000",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="name",
        label="Account Name",
        required=True,
        description="Descriptive account name shown throughout reporting and journals.",
        example="Trade Receivables",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="type",
        label="Account Type",
        required=True,
        description="Top-level financial statement classification.",
        accepted_values=["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS", "OTHER"],
        example="ASSET",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="subtype",
        label="Subtype",
        required=False,
        description="Optional reporting subtype or local category.",
        example="Current Asset",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="description",
        label="Description",
        required=False,
        description="Optional long-form description or posting guidance.",
        example="Primary receivables control account",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="parent_code",
        label="Parent Account Code",
        required=False,
        description="Optional parent account code. Parent can already exist or be included elsewhere in the same file.",
        example="110000",
    ),
    schemas.ChartAccountImportFieldSpec(
        field="is_active",
        label="Active Flag",
        required=False,
        description="Optional active status. Defaults to true when omitted.",
        accepted_values=["true", "false", "yes", "no", "1", "0", "active", "inactive"],
        example="true",
    ),
]

IMPORT_SAMPLE_CSV = "\n".join(
    [
        "code,name,type,subtype,description,parent_code,is_active",
        '100000,Cash,ASSET,Cash and Cash Equivalents,"Main operating cash account",,true',
        '110000,Trade Receivables,ASSET,Current Asset,"Open customer receivables",,true',
        '110100,North America Trade Receivables,ASSET,Current Asset,"Regional child account",110000,true',
        '400000,Product Revenue,INCOME,Operating Revenue,"Recognized product sales",,true',
    ]
)


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


def _balances_by_account_id(db: Session) -> dict[int, float]:
    rows = (
        db.query(
            JournalLine.account_id,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .group_by(JournalLine.account_id)
        .all()
    )
    account_type_lookup = {
        account_id: account_type
        for account_id, account_type in db.query(Account.id, Account.type).all()
    }
    return {
        account_id: compute_account_balance(account_type_lookup.get(account_id, "OTHER"), debit_total, credit_total)
        for account_id, debit_total, credit_total in rows
    }


def _serialize_account(account: Account, balance: float = 0) -> schemas.ChartAccountResponse:
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
        balance=balance,
    )


def _csv_format_response() -> schemas.ChartAccountImportFormatResponse:
    return schemas.ChartAccountImportFormatResponse(
        delimiter=",",
        has_header=True,
        required_fields=["code", "name", "type"],
        optional_fields=["subtype", "description", "parent_code", "is_active"],
        fields=IMPORT_FIELD_SPECS,
        sample_csv=IMPORT_SAMPLE_CSV,
        notes=[
            "Header row is recommended and used by the workbench template.",
            "Parent account codes may reference existing accounts or accounts created elsewhere in the same file.",
            "Conflict strategy controls whether existing codes are created, updated, or both.",
            "Account code values are matched case-insensitively during import.",
        ],
    )


def _parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return True
    normalized = value.strip().lower()
    if normalized == "":
        return True
    if normalized in {"true", "1", "yes", "y", "active"}:
        return True
    if normalized in {"false", "0", "no", "n", "inactive"}:
        return False
    return None


def _account_normal_balance(account_type: str) -> str:
    return "debit" if account_type in {"ASSET", "EXPENSE", "COGS"} else "credit"


def _canonicalize_header(value: str) -> str:
    return IMPORT_HEADER_ALIASES.get(value.strip().lower(), "")


def _parse_import_rows(payload: schemas.ChartAccountImportRequest) -> list[dict[str, Any]]:
    content = payload.csv_data.strip()
    if not content:
        raise HTTPException(status_code=400, detail="CSV data is empty.")

    if payload.has_header:
        reader = csv.DictReader(StringIO(content))
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV header row is required.")
        header_map: dict[str, str] = {}
        for field_name in reader.fieldnames:
            if field_name is None:
                continue
            canonical = _canonicalize_header(field_name)
            if canonical:
                header_map[canonical] = field_name

        missing_headers = [field for field in ("code", "name", "type") if field not in header_map]
        if missing_headers:
            raise HTTPException(status_code=400, detail=f"Missing required CSV headers: {', '.join(missing_headers)}")

        rows: list[dict[str, Any]] = []
        for row_number, raw_row in enumerate(reader, start=2):
            rows.append(
                {
                    "row_number": row_number,
                    "code": (raw_row.get(header_map.get("code", "")) or "").strip(),
                    "name": (raw_row.get(header_map.get("name", "")) or "").strip(),
                    "type": (raw_row.get(header_map.get("type", "")) or "").strip(),
                    "subtype": (raw_row.get(header_map.get("subtype", "")) or "").strip(),
                    "description": (raw_row.get(header_map.get("description", "")) or "").strip(),
                    "parent_code": (raw_row.get(header_map.get("parent_code", "")) or "").strip(),
                    "is_active": (raw_row.get(header_map.get("is_active", "")) or "").strip(),
                }
            )
        return rows

    raw_rows = list(csv.reader(StringIO(content)))
    parsed_rows: list[dict[str, Any]] = []
    for row_number, row in enumerate(raw_rows, start=1):
        normalized = [cell.strip() for cell in row]
        if len(normalized) == 5:
            code, name, account_type, subtype, parent_code = normalized
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "code": code,
                    "name": name,
                    "type": account_type,
                    "subtype": subtype,
                    "description": "",
                    "parent_code": parent_code,
                    "is_active": "true",
                }
            )
            continue
        if len(normalized) == 7:
            code, name, account_type, subtype, description, parent_code, is_active = normalized
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "code": code,
                    "name": name,
                    "type": account_type,
                    "subtype": subtype,
                    "description": description,
                    "parent_code": parent_code,
                    "is_active": is_active,
                }
            )
            continue

        parsed_rows.append(
            {
                "row_number": row_number,
                "code": normalized[0] if normalized else "",
                "name": normalized[1] if len(normalized) > 1 else "",
                "type": normalized[2] if len(normalized) > 2 else "",
                "subtype": normalized[3] if len(normalized) > 3 else "",
                "description": normalized[4] if len(normalized) > 4 else "",
                "parent_code": normalized[5] if len(normalized) > 5 else "",
                "is_active": normalized[6] if len(normalized) > 6 else "",
                "row_error": "Legacy no-header imports must provide either 5 columns (Code, Name, Type, Subtype, Parent) or 7 columns (Code, Name, Type, Subtype, Description, Parent, IsActive).",
            }
        )
    return parsed_rows


def _analyze_import(payload: schemas.ChartAccountImportRequest, db: Session) -> dict[str, Any]:
    parsed_rows = _parse_import_rows(payload)
    existing_accounts = db.query(Account).all()
    existing_by_code = {account.code.strip().upper(): account for account in existing_accounts if account.code}
    valid_types = set(schemas.AccountType.__args__)

    analysis_rows: list[dict[str, Any]] = []
    first_seen_line_by_code: dict[str, int] = {}
    candidate_codes: set[str] = set()

    for raw_row in parsed_rows:
        row_number = int(raw_row["row_number"])
        code = (raw_row.get("code") or "").strip().upper()
        name = (raw_row.get("name") or "").strip()
        account_type = _normalize_type((raw_row.get("type") or "").strip())
        subtype = (raw_row.get("subtype") or "").strip() or None
        description = (raw_row.get("description") or "").strip() or None
        parent_code_raw = (raw_row.get("parent_code") or "").strip()
        parent_code = parent_code_raw.upper() if parent_code_raw and parent_code_raw.lower() != "null" else None
        active_flag = _parse_bool(raw_row.get("is_active"))
        messages: list[str] = []

        if raw_row.get("row_error"):
            messages.append(str(raw_row["row_error"]))
        if not code:
            messages.append("Account code is required.")
        if not name:
            messages.append("Account name is required.")
        if not account_type:
            messages.append("Account type is required.")
        elif account_type not in valid_types:
            messages.append(f"Invalid account type '{raw_row.get('type')}'.")
        if active_flag is None:
            messages.append("is_active must be true/false, yes/no, 1/0, or active/inactive.")
        if code and parent_code == code:
            messages.append("An account cannot reference itself as parent.")

        if code:
            if code in first_seen_line_by_code:
                messages.append(f"Duplicate account code in file. First seen at row {first_seen_line_by_code[code]}.")
            else:
                first_seen_line_by_code[code] = row_number
                candidate_codes.add(code)

        action = "ERROR"
        if not messages and code:
            exists = code in existing_by_code
            if exists and payload.conflict_strategy == "CREATE_ONLY":
                messages.append("Account code already exists and conflict strategy is CREATE_ONLY.")
            elif not exists and payload.conflict_strategy == "UPDATE_EXISTING":
                messages.append("Account code does not exist and conflict strategy is UPDATE_EXISTING.")
            else:
                action = "UPDATE" if exists else "CREATE"

        analysis_rows.append(
            {
                "row_number": row_number,
                "code": code or None,
                "name": name or None,
                "account_type": account_type or None,
                "subtype": subtype,
                "description": description,
                "parent_code": parent_code,
                "is_active": True if active_flag is None else active_flag,
                "action": action,
                "status": "ERROR" if messages else "VALID",
                "messages": messages,
            }
        )

    known_codes = set(existing_by_code.keys()) | {row["code"] for row in analysis_rows if row["code"]}
    for row in analysis_rows:
        if row["status"] == "ERROR":
            continue
        if row["parent_code"] and row["parent_code"] not in known_codes:
            row["status"] = "ERROR"
            row["action"] = "ERROR"
            row["messages"].append(f"Parent account code '{row['parent_code']}' was not found in the ledger or import file.")

    create_rows = [row for row in analysis_rows if row["status"] == "VALID" and row["action"] == "CREATE"]
    available_codes = set(existing_by_code.keys())
    ordered_create_codes: list[str] = []
    pending_create_codes = {row["code"] for row in create_rows if row["code"]}
    create_row_lookup = {row["code"]: row for row in create_rows if row["code"]}

    while pending_create_codes:
        progressed = False
        for code in list(pending_create_codes):
            row = create_row_lookup[code]
            parent_code = row["parent_code"]
            if parent_code and parent_code not in available_codes:
                continue
            ordered_create_codes.append(code)
            available_codes.add(code)
            pending_create_codes.remove(code)
            progressed = True
        if not progressed:
            for code in sorted(pending_create_codes):
                row = create_row_lookup[code]
                row["status"] = "ERROR"
                row["action"] = "ERROR"
                row["messages"].append("Parent hierarchy contains a cycle or unresolved dependency within the import batch.")
            break

    final_available_codes = set(existing_by_code.keys()) | set(ordered_create_codes)
    for row in analysis_rows:
        if row["status"] == "ERROR":
            continue
        if row["action"] == "UPDATE" and row["parent_code"] and row["parent_code"] not in final_available_codes:
            row["status"] = "ERROR"
            row["action"] = "ERROR"
            row["messages"].append(f"Parent account code '{row['parent_code']}' could not be resolved after create planning.")

    summary = schemas.ChartAccountImportSummary(
        total_rows=len(analysis_rows),
        valid_rows=sum(1 for row in analysis_rows if row["status"] == "VALID"),
        error_rows=sum(1 for row in analysis_rows if row["status"] == "ERROR"),
        create_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "CREATE"),
        update_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "UPDATE"),
        skip_count=sum(1 for row in analysis_rows if row["action"] == "SKIP"),
    )
    response_rows = [
        schemas.ChartAccountImportRowResult(
            row_number=row["row_number"],
            code=row["code"],
            name=row["name"],
            account_type=row["account_type"],
            parent_code=row["parent_code"],
            action=row["action"],
            status=row["status"],
            messages=row["messages"],
        )
        for row in analysis_rows
    ]
    return {
        "summary": summary,
        "rows": response_rows,
        "row_map": {row["code"]: row for row in analysis_rows if row["code"]},
        "create_order": ordered_create_codes,
        "existing_by_code": existing_by_code,
    }


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
    balances = _balances_by_account_id(db)
    return [_serialize_account(account, balances.get(account.id, 0)) for account in accounts]


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
        normal_balance=_account_normal_balance(payload.type),
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
    return _serialize_account(account, _balances_by_account_id(db).get(account.id, 0))


@router.get("/chart-of-accounts/import-format", response_model=schemas.ChartAccountImportFormatResponse)
def get_chart_of_accounts_import_format():
    return _csv_format_response()


@router.post("/chart-of-accounts/import-preview", response_model=schemas.ChartAccountImportResponse)
def preview_chart_of_accounts_import(payload: schemas.ChartAccountImportRequest, db: Session = Depends(get_db)):
    analysis = _analyze_import(payload, db)
    return schemas.ChartAccountImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_accounts=[])


@router.post("/chart-of-accounts/import", response_model=schemas.ChartAccountImportResponse, status_code=status.HTTP_201_CREATED)
@router.post("/chart-of-accounts/bulk-import", response_model=schemas.ChartAccountImportResponse, status_code=status.HTTP_201_CREATED)
def import_chart_of_accounts(payload: schemas.ChartAccountImportRequest, db: Session = Depends(get_db)):
    analysis = _analyze_import(payload, db)
    if analysis["summary"].error_rows > 0:
        raise HTTPException(status_code=400, detail="Import preview contains errors. Resolve validation issues before importing.")

    code_to_account = {account.code.strip().upper(): account for account in db.query(Account).all() if account.code}
    imported_accounts: list[schemas.ChartAccountImportAccountResult] = []
    default_company_id = _get_default_company_id(db)

    for code in analysis["create_order"]:
        row = analysis["row_map"][code]
        account = Account(
            company_id=default_company_id,
            code=code,
            name=row["name"],
            type=row["account_type"],
            subtype=row["subtype"],
            description=row["description"],
            is_active=row["is_active"],
            parent_id=code_to_account[row["parent_code"]].id if row["parent_code"] else None,
            normal_balance=_account_normal_balance(row["account_type"]),
        )
        db.add(account)
        db.flush()
        code_to_account[code] = account
        imported_accounts.append(
            schemas.ChartAccountImportAccountResult(
                id=account.id,
                code=code,
                name=account.name,
                action="CREATED",
                parent_account_id=account.parent_id,
            )
        )

    update_rows = [row for row in analysis["row_map"].values() if row["action"] == "UPDATE"]
    for row in update_rows:
        account = code_to_account[row["code"]]
        account.name = row["name"]
        account.type = row["account_type"]
        account.subtype = row["subtype"]
        account.description = row["description"]
        account.is_active = row["is_active"]
        account.parent_id = code_to_account[row["parent_code"]].id if row["parent_code"] else None
        account.normal_balance = _account_normal_balance(row["account_type"])
        imported_accounts.append(
            schemas.ChartAccountImportAccountResult(
                id=account.id,
                code=row["code"],
                name=account.name,
                action="UPDATED",
                parent_account_id=account.parent_id,
            )
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="One or more account codes already exist.") from None

    return schemas.ChartAccountImportResponse(
        summary=analysis["summary"],
        rows=analysis["rows"],
        imported_accounts=imported_accounts,
    )

@router.get("/chart-of-accounts/{account_id}", response_model=schemas.ChartAccountResponse)
def get_chart_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).options(selectinload(Account.parent)).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return _serialize_account(account, _balances_by_account_id(db).get(account.id, 0))


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
        account.normal_balance = _account_normal_balance(account.type)

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
    return _serialize_account(account, _balances_by_account_id(db).get(account.id, 0))


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




