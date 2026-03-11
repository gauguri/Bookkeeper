import csv
import re
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.models import Item
from app.module_keys import ModuleKey
from app.sales import schemas as sales_schemas

router = APIRouter(
    prefix="/api",
    tags=["items-import"],
    dependencies=[Depends(require_module(ModuleKey.ITEMS.value))],
)


class ItemImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    accepted_values: list[str] = Field(default_factory=list)
    example: Optional[str] = None


class ItemImportFormatResponse(BaseModel):
    delimiter: str
    has_header: bool
    required_fields: list[str]
    optional_fields: list[str]
    fields: list[ItemImportFieldSpec]
    sample_csv: str
    notes: list[str]


class ItemImportRequest(BaseModel):
    csv_data: str
    has_header: bool = True
    conflict_strategy: Literal["CREATE_ONLY", "UPDATE_EXISTING", "UPSERT"] = "UPSERT"


class ItemImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int


class ItemImportRowResult(BaseModel):
    row_number: int
    name: Optional[str] = None
    sku: Optional[str] = None
    unit_price: Optional[Decimal] = None
    action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
    status: Literal["VALID", "ERROR"]
    messages: list[str]


class ItemImportItemResult(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    action: Literal["CREATED", "UPDATED"]


class ItemImportResponse(BaseModel):
    summary: ItemImportSummary
    rows: list[ItemImportRowResult]
    imported_items: list[ItemImportItemResult]


IMPORT_HEADER_ALIASES = {
    "name": "name",
    "item": "name",
    "item name": "name",
    "item_name": "name",
    "product": "name",
    "product name": "name",
    "product_name": "name",
    "sku": "sku",
    "skew": "sku",
    "description": "description",
    "unit price": "unit_price",
    "unit_price": "unit_price",
    "list price": "unit_price",
    "list_price": "unit_price",
    "price": "unit_price",
    "income account id": "income_account_id",
    "income_account_id": "income_account_id",
    "income account": "income_account_id",
    "active": "is_active",
    "is_active": "is_active",
    "status": "is_active",
}

IMPORT_FIELD_SPECS = [
    ItemImportFieldSpec(field="name", label="Item Name", required=True, description="Product or service name.", example="6 x 2 x 2 Monument"),
    ItemImportFieldSpec(field="unit_price", label="Unit Price", required=True, description="List price per unit.", example="200.00"),
    ItemImportFieldSpec(field="sku", label="SKU", required=False, description="Optional SKU. If blank, SKU is auto-generated from item name prefix.", example="MONU0001"),
    ItemImportFieldSpec(field="description", label="Description", required=False, description="Item description shown in catalog and transactions."),
    ItemImportFieldSpec(field="income_account_id", label="Income Account ID", required=False, description="Revenue account ID used for item sales posting.", example="12"),
    ItemImportFieldSpec(field="is_active", label="Is Active", required=False, description="Item lifecycle status.", accepted_values=["true", "false", "active", "inactive"], example="true"),
]

IMPORT_SAMPLE_CSV = "\n".join(
    [
        "name,sku,description,unit_price,income_account_id,is_active",
        "6 x 2 x 2 Monument,,Premium granite monument,200.00,,true",
        "Garden Bench Monument,GBM0001,Polished custom bench monument,450.00,,true",
    ]
)

TRUE_VALUES = {"true", "1", "yes", "y", "active"}
FALSE_VALUES = {"false", "0", "no", "n", "inactive"}
SKU_SANITIZE_RE = re.compile(r"[^A-Z0-9]+")


def _normalize_nullable_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_item_name(value: Optional[str]) -> str:
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


def _parse_unit_price(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _normalize_sku(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    sku = value.strip().upper()
    return sku or None


def _build_sku_prefix(name: str) -> str:
    cleaned = SKU_SANITIZE_RE.sub("", name.upper())
    if cleaned:
        return cleaned[:4]
    return "ITEM"


def _generate_sku(name: str, reserved_skus: set[str]) -> str:
    prefix = _build_sku_prefix(name)
    for index in range(1, 10000):
        candidate = f"{prefix}{index:04d}"
        candidate_key = candidate.upper()
        if candidate_key not in reserved_skus:
            reserved_skus.add(candidate_key)
            return candidate
    raise HTTPException(status_code=400, detail="Unable to generate a unique SKU for one or more rows.")


def _item_csv_format_response() -> ItemImportFormatResponse:
    return ItemImportFormatResponse(
        delimiter=",",
        has_header=True,
        required_fields=["name", "unit_price"],
        optional_fields=["sku", "description", "income_account_id", "is_active"],
        fields=IMPORT_FIELD_SPECS,
        sample_csv=IMPORT_SAMPLE_CSV,
        notes=[
            "Required fields are name and unit_price.",
            "If sku is blank, the system auto-generates an alphanumeric SKU using the item name prefix.",
            "Conflict strategy controls create/update behavior for existing items.",
            "is_active accepts true/false, yes/no, 1/0, or active/inactive.",
            "No-header imports support either 2 columns (name, unit_price) or 6 columns (full contract).",
        ],
    )


def _parse_item_import_rows(payload: ItemImportRequest) -> list[dict[str, Any]]:
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
        if "unit_price" not in header_map:
            raise HTTPException(status_code=400, detail="Missing required CSV header: unit_price")

        rows: list[dict[str, Any]] = []
        for row_number, raw_row in enumerate(reader, start=2):
            rows.append(
                {
                    "row_number": row_number,
                    "name": raw_row.get(header_map.get("name", ""), ""),
                    "sku": raw_row.get(header_map.get("sku", ""), ""),
                    "description": raw_row.get(header_map.get("description", ""), ""),
                    "unit_price": raw_row.get(header_map.get("unit_price", ""), ""),
                    "income_account_id": raw_row.get(header_map.get("income_account_id", ""), ""),
                    "is_active": raw_row.get(header_map.get("is_active", ""), ""),
                }
            )
        return rows

    raw_rows = list(csv.reader(StringIO(content)))
    parsed_rows: list[dict[str, Any]] = []
    for row_number, row in enumerate(raw_rows, start=1):
        normalized = [cell.strip() for cell in row]

        if len(normalized) == 2:
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": normalized[0],
                    "sku": "",
                    "description": "",
                    "unit_price": normalized[1],
                    "income_account_id": "",
                    "is_active": "true",
                }
            )
            continue

        if len(normalized) == 6:
            parsed_rows.append(
                {
                    "row_number": row_number,
                    "name": normalized[0],
                    "sku": normalized[1],
                    "description": normalized[2],
                    "unit_price": normalized[3],
                    "income_account_id": normalized[4],
                    "is_active": normalized[5],
                }
            )
            continue

        parsed_rows.append(
            {
                "row_number": row_number,
                "name": normalized[0] if len(normalized) > 0 else "",
                "sku": normalized[1] if len(normalized) > 1 else "",
                "description": normalized[2] if len(normalized) > 2 else "",
                "unit_price": normalized[3] if len(normalized) > 3 else "",
                "income_account_id": normalized[4] if len(normalized) > 4 else "",
                "is_active": normalized[5] if len(normalized) > 5 else "",
                "row_error": "No-header imports require either 2 columns (name, unit_price) or 6 columns (name, sku, description, unit_price, income_account_id, is_active).",
            }
        )

    return parsed_rows


def _safe_item_import_flush(db: Session, row_number: int) -> None:
    try:
        db.flush()
    except DataError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Import failed at row {row_number}: one or more values exceed database limits.",
        ) from None


def _analyze_item_import(payload: ItemImportRequest, db: Session) -> dict[str, Any]:
    parsed_rows = _parse_item_import_rows(payload)
    existing_items = db.query(Item).order_by(Item.id.asc()).all()

    existing_by_name: dict[str, Item] = {}
    ambiguous_name_keys: set[str] = set()
    existing_by_sku: dict[str, Item] = {}
    ambiguous_sku_keys: set[str] = set()
    reserved_skus: set[str] = set()

    for item in existing_items:
        name_key = _normalize_item_name(item.name)
        if name_key:
            if name_key in existing_by_name:
                ambiguous_name_keys.add(name_key)
            else:
                existing_by_name[name_key] = item

        if item.sku:
            sku_key = item.sku.upper()
            reserved_skus.add(sku_key)
            if sku_key in existing_by_sku:
                ambiguous_sku_keys.add(sku_key)
            else:
                existing_by_sku[sku_key] = item

    first_seen_name_key: dict[str, int] = {}
    first_seen_sku_key: dict[str, int] = {}
    analysis_rows: list[dict[str, Any]] = []

    for raw_row in parsed_rows:
        row_number = int(raw_row["row_number"])
        messages: list[str] = []

        row_error = raw_row.get("row_error")
        if row_error:
            messages.append(str(row_error))

        name = _normalize_nullable_string(raw_row.get("name"))
        if not name:
            messages.append("Item name is required.")

        unit_price_raw = _normalize_nullable_string(raw_row.get("unit_price"))
        unit_price = _parse_unit_price(unit_price_raw)
        if unit_price_raw is None:
            messages.append("Unit price is required.")
        elif unit_price is None:
            messages.append("Unit price must be a valid decimal number.")
        elif unit_price < 0:
            messages.append("Unit price must be greater than or equal to 0.")

        sku = _normalize_sku(_normalize_nullable_string(raw_row.get("sku")))
        if sku and len(sku) > (Item.__table__.c.sku.type.length or 100):
            messages.append(f"SKU exceeds max length of {Item.__table__.c.sku.type.length or 100} characters.")

        description = _normalize_nullable_string(raw_row.get("description"))

        income_account_raw = _normalize_nullable_string(raw_row.get("income_account_id"))
        income_account_id: Optional[int] = None
        if income_account_raw is not None:
            try:
                income_account_id = int(income_account_raw)
            except ValueError:
                messages.append("Income account ID must be a whole number.")

        is_active_raw = _normalize_nullable_string(raw_row.get("is_active"))
        is_active = _parse_bool(is_active_raw)
        if is_active is None:
            messages.append("is_active must be true/false, yes/no, 1/0, or active/inactive.")

        name_key = _normalize_item_name(name)
        sku_key = sku.upper() if sku else None

        if name_key:
            if name_key in first_seen_name_key:
                messages.append(f"Duplicate item name in file. First seen at row {first_seen_name_key[name_key]}.")
            else:
                first_seen_name_key[name_key] = row_number

        if sku_key:
            if sku_key in first_seen_sku_key:
                messages.append(f"Duplicate SKU in file. First seen at row {first_seen_sku_key[sku_key]}.")
            else:
                first_seen_sku_key[sku_key] = row_number

        if sku_key and sku_key in ambiguous_sku_keys:
            messages.append("Multiple existing items already use this SKU. Resolve duplicates before UPDATE/UPSERT.")
        if name_key and name_key in ambiguous_name_keys:
            messages.append("Multiple existing items already use this name. Resolve duplicates before UPDATE/UPSERT.")

        existing_item: Optional[Item] = None
        if sku_key and sku_key not in ambiguous_sku_keys:
            existing_item = existing_by_sku.get(sku_key)
        if existing_item is None and name_key and name_key not in ambiguous_name_keys:
            existing_item = existing_by_name.get(name_key)

        action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"] = "ERROR"
        item_payload: Optional[dict[str, Any]] = None
        resolved_sku = sku

        if not messages:
            exists = existing_item is not None
            if exists and payload.conflict_strategy == "CREATE_ONLY":
                messages.append("Item already exists and conflict strategy is CREATE_ONLY.")
            elif not exists and payload.conflict_strategy == "UPDATE_EXISTING":
                messages.append("Item does not exist and conflict strategy is UPDATE_EXISTING.")
            else:
                action = "UPDATE" if exists else "CREATE"
                if action == "CREATE":
                    if not resolved_sku:
                        resolved_sku = _generate_sku(name or "ITEM", reserved_skus)
                    else:
                        resolved_sku_key = resolved_sku.upper()
                        if resolved_sku_key in reserved_skus:
                            messages.append("SKU already exists.")
                        else:
                            reserved_skus.add(resolved_sku_key)
                elif action == "UPDATE" and existing_item is not None:
                    if not resolved_sku:
                        resolved_sku = existing_item.sku
                    else:
                        resolved_sku_key = resolved_sku.upper()
                        owner = existing_by_sku.get(resolved_sku_key)
                        if owner is not None and owner.id != existing_item.id:
                            messages.append("SKU belongs to another existing item.")
                        else:
                            reserved_skus.add(resolved_sku_key)

                if not messages:
                    candidate_payload = {
                        "name": name,
                        "sku": resolved_sku,
                        "description": description,
                        "unit_price": unit_price,
                        "income_account_id": income_account_id,
                        "is_active": True if is_active is None else is_active,
                    }
                    try:
                        validated = sales_schemas.ItemCreate(**candidate_payload)
                        item_payload = validated.model_dump()
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
                "sku": resolved_sku,
                "unit_price": unit_price,
                "action": action,
                "status": status_value,
                "messages": messages,
                "payload": item_payload,
                "existing_item": existing_item,
            }
        )

    summary = ItemImportSummary(
        total_rows=len(analysis_rows),
        valid_rows=sum(1 for row in analysis_rows if row["status"] == "VALID"),
        error_rows=sum(1 for row in analysis_rows if row["status"] == "ERROR"),
        create_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "CREATE"),
        update_count=sum(1 for row in analysis_rows if row["status"] == "VALID" and row["action"] == "UPDATE"),
        skip_count=sum(1 for row in analysis_rows if row["action"] == "SKIP"),
    )

    rows = [
        ItemImportRowResult(
            row_number=row["row_number"],
            name=row["name"],
            sku=row["sku"],
            unit_price=row["unit_price"],
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


@router.get("/items/import-format", response_model=ItemImportFormatResponse)
def get_item_import_format() -> ItemImportFormatResponse:
    return _item_csv_format_response()


@router.post("/items/import-preview", response_model=ItemImportResponse)
def preview_item_import(payload: ItemImportRequest, db: Session = Depends(get_db)) -> ItemImportResponse:
    analysis = _analyze_item_import(payload, db)
    return ItemImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_items=[])


@router.post("/items/import", response_model=ItemImportResponse, status_code=status.HTTP_201_CREATED)
@router.post("/items/bulk-import", response_model=ItemImportResponse, status_code=status.HTTP_201_CREATED)
def import_items(payload: ItemImportRequest, db: Session = Depends(get_db)) -> ItemImportResponse:
    analysis = _analyze_item_import(payload, db)
    if analysis["summary"].error_rows > 0:
        raise HTTPException(status_code=400, detail="Import preview contains errors. Resolve validation issues before importing.")

    imported_items: list[ItemImportItemResult] = []

    for row in analysis["analysis_rows"]:
        if row["status"] != "VALID":
            continue

        item_payload = row["payload"]
        if row["action"] == "CREATE":
            item = Item(**item_payload)
            db.add(item)
            _safe_item_import_flush(db, row["row_number"])
            imported_items.append(ItemImportItemResult(id=item.id, name=item.name, sku=item.sku, action="CREATED"))
            continue

        if row["action"] == "UPDATE":
            item = row["existing_item"]
            if item is None:
                raise HTTPException(status_code=400, detail="Item matching key could not be resolved during import.")
            for key, value in item_payload.items():
                setattr(item, key, value)
            _safe_item_import_flush(db, row["row_number"])
            imported_items.append(ItemImportItemResult(id=item.id, name=item.name, sku=item.sku, action="UPDATED"))

    try:
        db.commit()
    except DataError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Item import failed because one or more values exceed database limits.") from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Item import failed due to a constraint conflict.") from None

    return ItemImportResponse(summary=analysis["summary"], rows=analysis["rows"], imported_items=imported_items)

