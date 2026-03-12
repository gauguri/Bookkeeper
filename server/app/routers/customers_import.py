import csv
from io import StringIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.models import Customer
from app.module_keys import ModuleKey
from app.sales import schemas as sales_schemas

router = APIRouter(
    prefix="/api",
    tags=["customers-import"],
    dependencies=[Depends(require_module(ModuleKey.CUSTOMERS.value))],
)


class CustomerImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    accepted_values: list[str] = Field(default_factory=list)
    example: Optional[str] = None


class CustomerImportFormatResponse(BaseModel):
    delimiter: str
    has_header: bool
    required_fields: list[str]
    optional_fields: list[str]
    fields: list[CustomerImportFieldSpec]
    sample_csv: str
    notes: list[str]


class CustomerImportRequest(BaseModel):
    csv_data: str
    has_header: bool = True
    conflict_strategy: Literal["CREATE_ONLY", "UPDATE_EXISTING", "UPSERT"] = "UPSERT"


class CustomerImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int


class CustomerImportRowResult(BaseModel):
    row_number: int
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
    status: Literal["VALID", "ERROR"]
    messages: list[str]


class CustomerImportCustomerResult(BaseModel):
    id: int
    name: str
    action: Literal["CREATED", "UPDATED"]


class CustomerImportResponse(BaseModel):
    summary: CustomerImportSummary
    rows: list[CustomerImportRowResult]
    imported_customers: list[CustomerImportCustomerResult]


IMPORT_HEADER_ALIASES = {
    "name": "name",
    "customer": "name",
    "customer name": "name",
    "customer_name": "name",
    "email": "email",
    "phone": "phone",
    "billing address": "billing_address",
    "billing_address": "billing_address",
    "shipping address": "shipping_address",
    "shipping_address": "shipping_address",
    "notes": "notes",
    "tier": "ignored",
    "active": "is_active",
    "is_active": "is_active",
    "status": "is_active",
}

TRUE_VALUES = {"true", "1", "yes", "y", "active"}
FALSE_VALUES = {"false", "0", "no", "n", "inactive", "archived"}
EMAIL_MAX_LENGTH = Customer.__table__.c.email.type.length or 255
PHONE_MAX_LENGTH = Customer.__table__.c.phone.type.length or 255

IMPORT_FIELD_SPECS = [
    CustomerImportFieldSpec(field="name", label="Customer Name", required=True, description="Primary customer name.", example="DAVYDOV MONUMENTS"),
    CustomerImportFieldSpec(field="email", label="Email", required=False, description="Primary customer email address.", example="sales@davydov-monuments.pro"),
    CustomerImportFieldSpec(field="phone", label="Phone", required=False, description="Primary customer phone number.", example="+1-555-0100"),
    CustomerImportFieldSpec(field="billing_address", label="Billing Address", required=False, description="Default bill-to address for invoices."),
    CustomerImportFieldSpec(field="shipping_address", label="Shipping Address", required=False, description="Default ship-to location for deliveries."),
    CustomerImportFieldSpec(field="notes", label="Notes", required=False, description="Internal customer notes or selling guidance."),
    CustomerImportFieldSpec(field="is_active", label="Is Active", required=False, description="Customer lifecycle status.", accepted_values=["true", "false", "active", "archived"], example="true"),
]

IMPORT_SAMPLE_CSV = "\n".join(
    [
        "name,email,phone,billing_address,shipping_address,notes,is_active",
        'DAVYDOV MONUMENTS,davydov@monuments.pro,+1-555-0100,"123 Granite Way, Charlotte, NC","123 Granite Way, Charlotte, NC","Priority monument buyer",true',
        'North Ridge Memorials,accounting@northridge.test,+1-555-0133,"Atlanta, GA","Savannah, GA","Seasonal reorder account",false',
    ]
)


def _normalize_nullable_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_customer_name(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _canonicalize_header(value: str) -> str:
    return IMPORT_HEADER_ALIASES.get(value.strip().lower(), "")


def _parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return True
    normalized = value.strip().lower()
    if not normalized:
        return True
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return None


def _customer_csv_format_response() -> CustomerImportFormatResponse:
    return CustomerImportFormatResponse(
        delimiter=",",
        has_header=True,
        required_fields=["name"],
        optional_fields=["email", "phone", "billing_address", "shipping_address", "notes", "is_active"],
        fields=IMPORT_FIELD_SPECS,
        sample_csv=IMPORT_SAMPLE_CSV,
        notes=[
            "Customer name is required and is used as the matching key for update/upsert operations.",
            "Customer tier is not assigned during bulk import. New customers default to STANDARD and existing tiers remain unchanged.",
            "is_active accepts true/false, yes/no, 1/0, or active/archived.",
            "Conflict strategy controls whether matching customer names are created, updated, or both.",
            "No-header imports support either 4 columns (name, email, phone, billing_address) or 7 columns (full contract).",
        ],
    )


def _parse_customer_import_rows(payload: CustomerImportRequest) -> list[dict[str, Any]]:
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
            if canonical and canonical != "ignored":
                header_map[canonical] = field_name

        if "name" not in header_map:
            raise HTTPException(status_code=400, detail="Missing required CSV header: name")

        rows: list[dict[str, Any]] = []
        for row_number, raw_row in enumerate(reader, start=2):
            rows.append(
                {
                    "row_number": row_number,
                    "name": raw_row.get(header_map.get("name", ""), ""),
                    "email": raw_row.get(header_map.get("email", ""), ""),
                    "phone": raw_row.get(header_map.get("phone", ""), ""),
                    "billing_address": raw_row.get(header_map.get("billing_address", ""), ""),
                    "shipping_address": raw_row.get(header_map.get("shipping_address", ""), ""),
                    "notes": raw_row.get(header_map.get("notes", ""), ""),
                    "is_active": raw_row.get(header_map.get("is_active", ""), ""),
                }
            )
        return rows

    raw_rows = list(csv.reader(StringIO(content)))
    parsed_rows: list[dict[str, Any]] = []
    for row_number, row in enumerate(raw_rows, start=1):
        normalized = [cell.strip() for cell in row]

        if len(normalized) == 4:
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": normalized[0],
                    "email": normalized[1],
                    "phone": normalized[2],
                    "billing_address": normalized[3],
                    "shipping_address": "",
                    "notes": "",
                    "is_active": "true",
                }
            )
            continue

        if len(normalized) == 7:
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": normalized[0],
                    "email": normalized[1],
                    "phone": normalized[2],
                    "billing_address": normalized[3],
                    "shipping_address": normalized[4],
                    "notes": normalized[5],
                    "is_active": normalized[6],
                }
            )
            continue

        parsed_rows.append(
            {
                "row_number": row_number,
                "name": normalized[0] if len(normalized) > 0 else "",
                "email": normalized[1] if len(normalized) > 1 else "",
                "phone": normalized[2] if len(normalized) > 2 else "",
                "billing_address": normalized[3] if len(normalized) > 3 else "",
                "shipping_address": normalized[4] if len(normalized) > 4 else "",
                "notes": normalized[5] if len(normalized) > 5 else "",
                "is_active": normalized[6] if len(normalized) > 6 else "",
                "row_error": "No-header imports require either 4 columns (name, email, phone, billing_address) or 7 columns (full customer import contract).",
            }
        )

    return parsed_rows


def _safe_customer_import_flush(db: Session, row_number: int) -> None:
    try:
        db.flush()
    except DataError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Import failed at row {row_number}: one or more values exceed database limits.",
        ) from None


def _analyze_customer_import(payload: CustomerImportRequest, db: Session) -> dict[str, Any]:
    parsed_rows = _parse_customer_import_rows(payload)
    existing_customers = db.query(Customer).order_by(Customer.id.asc()).all()

    existing_by_name: dict[str, Customer] = {}
    ambiguous_name_keys: set[str] = set()
    for customer in existing_customers:
        name_key = _normalize_customer_name(customer.name)
        if not name_key:
            continue
        if name_key in existing_by_name:
            ambiguous_name_keys.add(name_key)
        else:
            existing_by_name[name_key] = customer

    first_seen_name_key: dict[str, int] = {}
    analysis_rows: list[dict[str, Any]] = []

    for raw_row in parsed_rows:
        row_number = int(raw_row["row_number"])
        messages: list[str] = []

        row_error = raw_row.get("row_error")
        if row_error:
            messages.append(str(row_error))

        name = _normalize_nullable_string(raw_row.get("name"))
        if not name:
            messages.append("Customer name is required.")

        email = _normalize_nullable_string(raw_row.get("email"))
        if email and len(email) > EMAIL_MAX_LENGTH:
            messages.append(f"Email exceeds max length of {EMAIL_MAX_LENGTH} characters.")

        phone = _normalize_nullable_string(raw_row.get("phone"))
        if phone and len(phone) > PHONE_MAX_LENGTH:
            messages.append(f"Phone exceeds max length of {PHONE_MAX_LENGTH} characters.")

        is_active_raw = _normalize_nullable_string(raw_row.get("is_active"))
        is_active = _parse_bool(is_active_raw)
        if is_active is None:
            messages.append("is_active must be true/false, yes/no, 1/0, or active/archived.")

        name_key = _normalize_customer_name(name)
        if name_key:
            if name_key in first_seen_name_key:
                messages.append(f"Duplicate customer name in file. First seen at row {first_seen_name_key[name_key]}.")
            else:
                first_seen_name_key[name_key] = row_number

        if name_key and name_key in ambiguous_name_keys:
            messages.append("Multiple existing customers already use this name. Resolve duplicates before UPDATE/UPSERT.")

        existing_customer = existing_by_name.get(name_key) if name_key and name_key not in ambiguous_name_keys else None
        action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"] = "ERROR"
        customer_payload: Optional[dict[str, Any]] = None

        if not messages:
            exists = existing_customer is not None
            if exists and payload.conflict_strategy == "CREATE_ONLY":
                messages.append("Customer already exists and conflict strategy is CREATE_ONLY.")
            elif not exists and payload.conflict_strategy == "UPDATE_EXISTING":
                messages.append("Customer does not exist and conflict strategy is UPDATE_EXISTING.")
            else:
                action = "UPDATE" if exists else "CREATE"
                candidate_payload = {
                    "name": name,
                    "email": email,
                    "phone": phone,
                    "billing_address": _normalize_nullable_string(raw_row.get("billing_address")),
                    "shipping_address": _normalize_nullable_string(raw_row.get("shipping_address")),
                    "notes": _normalize_nullable_string(raw_row.get("notes")),
                    "is_active": True if is_active is None else is_active,
                }
                try:
                    validated = sales_schemas.CustomerCreate(**candidate_payload)
                    customer_payload = validated.model_dump()
                    if exists:
                        customer_payload.pop("tier", None)
                except ValidationError as exc:
                    for error in exc.errors():
                        field = ".".join(str(part) for part in error.get("loc", []))
                        messages.append(f"{field}: {error.get('msg', 'invalid value')}")

        status_value: Literal["VALID", "ERROR"] = "ERROR" if messages else "VALID"
        if messages:
            action = "ERROR"

        analysis_rows.append(
            {
                "row_number": row_number,
                "name": name,
                "email": email,
                "is_active": is_active,
                "action": action,
                "status": status_value,
                "messages": messages,
                "payload": customer_payload,
                "existing_customer": existing_customer,
            }
        )

    summary = CustomerImportSummary(
        total_rows=len(analysis_rows),
        valid_rows=sum(1 for row in analysis_rows if row["status"] == "VALID"),
        error_rows=sum(1 for row in analysis_rows if row["status"] == "ERROR"),
        create_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "CREATE"),
        update_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "UPDATE"),
        skip_count=sum(1 for row in analysis_rows if row["action"] == "SKIP"),
    )

    rows = [
        CustomerImportRowResult(
            row_number=row["row_number"],
            name=row["name"],
            email=row["email"],
            is_active=row["is_active"],
            action=row["action"],
            status=row["status"],
            messages=row["messages"],
        )
        for row in analysis_rows
    ]

    return {
        "summary": summary,
        "rows": rows,
        "analysis_rows": analysis_rows,
    }


@router.get("/customers/import-format", response_model=CustomerImportFormatResponse)
def get_customer_import_format() -> CustomerImportFormatResponse:
    return _customer_csv_format_response()


@router.post("/customers/import-preview", response_model=CustomerImportResponse)
def preview_customer_import(payload: CustomerImportRequest, db: Session = Depends(get_db)) -> CustomerImportResponse:
    analysis = _analyze_customer_import(payload, db)
    return CustomerImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_customers=[])


@router.post("/customers/import", response_model=CustomerImportResponse, status_code=status.HTTP_201_CREATED)
@router.post("/customers/bulk-import", response_model=CustomerImportResponse, status_code=status.HTTP_201_CREATED)
def import_customers(payload: CustomerImportRequest, db: Session = Depends(get_db)) -> CustomerImportResponse:
    analysis = _analyze_customer_import(payload, db)
    if analysis["summary"].error_rows > 0:
        raise HTTPException(status_code=400, detail="Import preview contains errors. Resolve validation issues before importing.")

    imported_customers: list[CustomerImportCustomerResult] = []

    for row in analysis["analysis_rows"]:
        if row["status"] != "VALID":
            continue

        customer_payload = row["payload"]
        if row["action"] == "CREATE":
            customer = Customer(**customer_payload)
            db.add(customer)
            _safe_customer_import_flush(db, row["row_number"])
            imported_customers.append(CustomerImportCustomerResult(id=customer.id, name=customer.name, action="CREATED"))
            continue

        if row["action"] == "UPDATE":
            customer = row["existing_customer"]
            if customer is None:
                raise HTTPException(status_code=400, detail="Customer matching key could not be resolved during import.")
            for key, value in customer_payload.items():
                setattr(customer, key, value)
            _safe_customer_import_flush(db, row["row_number"])
            imported_customers.append(CustomerImportCustomerResult(id=customer.id, name=customer.name, action="UPDATED"))

    try:
        db.commit()
    except DataError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Customer import failed because one or more values exceed database limits.") from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer import failed due to a constraint conflict.") from None

    return CustomerImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_customers=imported_customers)
