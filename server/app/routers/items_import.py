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
from app.models import Inventory, Item
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
    item_code: Optional[str] = None
    name: Optional[str] = None
    sku: Optional[str] = None
    quantity: Optional[Decimal] = None
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
    "item code": "item_code",
    "item_code": "item_code",
    "color": "color",
    "type": "monument_type",
    "lr (ft)": "lr_feet",
    "lr_ft": "lr_feet",
    "lr (in.)": "lr_inches",
    "lr_in": "lr_inches",
    "fb (ft)": "fb_feet",
    "fb_ft": "fb_feet",
    "fb (in.)": "fb_inches",
    "fb_in": "fb_inches",
    "tb (ft)": "tb_feet",
    "tb_ft": "tb_feet",
    "tb (in.)": "tb_inches",
    "tb_in": "tb_inches",
    "shape": "shape",
    "finish": "finish",
    "category": "category",
    "quantity": "quantity",
    "sell price": "unit_price",
    "sell_price": "unit_price",
    "unit price": "unit_price",
    "price": "unit_price",
    "item description": "description",
    "description": "description",
    "sales description": "sales_description",
    "purchase description": "purchase_description",
    "cost price": "cost_price",
    "weight(lbs)": "weight_lbs",
    "weight (lbs)": "weight_lbs",
    "location": "location",
    "peachid": "peach_id",
    "peach id": "peach_id",
    "newcode": "new_code",
    "new code": "new_code",
    "reorder qty": "reorder_point",
    "re-order qty": "reorder_point",
    "exclude from price list": "exclude_from_price_list",
    "uploadtopeach": "upload_to_peach",
    "upload to peach": "upload_to_peach",
    "itemtype": "item_type",
    "item type": "item_type",
    "inventorycheck": "inventory_check",
    "inventory check": "inventory_check",
}

IMPORT_FIELD_SPECS = [
    ItemImportFieldSpec(field="item_code", label="Item Code", required=True, description="Primary item code from Glenrock inventory.", example="12480"),
    ItemImportFieldSpec(field="color", label="Color", required=False, description="Stone color.", example="GREY"),
    ItemImportFieldSpec(field="monument_type", label="Type", required=False, description="Monument type classification.", example="MARKER"),
    ItemImportFieldSpec(field="lr_feet", label="LR (ft)", required=False, description="Length-right feet component.", example="3"),
    ItemImportFieldSpec(field="lr_inches", label="LR (in.)", required=False, description="Length-right inches component.", example="0"),
    ItemImportFieldSpec(field="fb_feet", label="FB (ft)", required=False, description="Front-back feet component.", example="1"),
    ItemImportFieldSpec(field="fb_inches", label="FB (in.)", required=False, description="Front-back inches component.", example="0"),
    ItemImportFieldSpec(field="tb_feet", label="TB (ft)", required=False, description="Top-bottom feet component.", example="0"),
    ItemImportFieldSpec(field="tb_inches", label="TB (in.)", required=False, description="Top-bottom inches component.", example="2"),
    ItemImportFieldSpec(field="shape", label="Shape", required=False, description="Monument shape.", example="FLAT"),
    ItemImportFieldSpec(field="finish", label="Finish", required=False, description="Finish treatment.", example="ALL POL"),
    ItemImportFieldSpec(field="category", label="Category", required=False, description="Category or quality tier.", example="DELUXE"),
    ItemImportFieldSpec(field="quantity", label="Quantity", required=True, description="Current on-hand quantity imported into inventory.", example="35"),
    ItemImportFieldSpec(field="unit_price", label="Sell Price", required=False, description="Selling price used as the item list price.", example="83.00"),
    ItemImportFieldSpec(field="description", label="Item Description", required=False, description="Primary item description shown in the item profile."),
    ItemImportFieldSpec(field="sales_description", label="Sales Description", required=False, description="Sales-facing description."),
    ItemImportFieldSpec(field="purchase_description", label="Purchase Description", required=False, description="Purchasing-facing description."),
    ItemImportFieldSpec(field="cost_price", label="Cost Price", required=False, description="Current cost per unit.", example="23.00"),
    ItemImportFieldSpec(field="weight_lbs", label="Weight (lbs)", required=False, description="Unit weight in pounds.", example="96"),
    ItemImportFieldSpec(field="location", label="Location", required=False, description="Yard or warehouse location."),
    ItemImportFieldSpec(field="peach_id", label="PeachID", required=False, description="External Peach identifier."),
    ItemImportFieldSpec(field="new_code", label="NewCode", required=False, description="Secondary or migrated code."),
    ItemImportFieldSpec(field="reorder_point", label="ReOrder Qty", required=False, description="Reorder threshold quantity.", example="3"),
    ItemImportFieldSpec(field="exclude_from_price_list", label="Exclude From Price List", required=False, description="Whether to omit from pricing exports.", accepted_values=["true", "false"]),
    ItemImportFieldSpec(field="upload_to_peach", label="UploadtoPeach", required=False, description="Whether the item should sync to Peach.", accepted_values=["true", "false"]),
    ItemImportFieldSpec(field="item_type", label="ItemType", required=False, description="External item type classification."),
    ItemImportFieldSpec(field="inventory_check", label="InventoryCheck", required=False, description="Whether the item should participate in inventory checks.", accepted_values=["true", "false"]),
]

IMPORT_SAMPLE_CSV = "\n".join(
    [
        "Item Code,Color,Type,LR (ft),LR (in.),FB (ft),FB (in.),TB (ft),TB (in.),Shape,Finish,Category,Quantity,Sell Price,Item Description,Sales Description,Purchase Description,Cost Price,Weight(lbs),Location,PeachID,NewCode,ReOrder Qty,Exclude From Price List,UploadtoPeach,ItemType,InventoryCheck",
        "12480,GREY,MARKER,3,0,1,0,0,2,FLAT,ALL POL,DELUXE,35,83.00,SELECT GREY MARKER: 3-0X1-0X0-2 POL TOP/ SAWN SIDES,SELECT GREY MARKER: 3-0X1-0X0-2 POL TOP/ SAWN SIDES,SHANDONG GREY MARKER: 3-0X1-0X0-2 POL TOP/ SAWN SIDES,23.00,96,YARD-A,,12480,5,false,false,MONUMENT,false",
        "2035,BLACK,DIE,1,1,1,1,1,1,SPECIAL,ALL POL,DELUXE,30,25.00,REPLICA,REPLICA,REPLICA,5.00,4,SHOWROOM,REPLICAS,,3,true,true,SAMPLE,false",
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
        return Decimal(text.replace("$", "").replace(",", ""))
    except InvalidOperation:
        return None


def _parse_decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return Decimal(text.replace("$", "").replace(",", ""))
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
        required_fields=["item_code", "quantity"],
        optional_fields=[
            "color", "monument_type", "lr_feet", "lr_inches", "fb_feet", "fb_inches", "tb_feet", "tb_inches",
            "shape", "finish", "category", "unit_price", "description", "sales_description", "purchase_description",
            "cost_price", "weight_lbs", "location", "peach_id", "new_code", "reorder_point",
            "exclude_from_price_list", "upload_to_peach", "item_type", "inventory_check",
        ],
        fields=IMPORT_FIELD_SPECS,
        sample_csv=IMPORT_SAMPLE_CSV,
        notes=[
            "The Glenrock inventory template is header-based and maps directly to monument item master fields.",
            "Required fields are item_code and quantity. Sell Price defaults to 0.00 when blank.",
            "Item Code is stored as both item_code and sku so existing catalog flows continue to work.",
            "Quantity updates both the item on-hand quantity and the backing inventory record.",
            "Boolean fields accept true/false, yes/no, y/n, or 1/0.",
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

        if "item_code" not in header_map:
            raise HTTPException(status_code=400, detail="Missing required CSV header: Item Code")
        if "quantity" not in header_map:
            raise HTTPException(status_code=400, detail="Missing required CSV header: Quantity")

        rows: list[dict[str, Any]] = []
        for row_number, raw_row in enumerate(reader, start=2):
            parsed_row: dict[str, Any] = {"row_number": row_number}
            for canonical_field in [spec.field for spec in IMPORT_FIELD_SPECS]:
                parsed_row[canonical_field] = raw_row.get(header_map.get(canonical_field, ""), "")
            rows.append(parsed_row)
        return rows

    raw_rows = list(csv.reader(StringIO(content)))
    parsed_rows: list[dict[str, Any]] = []
    ordered_fields = [spec.field for spec in IMPORT_FIELD_SPECS]
    for row_number, row in enumerate(raw_rows, start=1):
        normalized = [cell.strip() for cell in row]
        parsed_row = {"row_number": row_number}
        for index, field in enumerate(ordered_fields):
            parsed_row[field] = normalized[index] if len(normalized) > index else ""
        if len(normalized) != len(ordered_fields):
            parsed_row["row_error"] = f"No-header imports require exactly {len(ordered_fields)} columns in the Glenrock item order."
        parsed_rows.append(parsed_row)

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

    existing_by_code: dict[str, Item] = {}
    ambiguous_code_keys: set[str] = set()
    existing_by_sku: dict[str, Item] = {}
    ambiguous_sku_keys: set[str] = set()
    reserved_skus: set[str] = set()

    for item in existing_items:
        item_code_key = _normalize_nullable_string(item.item_code)
        if item_code_key:
            normalized_code = item_code_key.upper()
            if normalized_code in existing_by_code:
                ambiguous_code_keys.add(normalized_code)
            else:
                existing_by_code[normalized_code] = item

        if item.sku:
            sku_key = item.sku.upper()
            reserved_skus.add(sku_key)
            if sku_key in existing_by_sku:
                ambiguous_sku_keys.add(sku_key)
            else:
                existing_by_sku[sku_key] = item

    first_seen_code_key: dict[str, int] = {}
    first_seen_sku_key: dict[str, int] = {}
    analysis_rows: list[dict[str, Any]] = []

    for raw_row in parsed_rows:
        row_number = int(raw_row["row_number"])
        messages: list[str] = []

        row_error = raw_row.get("row_error")
        if row_error:
            messages.append(str(row_error))

        item_code = _normalize_nullable_string(raw_row.get("item_code"))
        if not item_code:
            messages.append("Item Code is required.")

        quantity_raw = _normalize_nullable_string(raw_row.get("quantity"))
        quantity = _parse_decimal(quantity_raw)
        if quantity_raw is None:
            messages.append("Quantity is required.")
        elif quantity is None:
            messages.append("Quantity must be a valid decimal number.")
        elif quantity < 0:
            messages.append("Quantity must be greater than or equal to 0.")

        unit_price_raw = _normalize_nullable_string(raw_row.get("unit_price"))
        unit_price = Decimal("0.00") if unit_price_raw is None else _parse_unit_price(unit_price_raw)
        if unit_price_raw is not None and unit_price is None:
            messages.append("Sell Price must be a valid decimal number.")
        elif unit_price is not None and unit_price < 0:
            messages.append("Sell Price must be greater than or equal to 0.")

        sku = _normalize_sku(item_code)
        if sku and len(sku) > (Item.__table__.c.sku.type.length or 100):
            messages.append(f"SKU exceeds max length of {Item.__table__.c.sku.type.length or 100} characters.")

        description = _normalize_nullable_string(raw_row.get("description"))
        sales_description = _normalize_nullable_string(raw_row.get("sales_description"))
        purchase_description = _normalize_nullable_string(raw_row.get("purchase_description"))
        color = _normalize_nullable_string(raw_row.get("color"))
        monument_type = _normalize_nullable_string(raw_row.get("monument_type"))
        shape = _normalize_nullable_string(raw_row.get("shape"))
        finish = _normalize_nullable_string(raw_row.get("finish"))
        category = _normalize_nullable_string(raw_row.get("category"))
        location = _normalize_nullable_string(raw_row.get("location"))
        peach_id = _normalize_nullable_string(raw_row.get("peach_id"))
        new_code = _normalize_nullable_string(raw_row.get("new_code"))
        item_type = _normalize_nullable_string(raw_row.get("item_type"))

        dimension_fields = {
            "LR (ft)": _parse_decimal(_normalize_nullable_string(raw_row.get("lr_feet"))),
            "LR (in.)": _parse_decimal(_normalize_nullable_string(raw_row.get("lr_inches"))),
            "FB (ft)": _parse_decimal(_normalize_nullable_string(raw_row.get("fb_feet"))),
            "FB (in.)": _parse_decimal(_normalize_nullable_string(raw_row.get("fb_inches"))),
            "TB (ft)": _parse_decimal(_normalize_nullable_string(raw_row.get("tb_feet"))),
            "TB (in.)": _parse_decimal(_normalize_nullable_string(raw_row.get("tb_inches"))),
        }
        for label, value in dimension_fields.items():
            raw_value = _normalize_nullable_string(raw_row.get(
                {
                    "LR (ft)": "lr_feet",
                    "LR (in.)": "lr_inches",
                    "FB (ft)": "fb_feet",
                    "FB (in.)": "fb_inches",
                    "TB (ft)": "tb_feet",
                    "TB (in.)": "tb_inches",
                }[label]
            ))
            if raw_value is not None and value is None:
                messages.append(f"{label} must be a valid decimal number.")

        cost_price_raw = _normalize_nullable_string(raw_row.get("cost_price"))
        cost_price = _parse_decimal(cost_price_raw)
        if cost_price_raw is not None and cost_price is None:
            messages.append("Cost Price must be a valid decimal number.")
        elif cost_price is not None and cost_price < 0:
            messages.append("Cost Price must be greater than or equal to 0.")

        weight_raw = _normalize_nullable_string(raw_row.get("weight_lbs"))
        weight_lbs = _parse_decimal(weight_raw)
        if weight_raw is not None and weight_lbs is None:
            messages.append("Weight(lbs) must be a valid decimal number.")
        elif weight_lbs is not None and weight_lbs < 0:
            messages.append("Weight(lbs) must be greater than or equal to 0.")

        reorder_raw = _normalize_nullable_string(raw_row.get("reorder_point"))
        reorder_point = _parse_decimal(reorder_raw)
        if reorder_raw is not None and reorder_point is None:
            messages.append("ReOrder Qty must be a valid decimal number.")
        elif reorder_point is not None and reorder_point < 0:
            messages.append("ReOrder Qty must be greater than or equal to 0.")

        exclude_from_price_list = _parse_bool(_normalize_nullable_string(raw_row.get("exclude_from_price_list")))
        upload_to_peach = _parse_bool(_normalize_nullable_string(raw_row.get("upload_to_peach")))
        inventory_check = _parse_bool(_normalize_nullable_string(raw_row.get("inventory_check")))
        for label, value in {
            "Exclude From Price List": exclude_from_price_list,
            "UploadtoPeach": upload_to_peach,
            "InventoryCheck": inventory_check,
        }.items():
            raw_value = _normalize_nullable_string(raw_row.get(
                {
                    "Exclude From Price List": "exclude_from_price_list",
                    "UploadtoPeach": "upload_to_peach",
                    "InventoryCheck": "inventory_check",
                }[label]
            ))
            if raw_value is not None and value is None:
                messages.append(f"{label} must be true/false, yes/no, or 1/0.")

        name = (sales_description or description or purchase_description or item_code or "Unnamed Item").strip()[:200]
        item_code_key = item_code.upper() if item_code else None
        sku_key = sku.upper() if sku else None

        if item_code_key:
            if item_code_key in first_seen_code_key:
                messages.append(f"Duplicate Item Code in file. First seen at row {first_seen_code_key[item_code_key]}.")
            else:
                first_seen_code_key[item_code_key] = row_number

        if sku_key:
            if sku_key in first_seen_sku_key:
                messages.append(f"Duplicate SKU in file. First seen at row {first_seen_sku_key[sku_key]}.")
            else:
                first_seen_sku_key[sku_key] = row_number

        if sku_key and sku_key in ambiguous_sku_keys:
            messages.append("Multiple existing items already use this SKU. Resolve duplicates before UPDATE/UPSERT.")
        if item_code_key and item_code_key in ambiguous_code_keys:
            messages.append("Multiple existing items already use this Item Code. Resolve duplicates before UPDATE/UPSERT.")

        existing_item: Optional[Item] = None
        if item_code_key and item_code_key not in ambiguous_code_keys:
            existing_item = existing_by_code.get(item_code_key)
        if sku_key and sku_key not in ambiguous_sku_keys:
            existing_item = existing_item or existing_by_sku.get(sku_key)

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
                    resolved_sku_key = resolved_sku.upper() if resolved_sku else None
                    if not resolved_sku_key:
                        messages.append("Item Code is required to create a SKU.")
                    elif resolved_sku_key in reserved_skus:
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
                        "item_code": item_code,
                        "sku": resolved_sku,
                        "name": name,
                        "color": color,
                        "monument_type": monument_type,
                        "lr_feet": dimension_fields["LR (ft)"],
                        "lr_inches": dimension_fields["LR (in.)"],
                        "fb_feet": dimension_fields["FB (ft)"],
                        "fb_inches": dimension_fields["FB (in.)"],
                        "tb_feet": dimension_fields["TB (ft)"],
                        "tb_inches": dimension_fields["TB (in.)"],
                        "shape": shape,
                        "finish": finish,
                        "category": category,
                        "description": description,
                        "sales_description": sales_description,
                        "purchase_description": purchase_description,
                        "unit_price": unit_price or Decimal("0.00"),
                        "cost_price": cost_price,
                        "weight_lbs": weight_lbs,
                        "location": location,
                        "peach_id": peach_id,
                        "new_code": new_code,
                        "exclude_from_price_list": bool(exclude_from_price_list) if exclude_from_price_list is not None else False,
                        "upload_to_peach": bool(upload_to_peach) if upload_to_peach is not None else False,
                        "item_type": item_type,
                        "inventory_check": bool(inventory_check) if inventory_check is not None else False,
                        "income_account_id": existing_item.income_account_id if existing_item is not None else None,
                        "is_active": True,
                    }
                    try:
                        validated = sales_schemas.ItemCreate(**candidate_payload)
                        item_payload = validated.model_dump()
                        item_payload["on_hand_qty"] = quantity or Decimal("0")
                        item_payload["reorder_point"] = reorder_point
                        item_payload["quantity"] = quantity or Decimal("0")
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
                "item_code": item_code,
                "name": name,
                "sku": resolved_sku,
                "quantity": quantity,
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
            item_code=row["item_code"],
            name=row["name"],
            sku=row["sku"],
            quantity=row["quantity"],
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
        quantity = Decimal(item_payload.pop("quantity", 0))
        cost_price = Decimal(item_payload.get("cost_price") or 0)
        if row["action"] == "CREATE":
            item = Item(**item_payload)
            db.add(item)
            _safe_item_import_flush(db, row["row_number"])
            inventory = db.query(Inventory).filter(Inventory.item_id == item.id).first()
            if inventory is None:
                inventory = Inventory(item_id=item.id, quantity_on_hand=quantity, landed_unit_cost=cost_price, total_value=quantity * cost_price)
                db.add(inventory)
            else:
                inventory.quantity_on_hand = quantity
                inventory.landed_unit_cost = cost_price
                inventory.total_value = quantity * cost_price
            imported_items.append(ItemImportItemResult(id=item.id, name=item.name, sku=item.sku, action="CREATED"))
            continue

        if row["action"] == "UPDATE":
            item = row["existing_item"]
            if item is None:
                raise HTTPException(status_code=400, detail="Item matching key could not be resolved during import.")
            for key, value in item_payload.items():
                setattr(item, key, value)
            inventory = db.query(Inventory).filter(Inventory.item_id == item.id).first()
            if inventory is None:
                inventory = Inventory(item_id=item.id, quantity_on_hand=quantity, landed_unit_cost=cost_price, total_value=quantity * cost_price)
                db.add(inventory)
            else:
                inventory.quantity_on_hand = quantity
                inventory.landed_unit_cost = cost_price
                inventory.total_value = quantity * cost_price
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

