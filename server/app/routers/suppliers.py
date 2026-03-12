import csv
import re
from decimal import Decimal
from io import StringIO
from typing import Any, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_module
from app.module_keys import ModuleKey
from app.db import get_db
from app.models import InvoiceLine, Item, PurchaseOrder, PurchaseOrderLine, PurchaseOrderSendLog, Supplier, SupplierItem
from app.suppliers import schemas
from app.suppliers.service import get_supplier_link, set_preferred_supplier

router = APIRouter(prefix="/api", tags=["suppliers"], dependencies=[Depends(require_module(ModuleKey.SUPPLIERS.value))])


def _as_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value if value is not None else 0))


def _as_optional_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    return _as_decimal(value)


def _serialize_supplier_item(link: SupplierItem) -> schemas.SupplierItemBySupplierResponse:
    default_unit_cost = link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost
    return schemas.SupplierItemBySupplierResponse(
        id=link.id,
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        item_name=link.item.name,
        sku=link.item.sku,
        item_sku=link.item.sku,
        default_unit_cost=_as_decimal(default_unit_cost),
        item_unit_price=_as_decimal(link.item.unit_price),
        supplier_cost=_as_decimal(link.supplier_cost),
        freight_cost=_as_decimal(link.freight_cost),
        tariff_cost=_as_decimal(link.tariff_cost),
        landed_cost=_as_decimal(link.landed_cost),
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=_as_optional_decimal(link.min_order_qty),
        notes=link.notes,
        is_active=link.is_active,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


IMPORT_HEADER_ALIASES = {
    "name": "name",
    "supplier name": "name",
    "supplier_name": "name",
    "legal name": "legal_name",
    "legal_name": "legal_name",
    "website": "website",
    "contact name": "contact_name",
    "contact_name": "contact_name",
    "email": "email",
    "phone": "phone",
    "tax id": "tax_id",
    "tax_id": "tax_id",
    "remit-to address": "remit_to_address",
    "remit_to_address": "remit_to_address",
    "ship-from address": "ship_from_address",
    "ship_from_address": "ship_from_address",
    "lead time days": "default_lead_time_days",
    "default_lead_time_days": "default_lead_time_days",
    "payment terms": "payment_terms",
    "payment_terms": "payment_terms",
    "currency": "currency",
    "status": "status",
    "shipping terms": "shipping_terms",
    "shipping_terms": "shipping_terms",
    "notes": "notes",
    "address": "address",
}

IMPORT_FIELD_SPECS = [
    schemas.SupplierImportFieldSpec(field="name", label="Supplier Name", required=True, description="Primary supplier name.", example="Regatta Granites India"),
    schemas.SupplierImportFieldSpec(field="legal_name", label="Legal Name", required=False, description="Registered legal entity name.", example="Regatta Granites India Private Limited"),
    schemas.SupplierImportFieldSpec(field="website", label="Website", required=False, description="Supplier website URL.", example="https://www.regattagranitesindia.com/"),
    schemas.SupplierImportFieldSpec(field="contact_name", label="Contact Name", required=False, description="Primary contact person.", example="Sundeep Gandotra"),
    schemas.SupplierImportFieldSpec(field="email", label="Email", required=False, description="Primary supplier email.", example="contact@supplier.com"),
    schemas.SupplierImportFieldSpec(field="phone", label="Phone", required=False, description="Primary supplier phone number.", example="+91 9910066990"),
    schemas.SupplierImportFieldSpec(field="tax_id", label="Tax ID", required=False, description="Supplier tax or registration identifier.", example="GSTIN-XYZ"),
    schemas.SupplierImportFieldSpec(field="remit_to_address", label="Remit-to Address", required=False, description="Address used for payment remittance."),
    schemas.SupplierImportFieldSpec(field="ship_from_address", label="Ship-from Address", required=False, description="Origin address for shipments."),
    schemas.SupplierImportFieldSpec(field="default_lead_time_days", label="Lead Time Days", required=False, description="Default procurement lead time in days.", example="90"),
    schemas.SupplierImportFieldSpec(field="payment_terms", label="Payment Terms", required=False, description="Default payment terms.", example="Net 30"),
    schemas.SupplierImportFieldSpec(field="currency", label="Currency", required=False, description="Default supplier transaction currency.", example="USD"),
    schemas.SupplierImportFieldSpec(field="status", label="Status", required=False, description="Supplier lifecycle status.", accepted_values=["active", "inactive"], example="active"),
    schemas.SupplierImportFieldSpec(field="shipping_terms", label="Shipping Terms", required=False, description="Incoterms or shipping conditions.", example="FOB"),
    schemas.SupplierImportFieldSpec(field="notes", label="Notes", required=False, description="Free-form internal notes."),
    schemas.SupplierImportFieldSpec(field="address", label="Address", required=False, description="General supplier address field."),
]

IMPORT_SAMPLE_CSV = "\n".join(
    [
        "name,legal_name,website,contact_name,email,phone,tax_id,remit_to_address,ship_from_address,default_lead_time_days,payment_terms,currency,status,shipping_terms,notes,address",
        'Regatta Granites India,Regatta Granites India Private Limited,https://www.regattagranitesindia.com/,Sundeep Gandotra,sgandotra@regattagranitesindia.com,+91 9910066990,GSTIN-123,"Property No -1, Lane No-2, Westend Marg, New Delhi","Property No -1, Lane No-2, Westend Marg, New Delhi",90,Net 30,USD,active,FOB,"Preferred premium monument supplier","Property No -1, Lane No-2, Westend Marg, New Delhi"',
        'North Ridge Stone,,,,contact@northridge.test,+1-555-0100,,"Atlanta, GA","Atlanta, GA",30,Net 15,USD,inactive,,,',
    ]
)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SUPPLIER_EMAIL_MAX_LENGTH = Supplier.__table__.c.email.type.length or 255
SUPPLIER_PHONE_MAX_LENGTH = Supplier.__table__.c.phone.type.length or 255


def _normalize_nullable_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_supplier_name(value: Any) -> str:
    text = str(value or "").strip()
    return text.lower()


def _canonicalize_header(value: str) -> str:
    return IMPORT_HEADER_ALIASES.get(value.strip().lower(), "")


def _parse_supplier_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return "active"
    normalized = value.strip().lower()
    if not normalized:
        return "active"
    if normalized in {"active", "inactive"}:
        return normalized
    return None


def _normalize_supplier_email(value: Optional[str]) -> tuple[Optional[str], bool]:
    if value is None:
        return None, True
    raw = value.strip()
    if not raw:
        return None, True
    parts = [part.strip().strip("'\"") for part in re.split(r"[;,]", raw) if part.strip()]
    if not parts:
        return None, True
    if any(not EMAIL_RE.match(part) for part in parts):
        return raw, False
    return "; ".join(parts), True


def _supplier_csv_format_response() -> schemas.SupplierImportFormatResponse:
    return schemas.SupplierImportFormatResponse(
        delimiter=",",
        has_header=True,
        required_fields=["name"],
        optional_fields=[
            "legal_name",
            "website",
            "contact_name",
            "email",
            "phone",
            "tax_id",
            "remit_to_address",
            "ship_from_address",
            "default_lead_time_days",
            "payment_terms",
            "currency",
            "status",
            "shipping_terms",
            "notes",
            "address",
        ],
        fields=IMPORT_FIELD_SPECS,
        sample_csv=IMPORT_SAMPLE_CSV,
        notes=[
            "Supplier name is required and used as the matching key for update/upsert operations.",
            "Website must be a valid URL including http:// or https://.",
            "Email supports single or multiple addresses separated by semicolon/comma.",
            "Status accepts active or inactive. Blank defaults to active.",
            "Conflict strategy controls whether existing supplier names are created, updated, or both.",
        ],
    )


def _parse_supplier_import_rows(payload: schemas.SupplierImportRequest) -> list[dict[str, Any]]:
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

        if "name" not in header_map:
            raise HTTPException(status_code=400, detail="Missing required CSV header: name")

        rows: list[dict[str, Any]] = []
        for row_number, raw_row in enumerate(reader, start=2):
            rows.append(
                {
                    "row_number": row_number,
                    "name": raw_row.get(header_map.get("name", ""), ""),
                    "legal_name": raw_row.get(header_map.get("legal_name", ""), ""),
                    "website": raw_row.get(header_map.get("website", ""), ""),
                    "contact_name": raw_row.get(header_map.get("contact_name", ""), ""),
                    "email": raw_row.get(header_map.get("email", ""), ""),
                    "phone": raw_row.get(header_map.get("phone", ""), ""),
                    "tax_id": raw_row.get(header_map.get("tax_id", ""), ""),
                    "remit_to_address": raw_row.get(header_map.get("remit_to_address", ""), ""),
                    "ship_from_address": raw_row.get(header_map.get("ship_from_address", ""), ""),
                    "default_lead_time_days": raw_row.get(header_map.get("default_lead_time_days", ""), ""),
                    "payment_terms": raw_row.get(header_map.get("payment_terms", ""), ""),
                    "currency": raw_row.get(header_map.get("currency", ""), ""),
                    "status": raw_row.get(header_map.get("status", ""), ""),
                    "shipping_terms": raw_row.get(header_map.get("shipping_terms", ""), ""),
                    "notes": raw_row.get(header_map.get("notes", ""), ""),
                    "address": raw_row.get(header_map.get("address", ""), ""),
                }
            )
        return rows

    raw_rows = list(csv.reader(StringIO(content)))
    parsed_rows: list[dict[str, Any]] = []
    for row_number, row in enumerate(raw_rows, start=1):
        normalized = [cell.strip() for cell in row]
        if len(normalized) == 12:
            (
                name,
                legal_name,
                website,
                contact_name,
                email,
                phone,
                tax_id,
                remit_to_address,
                ship_from_address,
                default_lead_time_days,
                payment_terms,
                currency,
            ) = normalized
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": name,
                    "legal_name": legal_name,
                    "website": website,
                    "contact_name": contact_name,
                    "email": email,
                    "phone": phone,
                    "tax_id": tax_id,
                    "remit_to_address": remit_to_address,
                    "ship_from_address": ship_from_address,
                    "default_lead_time_days": default_lead_time_days,
                    "payment_terms": payment_terms,
                    "currency": currency,
                    "status": "active",
                    "shipping_terms": "",
                    "notes": "",
                    "address": "",
                }
            )
            continue

        if len(normalized) == 16:
            (
                name,
                legal_name,
                website,
                contact_name,
                email,
                phone,
                tax_id,
                remit_to_address,
                ship_from_address,
                default_lead_time_days,
                payment_terms,
                currency,
                status_value,
                shipping_terms,
                notes,
                address,
            ) = normalized
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": name,
                    "legal_name": legal_name,
                    "website": website,
                    "contact_name": contact_name,
                    "email": email,
                    "phone": phone,
                    "tax_id": tax_id,
                    "remit_to_address": remit_to_address,
                    "ship_from_address": ship_from_address,
                    "default_lead_time_days": default_lead_time_days,
                    "payment_terms": payment_terms,
                    "currency": currency,
                    "status": status_value,
                    "shipping_terms": shipping_terms,
                    "notes": notes,
                    "address": address,
                }
            )
            continue

        parsed_rows.append(
            {
                "row_number": row_number,
                "name": normalized[0] if normalized else "",
                "legal_name": normalized[1] if len(normalized) > 1 else "",
                "website": normalized[2] if len(normalized) > 2 else "",
                "contact_name": normalized[3] if len(normalized) > 3 else "",
                "email": normalized[4] if len(normalized) > 4 else "",
                "phone": normalized[5] if len(normalized) > 5 else "",
                "tax_id": normalized[6] if len(normalized) > 6 else "",
                "remit_to_address": normalized[7] if len(normalized) > 7 else "",
                "ship_from_address": normalized[8] if len(normalized) > 8 else "",
                "default_lead_time_days": normalized[9] if len(normalized) > 9 else "",
                "payment_terms": normalized[10] if len(normalized) > 10 else "",
                "currency": normalized[11] if len(normalized) > 11 else "",
                "status": normalized[12] if len(normalized) > 12 else "",
                "shipping_terms": normalized[13] if len(normalized) > 13 else "",
                "notes": normalized[14] if len(normalized) > 14 else "",
                "address": normalized[15] if len(normalized) > 15 else "",
                "row_error": "No-header imports require either 12 columns (New Supplier fields) or 16 columns (full supplier import contract).",
            }
        )

    return parsed_rows


def _build_supplier_payload(raw_row: dict[str, Any]) -> tuple[Optional[dict[str, Any]], list[str], str]:
    messages: list[str] = []

    if raw_row.get("row_error"):
        messages.append(str(raw_row["row_error"]))

    name = _normalize_nullable_string(raw_row.get("name"))
    if not name:
        messages.append("Supplier name is required.")

    raw_email = _normalize_nullable_string(raw_row.get("email"))
    email, email_valid = _normalize_supplier_email(raw_email)
    if raw_email and not email_valid:
        messages.append("Email must be a valid email address or a semicolon/comma-separated list of valid email addresses.")
    if email and len(email) > SUPPLIER_EMAIL_MAX_LENGTH:
        messages.append(f"Email exceeds max length of {SUPPLIER_EMAIL_MAX_LENGTH} characters.")

    raw_phone = _normalize_nullable_string(raw_row.get("phone"))
    if raw_phone and len(raw_phone) > SUPPLIER_PHONE_MAX_LENGTH:
        messages.append(f"Phone exceeds max length of {SUPPLIER_PHONE_MAX_LENGTH} characters.")

    status_value = _parse_supplier_status(_normalize_nullable_string(raw_row.get("status")))
    if status_value is None:
        messages.append("Status must be active or inactive.")

    lead_time_days_raw = _normalize_nullable_string(raw_row.get("default_lead_time_days"))
    lead_time_days: Optional[int] = None
    if lead_time_days_raw is not None:
        try:
            lead_time_days = int(lead_time_days_raw)
        except ValueError:
            messages.append("Lead time days must be a whole number.")

    payload = {
        "name": name or "",
        "legal_name": _normalize_nullable_string(raw_row.get("legal_name")),
        "website": _normalize_nullable_string(raw_row.get("website")),
        "tax_id": _normalize_nullable_string(raw_row.get("tax_id")),
        "contact_name": _normalize_nullable_string(raw_row.get("contact_name")),
        "email": email,
        "phone": raw_phone,
        "address": _normalize_nullable_string(raw_row.get("address")),
        "remit_to_address": _normalize_nullable_string(raw_row.get("remit_to_address")),
        "ship_from_address": _normalize_nullable_string(raw_row.get("ship_from_address")),
        "status": status_value or "active",
        "default_lead_time_days": lead_time_days,
        "payment_terms": _normalize_nullable_string(raw_row.get("payment_terms")) or "Net 30",
        "currency": (_normalize_nullable_string(raw_row.get("currency")) or "USD").upper(),
        "shipping_terms": _normalize_nullable_string(raw_row.get("shipping_terms")),
        "notes": _normalize_nullable_string(raw_row.get("notes")),
    }

    if not messages:
        try:
            validated = schemas.SupplierCreate(**payload)
            payload = validated.model_dump()
            if payload.get("website") is not None:
                payload["website"] = str(payload["website"])
        except ValidationError as exc:
            for error in exc.errors():
                field = ".".join(str(part) for part in error.get("loc", []))
                messages.append(f"{field}: {error.get('msg', 'invalid value')}")

    return (payload if not messages else None), messages, _normalize_supplier_name(name)


def _analyze_supplier_import(payload: schemas.SupplierImportRequest, db: Session) -> dict[str, Any]:
    parsed_rows = _parse_supplier_import_rows(payload)
    existing_suppliers = db.query(Supplier).order_by(Supplier.id.asc()).all()

    existing_by_key: dict[str, Supplier] = {}
    ambiguous_keys: set[str] = set()
    for supplier in existing_suppliers:
        key = _normalize_supplier_name(supplier.name)
        if not key:
            continue
        if key in existing_by_key:
            ambiguous_keys.add(key)
        else:
            existing_by_key[key] = supplier

    first_seen_by_key: dict[str, int] = {}
    analysis_rows: list[dict[str, Any]] = []

    for raw_row in parsed_rows:
        row_number = int(raw_row["row_number"])
        supplier_payload, messages, match_key = _build_supplier_payload(raw_row)
        display_name = _normalize_nullable_string(raw_row.get("name"))
        display_email = _normalize_nullable_string(raw_row.get("email"))
        display_status_raw = _normalize_nullable_string(raw_row.get("status"))
        parsed_status = _parse_supplier_status(display_status_raw)

        if match_key:
            if match_key in first_seen_by_key:
                messages.append(f"Duplicate supplier name in file. First seen at row {first_seen_by_key[match_key]}.")
            else:
                first_seen_by_key[match_key] = row_number

        if match_key in ambiguous_keys:
            messages.append("Multiple suppliers with this name already exist. Resolve duplicates before using UPDATE/UPSERT.")

        existing_supplier = existing_by_key.get(match_key) if match_key and match_key not in ambiguous_keys else None
        action = "ERROR"
        if not messages:
            exists = existing_supplier is not None
            if exists and payload.conflict_strategy == "CREATE_ONLY":
                messages.append("Supplier already exists and conflict strategy is CREATE_ONLY.")
            elif not exists and payload.conflict_strategy == "UPDATE_EXISTING":
                messages.append("Supplier does not exist and conflict strategy is UPDATE_EXISTING.")
            else:
                action = "UPDATE" if exists else "CREATE"

        analysis_rows.append(
            {
                "row_number": row_number,
                "name": supplier_payload["name"] if supplier_payload else display_name,
                "email": supplier_payload["email"] if supplier_payload else display_email,
                "status_value": supplier_payload["status"] if supplier_payload else (parsed_status or "active"),
                "action": action,
                "status": "ERROR" if messages else "VALID",
                "messages": messages,
                "payload": supplier_payload,
                "match_key": match_key,
                "existing_supplier": existing_supplier,
            }
        )

    summary = schemas.SupplierImportSummary(
        total_rows=len(analysis_rows),
        valid_rows=sum(1 for row in analysis_rows if row["status"] == "VALID"),
        error_rows=sum(1 for row in analysis_rows if row["status"] == "ERROR"),
        create_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "CREATE"),
        update_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "UPDATE"),
        skip_count=sum(1 for row in analysis_rows if row["action"] == "SKIP"),
    )

    response_rows = [
        schemas.SupplierImportRowResult(
            row_number=row["row_number"],
            name=row["name"],
            email=row["email"],
            status_value=row["status_value"],
            action=row["action"],
            status=row["status"],
            messages=row["messages"],
        )
        for row in analysis_rows
    ]

    return {
        "summary": summary,
        "rows": response_rows,
        "analysis_rows": analysis_rows,
    }

def _safe_supplier_import_flush(db: Session, row_number: int) -> None:
    try:
        db.flush()
    except DataError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=(
                f"Import failed at row {row_number}: one or more field values exceed current database limits. "
                "Run latest migrations or shorten long email/phone values."
            ),
        ) from None


@router.get("/suppliers", response_model=List[schemas.SupplierResponse])
def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: Optional[str] = None,
    queue: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Supplier)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            Supplier.name.ilike(like)
            | Supplier.legal_name.ilike(like)
            | Supplier.email.ilike(like)
            | Supplier.phone.ilike(like)
        )

    if queue == "active":
        query = query.filter(Supplier.status == "active")
    elif queue == "inactive":
        query = query.filter(Supplier.status == "inactive")
    elif queue == "missing_catalog":
        query = query.filter(~Supplier.supplier_items.any())
    elif queue == "needs_attention":
        query = query.filter(
            (Supplier.email.is_(None)) | (Supplier.phone.is_(None)) | (Supplier.remit_to_address.is_(None))
        )
    elif queue == "high_lead_time":
        query = query.filter(Supplier.default_lead_time_days.isnot(None), Supplier.default_lead_time_days > 30)

    return query.order_by(Supplier.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()


@router.get("/suppliers/summary", response_model=schemas.SupplierSummaryResponse)
def suppliers_summary(range: str = Query("YTD"), db: Session = Depends(get_db)):
    del range
    active = db.query(func.count(Supplier.id)).filter(Supplier.status == "active").scalar() or 0
    suppliers_with_open_pos = (
        db.query(func.count(func.distinct(PurchaseOrder.supplier_id)))
        .filter(PurchaseOrder.status.in_(["DRAFT", "SENT"]))
        .scalar()
        or 0
    )
    average_lead_time = db.query(func.avg(Supplier.default_lead_time_days)).scalar() or 0

    total_items = db.query(func.count(Item.id)).scalar() or 0
    mapped_items = db.query(func.count(func.distinct(SupplierItem.item_id))).filter(SupplierItem.is_active.is_(True)).scalar() or 0
    coverage = (mapped_items / total_items * 100) if total_items else 0

    return schemas.SupplierSummaryResponse(
        active_suppliers=int(active),
        suppliers_with_open_pos=int(suppliers_with_open_pos),
        average_lead_time_days=float(average_lead_time or 0),
        on_time_delivery_percent=0,
        catalog_coverage_percent=round(coverage, 2),
    )


@router.post("/suppliers", response_model=schemas.SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data.get("website") is not None:
        data["website"] = str(data["website"])
    supplier = Supplier(**data)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/suppliers/import-format", response_model=schemas.SupplierImportFormatResponse)
def get_supplier_import_format():
    return _supplier_csv_format_response()


@router.post("/suppliers/import-preview", response_model=schemas.SupplierImportResponse)
def preview_supplier_import(payload: schemas.SupplierImportRequest, db: Session = Depends(get_db)):
    analysis = _analyze_supplier_import(payload, db)
    return schemas.SupplierImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_suppliers=[])


@router.post("/suppliers/import", response_model=schemas.SupplierImportResponse, status_code=status.HTTP_201_CREATED)
@router.post("/suppliers/bulk-import", response_model=schemas.SupplierImportResponse, status_code=status.HTTP_201_CREATED)
def import_suppliers(payload: schemas.SupplierImportRequest, db: Session = Depends(get_db)):
    analysis = _analyze_supplier_import(payload, db)
    if analysis["summary"].error_rows > 0:
        raise HTTPException(status_code=400, detail="Import preview contains errors. Resolve validation issues before importing.")

    imported_suppliers: list[schemas.SupplierImportSupplierResult] = []

    for row in analysis["analysis_rows"]:
        if row["status"] != "VALID":
            continue

        supplier_payload = row["payload"]
        if row["action"] == "CREATE":
            supplier = Supplier(**supplier_payload)
            db.add(supplier)
            _safe_supplier_import_flush(db, row["row_number"])
            imported_suppliers.append(
                schemas.SupplierImportSupplierResult(
                    id=supplier.id,
                    name=supplier.name,
                    action="CREATED",
                )
            )
            continue

        if row["action"] == "UPDATE":
            supplier = row["existing_supplier"]
            if supplier is None:
                raise HTTPException(status_code=400, detail="Supplier matching key could not be resolved during import.")
            for key, value in supplier_payload.items():
                setattr(supplier, key, value)
            _safe_supplier_import_flush(db, row["row_number"])
            imported_suppliers.append(
                schemas.SupplierImportSupplierResult(
                    id=supplier.id,
                    name=supplier.name,
                    action="UPDATED",
                )
            )

    try:
        db.commit()
    except DataError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Supplier import failed because one or more values exceed current database limits.",
        ) from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier import failed due to a constraint conflict.") from None

    return schemas.SupplierImportResponse(
        summary=analysis["summary"],
        rows=analysis["rows"],
        imported_suppliers=imported_suppliers,
    )

@router.get("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def update_supplier(supplier_id: int, payload: schemas.SupplierUpdate, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "website" in updates and updates["website"] is not None:
        updates["website"] = str(updates["website"])
    for key, value in updates.items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.patch("/suppliers/{supplier_id}/status", response_model=schemas.SupplierResponse)
def patch_supplier_status(supplier_id: int, payload: schemas.SupplierStatusPatch, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    supplier.status = payload.status
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}", response_model=schemas.SupplierResponse)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    has_dependencies = (
        db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == supplier_id).first() is not None
        or db.query(InvoiceLine.id).filter(InvoiceLine.supplier_id == supplier_id).first() is not None
        or db.query(PurchaseOrderSendLog.id).filter(PurchaseOrderSendLog.supplier_id == supplier_id).first() is not None
    )
    if has_dependencies:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete supplier because it is referenced by purchase orders/items. Remove associations first.",
        )

    try:
        db.delete(supplier)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete supplier because it is referenced by purchase orders/items. Remove associations first.",
        ) from None

    return supplier


@router.get("/items/{item_id}/suppliers", response_model=List[schemas.SupplierItemResponse])
def list_item_suppliers(item_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(Item)
        .options(selectinload(Item.supplier_items).selectinload(SupplierItem.supplier))
        .filter(Item.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return [
        schemas.SupplierItemResponse(
            supplier_id=link.supplier_id,
            item_id=link.item_id,
            supplier_name=link.supplier.name,
            supplier_cost=link.supplier_cost,
            freight_cost=link.freight_cost,
            tariff_cost=link.tariff_cost,
            default_unit_cost=link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost,
            landed_cost=link.landed_cost,
            is_preferred=link.is_preferred,
            supplier_sku=link.supplier_sku,
            lead_time_days=link.lead_time_days,
            min_order_qty=_as_optional_decimal(link.min_order_qty),
            notes=link.notes,
            is_active=link.is_active,
        )
        for link in item.supplier_items
    ]


@router.post("/items/{item_id}/suppliers", response_model=schemas.SupplierItemResponse, status_code=status.HTTP_201_CREATED)
def create_item_supplier(item_id: int, payload: schemas.SupplierItemCreate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    existing = db.query(SupplierItem).filter(SupplierItem.item_id == item_id, SupplierItem.supplier_id == payload.supplier_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Supplier already linked to item.")

    link = SupplierItem(item=item, supplier_id=payload.supplier_id, **payload.model_dump(exclude={"supplier_id"}))
    payload_fields = payload.model_fields_set
    if "supplier_cost" not in payload_fields and "default_unit_cost" not in payload_fields:
        link.supplier_cost = item.unit_price
        link.default_unit_cost = item.unit_price
    elif link.default_unit_cost is None:
        link.default_unit_cost = link.supplier_cost
    link.supplier_cost = _as_decimal(link.supplier_cost)
    link.freight_cost = _as_decimal(link.freight_cost)
    link.tariff_cost = _as_decimal(link.tariff_cost)
    if link.default_unit_cost is not None:
        link.default_unit_cost = _as_decimal(link.default_unit_cost)
    if link.min_order_qty is not None:
        link.min_order_qty = _as_decimal(link.min_order_qty)
    db.add(link)
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, item, payload.supplier_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier already linked to item.") from None
    db.refresh(link)
    return schemas.SupplierItemResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        supplier_name=link.supplier.name,
        supplier_cost=_as_decimal(link.supplier_cost),
        freight_cost=_as_decimal(link.freight_cost),
        tariff_cost=_as_decimal(link.tariff_cost),
        default_unit_cost=_as_decimal(link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost),
        landed_cost=_as_decimal(link.landed_cost),
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=_as_optional_decimal(link.min_order_qty),
        notes=link.notes,
        is_active=link.is_active,
    )


@router.patch("/items/{item_id}/suppliers/{supplier_id}", response_model=schemas.SupplierItemResponse)
@router.put("/items/{item_id}/suppliers/{supplier_id}", response_model=schemas.SupplierItemResponse)
def update_item_supplier(item_id: int, supplier_id: int, payload: schemas.SupplierItemUpdate, db: Session = Depends(get_db)):
    link = get_supplier_link(db, item_id, supplier_id)
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, key, value)

    if link.default_unit_cost is None:
        link.default_unit_cost = link.supplier_cost
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, link.item, supplier_id)
    db.commit()
    db.refresh(link)

    return schemas.SupplierItemResponse(
        supplier_id=link.supplier_id,
        item_id=link.item_id,
        supplier_name=link.supplier.name,
        supplier_cost=_as_decimal(link.supplier_cost),
        freight_cost=_as_decimal(link.freight_cost),
        tariff_cost=_as_decimal(link.tariff_cost),
        default_unit_cost=_as_decimal(link.default_unit_cost if link.default_unit_cost is not None else link.supplier_cost),
        landed_cost=_as_decimal(link.landed_cost),
        is_preferred=link.is_preferred,
        supplier_sku=link.supplier_sku,
        lead_time_days=link.lead_time_days,
        min_order_qty=_as_optional_decimal(link.min_order_qty),
        notes=link.notes,
        is_active=link.is_active,
    )

@router.get("/suppliers/{supplier_id}/items", response_model=List[schemas.SupplierItemBySupplierResponse])
def list_supplier_items(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).options(selectinload(Supplier.supplier_items).selectinload(SupplierItem.item)).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return [_serialize_supplier_item(link) for link in supplier.supplier_items]


@router.post("/suppliers/{supplier_id}/items", response_model=List[schemas.SupplierItemBySupplierResponse], status_code=status.HTTP_201_CREATED)
def create_supplier_items(
    supplier_id: int,
    payload: schemas.SupplierItemCreateForSupplier | List[schemas.SupplierItemCreateForSupplier] = Body(...),
    db: Session = Depends(get_db),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    created_links: List[SupplierItem] = []
    entries = payload if isinstance(payload, list) else [payload]
    for entry in entries:
        item = db.query(Item).filter(Item.id == entry.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item not found: {entry.item_id}")
        existing = db.query(SupplierItem).filter(SupplierItem.item_id == entry.item_id, SupplierItem.supplier_id == supplier_id).first()
        if existing:
            continue
        data = entry.model_dump(exclude={"item_id"})
        link = SupplierItem(item_id=entry.item_id, supplier_id=supplier_id, **data)
        entry_fields = entry.model_fields_set
        if "supplier_cost" not in entry_fields and "default_unit_cost" not in entry_fields:
            link.supplier_cost = item.unit_price
            link.default_unit_cost = item.unit_price
        elif link.default_unit_cost is None:
            link.default_unit_cost = link.supplier_cost
        link.supplier_cost = _as_decimal(link.supplier_cost)
        link.freight_cost = _as_decimal(link.freight_cost)
        link.tariff_cost = _as_decimal(link.tariff_cost)
        if link.default_unit_cost is not None:
            link.default_unit_cost = _as_decimal(link.default_unit_cost)
        if link.min_order_qty is not None:
            link.min_order_qty = _as_decimal(link.min_order_qty)
        db.add(link)
        db.flush()
        if entry.is_preferred:
            set_preferred_supplier(db, item, supplier_id)
        created_links.append(link)

    db.commit()
    for link in created_links:
        db.refresh(link)
    return [_serialize_supplier_item(link) for link in created_links]


@router.patch("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=schemas.SupplierItemBySupplierResponse)
@router.put("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=schemas.SupplierItemBySupplierResponse)
def update_supplier_item(
    supplier_id: int,
    supplier_item_id: int,
    payload: schemas.SupplierItemUpdate,
    db: Session = Depends(get_db),
):
    link = db.query(SupplierItem).options(selectinload(SupplierItem.item)).filter((SupplierItem.id == supplier_item_id) | (SupplierItem.item_id == supplier_item_id), SupplierItem.supplier_id == supplier_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(link, key, value)
    if link.default_unit_cost is None:
        link.default_unit_cost = link.supplier_cost
    db.flush()
    if payload.is_preferred:
        set_preferred_supplier(db, link.item, supplier_id)
    db.commit()
    db.refresh(link)
    return _serialize_supplier_item(link)


@router.delete("/suppliers/{supplier_id}/items/{supplier_item_id}", response_model=dict)
def delete_supplier_item(supplier_id: int, supplier_item_id: int, db: Session = Depends(get_db)):
    link = db.query(SupplierItem).filter((SupplierItem.id == supplier_item_id) | (SupplierItem.item_id == supplier_item_id), SupplierItem.supplier_id == supplier_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Supplier link not found.")
    db.delete(link)
    db.commit()
    return {"status": "ok"}
