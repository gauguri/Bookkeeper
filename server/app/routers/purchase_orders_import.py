import csv
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.models import Inventory, Item, PurchaseOrder, PurchaseOrderLine, Supplier, SupplierItem
from app.module_keys import ModuleKey


router = APIRouter(
    prefix="/api/purchase-orders",
    tags=["purchase-orders-import"],
    dependencies=[Depends(require_module(ModuleKey.PURCHASE_ORDERS.value))],
)


class PurchaseOrderImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    example: Optional[str] = None


class PurchaseOrderImportFormatResponse(BaseModel):
    delimiter: str
    has_header: bool
    purchase_order_required_fields: list[str]
    purchase_order_optional_fields: list[str]
    purchase_order_fields: list[PurchaseOrderImportFieldSpec]
    inventory_required_fields: list[str]
    inventory_optional_fields: list[str]
    inventory_fields: list[PurchaseOrderImportFieldSpec]
    purchase_order_sample_csv: str
    inventory_sample_csv: str
    notes: list[str]


class PurchaseOrderImportRequest(BaseModel):
    purchase_orders_csv: str
    inventory_csv: str
    has_header: bool = True


class PurchaseOrderImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int
    purchase_order_rows: int
    inventory_rows: int


class PurchaseOrderImportRowResult(BaseModel):
    source: Literal["PURCHASE_ORDER", "INVENTORY"]
    row_number: int
    po_number: Optional[str] = None
    vendor_number: Optional[str] = None
    item_code: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
    status: Literal["VALID", "ERROR"]
    messages: list[str]


class PurchaseOrderImportRecord(BaseModel):
    id: int
    po_number: str
    supplier_name: str
    line_count: int
    action: Literal["CREATED", "UPDATED"]


class PurchaseOrderImportResponse(BaseModel):
    summary: PurchaseOrderImportSummary
    rows: list[PurchaseOrderImportRowResult]
    imported_purchase_orders: list[PurchaseOrderImportRecord]


PURCHASE_ORDER_HEADER_ALIASES = {
    "p.o. number": "po_number",
    "po number": "po_number",
    "p.o. date": "order_date",
    "po date": "order_date",
    "vendor number": "vendor_number",
    "expected ship date": "expected_date",
    "comments": "comments",
    "p.o. status": "status",
    "po status": "status",
    "ship line": "ship_line",
    "total for po": "total_for_po",
    "inventoryupdateon": "inventory_update_on",
    "inventory update on": "inventory_update_on",
    "senttopeachtree": "sent_to_peachtree",
    "sent to peachtree": "sent_to_peachtree",
}

INVENTORY_HEADER_ALIASES = {
    "p.o. number": "po_number",
    "po number": "po_number",
    "item code": "item_code",
    "quantity": "quantity",
    "price": "price",
    "family name": "family_name",
    "item status": "item_status",
    "sub total weight": "sub_total_weight",
    "inv updated": "inv_updated",
}

PURCHASE_ORDER_FIELD_SPECS = [
    PurchaseOrderImportFieldSpec(field="po_number", label="P.O. Number", required=True, description="Purchase order number used as the import key.", example="GR-20/2010"),
    PurchaseOrderImportFieldSpec(field="order_date", label="P.O. Date", required=True, description="Purchase order date.", example="9/8/2010"),
    PurchaseOrderImportFieldSpec(field="vendor_number", label="Vendor Number", required=True, description="Supplier vendor number that must match the Suppliers module.", example="62"),
    PurchaseOrderImportFieldSpec(field="expected_date", label="Expected Ship Date", required=False, description="Expected ship or receipt date.", example="10/9/2010"),
    PurchaseOrderImportFieldSpec(field="comments", label="Comments", required=False, description="Header comments carried into the PO notes."),
    PurchaseOrderImportFieldSpec(field="status", label="P.O. Status", required=False, description="Source purchasing status.", example="RECEIVED"),
    PurchaseOrderImportFieldSpec(field="ship_line", label="Ship Line", required=False, description="Carrier or ship line."),
    PurchaseOrderImportFieldSpec(field="total_for_po", label="Total for PO", required=False, description="Legacy header total for traceability.", example="$0.00"),
    PurchaseOrderImportFieldSpec(field="inventory_update_on", label="InventoryUpdateOn", required=False, description="Legacy inventory update date.", example="19-Nov-10"),
    PurchaseOrderImportFieldSpec(field="sent_to_peachtree", label="SentToPeachtree", required=False, description="Legacy Peach sync flag.", example="FALSE"),
]

INVENTORY_FIELD_SPECS = [
    PurchaseOrderImportFieldSpec(field="po_number", label="P.O. Number", required=True, description="Purchase order number that links each line to the PO header.", example="GR-01"),
    PurchaseOrderImportFieldSpec(field="item_code", label="Item Code", required=True, description="Imported Glenrock item code / SKU.", example="1053"),
    PurchaseOrderImportFieldSpec(field="quantity", label="Quantity", required=True, description="Ordered quantity for this PO line.", example="4"),
    PurchaseOrderImportFieldSpec(field="price", label="Price", required=True, description="Unit cost for the line.", example="$127.00"),
    PurchaseOrderImportFieldSpec(field="family_name", label="Family Name", required=False, description="Legacy family/category field."),
    PurchaseOrderImportFieldSpec(field="item_status", label="Item Status", required=False, description="Legacy item status field."),
    PurchaseOrderImportFieldSpec(field="sub_total_weight", label="Sub Total Weight", required=False, description="Legacy subtotal weight field."),
    PurchaseOrderImportFieldSpec(field="inv_updated", label="Inv Updated", required=False, description="Whether inventory values were updated in the source system.", example="TRUE"),
]

PURCHASE_ORDER_SAMPLE_CSV = "\n".join(
    [
        "P.O. Number,P.O. Date,Vendor Number,Expected Ship Date,Comments,P.O. Status,Ship Line,Total for PO,InventoryUpdateOn,SentToPeachtree",
        "GR-20/2010,9/8/2010,62,10/9/2010,,RECEIVED,DAHNAY,$0.00,19-Nov-10,FALSE",
        "GR-21/2010,9/8/2010,77,10/12/2010,STONE ORDER,ORDERED,MSC,$0.00,,FALSE",
    ]
)

INVENTORY_SAMPLE_CSV = "\n".join(
    [
        "P.O. Number,Item Code,Quantity,Price,Family Name,Item Status,Sub Total Weight,Inv Updated",
        "GR-20/2010,1053,4,$127.00,,,0.00,TRUE",
        "GR-20/2010,1071,3,$205.00,,,0.00,TRUE",
    ]
)

TRUE_VALUES = {"true", "1", "yes", "y", "received"}
FALSE_VALUES = {"false", "0", "no", "n", "ordered"}


def _normalize_nullable_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _canonicalize_header(value: str, aliases: dict[str, str]) -> str:
    return aliases.get(value.strip().lower(), "")


def _parse_decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    is_negative = False
    if text.startswith("(") and text.endswith(")"):
        is_negative = True
        text = text[1:-1]
    try:
        parsed = Decimal(text.replace("$", "").replace(",", ""))
        return -parsed if is_negative else parsed
    except InvalidOperation:
        return None


def _parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return None


def _parse_date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y", "%d-%b-%y", "%d-%b-%Y", "%d-%B-%y", "%d-%B-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _map_po_status(value: Optional[str]) -> str:
    normalized = (value or "").strip().upper()
    if normalized == "RECEIVED":
        return "RECEIVED"
    if normalized in {"ORDERED", "SENT"}:
        return "SENT"
    if normalized == "CANCELLED":
        return "CANCELLED"
    return "DRAFT"


def _build_po_notes(header_row: dict[str, Any]) -> Optional[str]:
    parts: list[str] = []
    comments = _normalize_nullable_string(header_row.get("comments"))
    ship_line = _normalize_nullable_string(header_row.get("ship_line"))
    total_for_po = _normalize_nullable_string(header_row.get("total_for_po"))
    inventory_update_on = _normalize_nullable_string(header_row.get("inventory_update_on"))
    sent_to_peachtree = _normalize_nullable_string(header_row.get("sent_to_peachtree"))
    if comments:
        parts.append(f"Comments: {comments}")
    if ship_line:
        parts.append(f"Ship Line: {ship_line}")
    if total_for_po:
        parts.append(f"Legacy Total for PO: {total_for_po}")
    if inventory_update_on:
        parts.append(f"InventoryUpdateOn: {inventory_update_on}")
    if sent_to_peachtree:
        parts.append(f"SentToPeachtree: {sent_to_peachtree}")
    if not parts:
        return None
    return "\n".join(parts)


def _parse_csv_rows(
    csv_data: str,
    has_header: bool,
    aliases: dict[str, str],
    required_fields: list[str],
    ordered_fields: list[str],
    label: str,
) -> list[dict[str, Any]]:
    content = csv_data.strip()
    if not content:
        raise HTTPException(status_code=400, detail=f"{label} CSV data is empty.")

    if not has_header:
        raise HTTPException(status_code=400, detail=f"{label} CSV must include a header row.")

    reader = csv.DictReader(StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail=f"{label} CSV header row is required.")

    header_map: dict[str, str] = {}
    for field_name in reader.fieldnames:
        if field_name is None:
            continue
        canonical = _canonicalize_header(field_name, aliases)
        if canonical:
            header_map[canonical] = field_name

    for required_field in required_fields:
        if required_field not in header_map:
            pretty_name = next((spec.label for spec in (PURCHASE_ORDER_FIELD_SPECS + INVENTORY_FIELD_SPECS) if spec.field == required_field), required_field)
            raise HTTPException(status_code=400, detail=f"Missing required {label} CSV header: {pretty_name}")

    rows: list[dict[str, Any]] = []
    for row_number, raw_row in enumerate(reader, start=2):
        parsed_row: dict[str, Any] = {"row_number": row_number}
        for field in ordered_fields:
            parsed_row[field] = raw_row.get(header_map.get(field, ""), "")
        rows.append(parsed_row)
    return rows


def _purchase_order_format_response() -> PurchaseOrderImportFormatResponse:
    return PurchaseOrderImportFormatResponse(
        delimiter=",",
        has_header=True,
        purchase_order_required_fields=["po_number", "order_date", "vendor_number"],
        purchase_order_optional_fields=["expected_date", "comments", "status", "ship_line", "total_for_po", "inventory_update_on", "sent_to_peachtree"],
        purchase_order_fields=PURCHASE_ORDER_FIELD_SPECS,
        inventory_required_fields=["po_number", "item_code", "quantity", "price"],
        inventory_optional_fields=["family_name", "item_status", "sub_total_weight", "inv_updated"],
        inventory_fields=INVENTORY_FIELD_SPECS,
        purchase_order_sample_csv=PURCHASE_ORDER_SAMPLE_CSV,
        inventory_sample_csv=INVENTORY_SAMPLE_CSV,
        notes=[
            "Upload both Glenrock purchase-order CSVs together: the PO header file and the PurchaseOrder-Inventory file.",
            "Vendor Number must match a supplier vendor_number in the Suppliers module.",
            "Item Code matches items by item_code first, then SKU.",
            "Valid line imports create or update PO lines and refresh the supplier-item cost link from the CSV price.",
            "When Inv Updated is TRUE, the importer refreshes the item's inventory valuation and seeds quantity on hand only if the item currently has no stock loaded.",
        ],
    )


def _analyze_purchase_order_import(payload: PurchaseOrderImportRequest, db: Session) -> dict[str, Any]:
    header_rows = _parse_csv_rows(
        payload.purchase_orders_csv,
        payload.has_header,
        PURCHASE_ORDER_HEADER_ALIASES,
        ["po_number", "order_date", "vendor_number"],
        [field.field for field in PURCHASE_ORDER_FIELD_SPECS],
        "Purchase order",
    )
    inventory_rows = _parse_csv_rows(
        payload.inventory_csv,
        payload.has_header,
        INVENTORY_HEADER_ALIASES,
        ["po_number", "item_code", "quantity", "price"],
        [field.field for field in INVENTORY_FIELD_SPECS],
        "Purchase order inventory",
    )

    suppliers = db.query(Supplier).order_by(Supplier.id.asc()).all()
    supplier_by_vendor: dict[str, Supplier] = {}
    duplicate_vendor_numbers: set[str] = set()
    for supplier in suppliers:
        vendor_number = _normalize_nullable_string(getattr(supplier, "vendor_number", None))
        if not vendor_number:
            continue
        key = vendor_number.upper()
        if key in supplier_by_vendor:
            duplicate_vendor_numbers.add(key)
        else:
            supplier_by_vendor[key] = supplier

    items = db.query(Item).order_by(Item.id.asc()).all()
    item_by_code: dict[str, Item] = {}
    ambiguous_item_codes: set[str] = set()
    for item in items:
        for candidate in [_normalize_nullable_string(item.item_code), _normalize_nullable_string(item.sku)]:
            if not candidate:
                continue
            key = candidate.upper()
            if key in item_by_code and item_by_code[key].id != item.id:
                ambiguous_item_codes.add(key)
            else:
                item_by_code[key] = item

    existing_pos = db.query(PurchaseOrder).order_by(PurchaseOrder.id.asc()).all()
    existing_po_by_number = {po.po_number.upper(): po for po in existing_pos if po.po_number}

    line_rows_by_po: dict[str, list[dict[str, Any]]] = {}
    first_seen_headers: dict[str, int] = {}
    first_seen_lines: dict[tuple[str, str], int] = {}
    analysis_rows: list[dict[str, Any]] = []
    header_analysis_by_po: dict[str, dict[str, Any]] = {}

    for raw_row in header_rows:
        row_number = int(raw_row["row_number"])
        po_number = _normalize_nullable_string(raw_row.get("po_number"))
        vendor_number = _normalize_nullable_string(raw_row.get("vendor_number"))
        order_date_value = _parse_date(_normalize_nullable_string(raw_row.get("order_date")))
        expected_date_value = _parse_date(_normalize_nullable_string(raw_row.get("expected_date")))
        messages: list[str] = []

        if not po_number:
            messages.append("P.O. Number is required.")
        if not vendor_number:
            messages.append("Vendor Number is required.")
        if not order_date_value:
            messages.append("P.O. Date is required and must be a valid date.")
        if _normalize_nullable_string(raw_row.get("expected_date")) and not expected_date_value:
            messages.append("Expected Ship Date must be a valid date when provided.")

        po_key = po_number.upper() if po_number else ""
        vendor_key = vendor_number.upper() if vendor_number else ""
        if po_key:
            if po_key in first_seen_headers:
                messages.append(f"Duplicate P.O. Number in file. First seen at row {first_seen_headers[po_key]}.")
            else:
                first_seen_headers[po_key] = row_number

        supplier = None
        if vendor_key:
            if vendor_key in duplicate_vendor_numbers:
                messages.append("Multiple suppliers share this Vendor Number. Resolve supplier duplicates first.")
            else:
                supplier = supplier_by_vendor.get(vendor_key)
                if supplier is None:
                    messages.append("Vendor Number does not match any supplier in the Suppliers tab.")

        existing_po = existing_po_by_number.get(po_key) if po_key else None
        status_value = _map_po_status(_normalize_nullable_string(raw_row.get("status")))
        notes = _build_po_notes(raw_row)
        action = "ERROR"
        if not messages:
            action = "UPDATE" if existing_po else "CREATE"

        header_record = {
            "source": "PURCHASE_ORDER",
            "row_number": row_number,
            "po_number": po_number,
            "vendor_number": vendor_number,
            "item_code": None,
            "quantity": None,
            "unit_cost": None,
            "action": action,
            "status": "ERROR" if messages else "VALID",
            "messages": messages,
            "supplier": supplier,
            "existing_po": existing_po,
            "payload": {
                "po_number": po_number,
                "supplier_id": supplier.id if supplier else None,
                "order_date": order_date_value,
                "expected_date": expected_date_value,
                "status": status_value,
                "notes": notes,
                "freight_cost": Decimal("0.00"),
                "tariff_cost": Decimal("0.00"),
            },
        }
        analysis_rows.append(header_record)
        if po_key and po_key not in header_analysis_by_po:
            header_analysis_by_po[po_key] = header_record

    for raw_row in inventory_rows:
        row_number = int(raw_row["row_number"])
        po_number = _normalize_nullable_string(raw_row.get("po_number"))
        item_code = _normalize_nullable_string(raw_row.get("item_code"))
        quantity_raw = _normalize_nullable_string(raw_row.get("quantity"))
        price_raw = _normalize_nullable_string(raw_row.get("price"))
        quantity = _parse_decimal(quantity_raw)
        price = _parse_decimal(price_raw)
        inv_updated = _parse_bool(_normalize_nullable_string(raw_row.get("inv_updated")))
        messages: list[str] = []
        skip_row = False

        if not po_number:
            messages.append("P.O. Number is required.")
        if not item_code:
            messages.append("Item Code is required.")
        if quantity is None:
            skip_row = True
            messages.append("Skipped legacy line because quantity is blank.")
        elif quantity == 0:
            skip_row = True
            messages.append("Skipped legacy line because quantity is zero.")
        elif quantity < 0:
            quantity = abs(quantity)

        if price is None:
            price = Decimal("0.00")
        elif price < 0:
            price = abs(price)
        if _normalize_nullable_string(raw_row.get("inv_updated")) and inv_updated is None:
            messages.append("Inv Updated must be TRUE or FALSE when provided.")

        po_key = po_number.upper() if po_number else ""
        item_key = item_code.upper() if item_code else ""
        if po_key and item_key:
            duplicate_key = (po_key, item_key)
            if duplicate_key in first_seen_lines:
                messages.append(f"Duplicate item line for this PO in file. First seen at row {first_seen_lines[duplicate_key]}.")
            else:
                first_seen_lines[duplicate_key] = row_number

        header_record = header_analysis_by_po.get(po_key) if po_key else None
        existing_po = existing_po_by_number.get(po_key) if po_key else None
        if header_record and header_record["status"] == "ERROR":
            messages.append("Referenced purchase order header has validation errors.")
        if not header_record and existing_po is None:
            messages.append("P.O. Number does not exist in the uploaded header CSV or existing purchase orders.")

        item = None
        if item_key:
            if item_key in ambiguous_item_codes:
                messages.append("Multiple items share this Item Code/SKU. Resolve duplicates before importing PO lines.")
            else:
                item = item_by_code.get(item_key)
                if item is None:
                    messages.append("Item Code does not match any item in the Product Catalog.")

        blocking_messages = [message for message in messages if not message.startswith("Skipped legacy line because")]
        action = "ERROR"
        if not blocking_messages:
            if skip_row:
                action = "SKIP"
            else:
                action = "UPDATE" if (existing_po or header_record and header_record["action"] == "UPDATE") else "CREATE"

        status = "ERROR" if blocking_messages else "VALID"

        row_record = {
            "source": "INVENTORY",
            "row_number": row_number,
            "po_number": po_number,
            "vendor_number": header_record["vendor_number"] if header_record else None,
            "item_code": item_code,
            "quantity": quantity,
            "unit_cost": price,
            "action": action,
            "status": status,
            "messages": messages,
            "item": item,
            "inv_updated": bool(inv_updated),
            "existing_po": existing_po,
            "skip_row": skip_row,
        }
        analysis_rows.append(row_record)
        if po_key:
            line_rows_by_po.setdefault(po_key, []).append(row_record)

    for po_key, header_record in header_analysis_by_po.items():
        if header_record["status"] == "ERROR":
            continue
        valid_lines = [row for row in line_rows_by_po.get(po_key, []) if row["status"] == "VALID"]
        if not valid_lines:
            header_record["status"] = "ERROR"
            header_record["action"] = "ERROR"
            header_record["messages"] = [*header_record["messages"], "No valid PurchaseOrder-Inventory rows were found for this purchase order."]
            for row in line_rows_by_po.get(po_key, []):
                if "Referenced purchase order header has validation errors." not in row["messages"]:
                    row["messages"].append("Referenced purchase order header has validation errors.")
                    row["status"] = "ERROR"
                    row["action"] = "ERROR"

    valid_headers = [row for row in header_analysis_by_po.values() if row["status"] == "VALID"]
    create_count = sum(1 for row in valid_headers if row["action"] == "CREATE")
    update_count = sum(1 for row in valid_headers if row["action"] == "UPDATE")
    skip_count = sum(1 for row in analysis_rows if row["action"] == "SKIP")
    error_rows = sum(1 for row in analysis_rows if row["status"] == "ERROR")

    return {
        "summary": {
            "total_rows": len(analysis_rows),
            "valid_rows": len(analysis_rows) - error_rows,
            "error_rows": error_rows,
            "create_count": create_count,
            "update_count": update_count,
            "skip_count": skip_count,
            "purchase_order_rows": len(header_rows),
            "inventory_rows": len(inventory_rows),
        },
        "rows": analysis_rows,
        "valid_headers": valid_headers,
        "valid_lines_by_po": {
            po_key: [row for row in rows if row["status"] == "VALID" and row["action"] != "SKIP"]
            for po_key, rows in line_rows_by_po.items()
        },
    }


def _sync_inventory_from_import(db: Session, *, item: Item, quantity: Decimal, unit_cost: Decimal, inv_updated: bool) -> None:
    inventory = db.query(Inventory).filter(Inventory.item_id == item.id).with_for_update().first()
    if inventory is None:
        inventory = Inventory(item_id=item.id, quantity_on_hand=Decimal(item.on_hand_qty or 0), landed_unit_cost=Decimal("0"), total_value=Decimal("0"))
        db.add(inventory)
        db.flush()

    current_qty = Decimal(inventory.quantity_on_hand or item.on_hand_qty or 0)
    if inv_updated and current_qty == 0 and quantity > 0:
        current_qty = quantity
    inventory.quantity_on_hand = current_qty
    item.on_hand_qty = current_qty
    inventory.landed_unit_cost = unit_cost
    inventory.total_value = current_qty * unit_cost
    inventory.last_updated_at = datetime.utcnow()


def _upsert_supplier_item_link(db: Session, *, supplier_id: int, item_id: int, unit_cost: Decimal) -> None:
    link = (
        db.query(SupplierItem)
        .filter(SupplierItem.supplier_id == supplier_id, SupplierItem.item_id == item_id)
        .first()
    )
    if link is None:
        has_preferred = (
            db.query(SupplierItem.id)
            .filter(SupplierItem.item_id == item_id, SupplierItem.is_preferred.is_(True))
            .first()
            is not None
        )
        link = SupplierItem(
            supplier_id=supplier_id,
            item_id=item_id,
            supplier_cost=unit_cost,
            freight_cost=Decimal("0.00"),
            tariff_cost=Decimal("0.00"),
            default_unit_cost=unit_cost,
            is_active=True,
            is_preferred=not has_preferred,
        )
        db.add(link)
        return

    link.supplier_cost = unit_cost
    link.default_unit_cost = unit_cost
    link.is_active = True


def _import_purchase_orders(payload: PurchaseOrderImportRequest, db: Session) -> PurchaseOrderImportResponse:
    analysis = _analyze_purchase_order_import(payload, db)
    if analysis["summary"]["error_rows"] > 0:
        raise HTTPException(status_code=400, detail="Resolve all validation errors before importing purchase orders.")

    imported_records: list[PurchaseOrderImportRecord] = []
    po_by_key: dict[str, PurchaseOrder] = {}

    for header in analysis["valid_headers"]:
        po_payload = header["payload"]
        existing_po: PurchaseOrder | None = header["existing_po"]
        if existing_po is None:
            po = PurchaseOrder(
                po_number=po_payload["po_number"],
                supplier_id=po_payload["supplier_id"],
                order_date=po_payload["order_date"],
                expected_date=po_payload["expected_date"],
                notes=po_payload["notes"],
                freight_cost=Decimal("0.00"),
                tariff_cost=Decimal("0.00"),
                status=po_payload["status"],
            )
            db.add(po)
            db.flush()
            action: Literal["CREATED", "UPDATED"] = "CREATED"
        else:
            po = existing_po
            po.supplier_id = po_payload["supplier_id"]
            po.order_date = po_payload["order_date"]
            po.expected_date = po_payload["expected_date"]
            po.notes = po_payload["notes"]
            po.freight_cost = Decimal("0.00")
            po.tariff_cost = Decimal("0.00")
            po.status = po_payload["status"]
            action = "UPDATED"

        po_by_key[po.po_number.upper()] = po
        imported_records.append(
            PurchaseOrderImportRecord(
                id=po.id,
                po_number=po.po_number,
                supplier_name=header["supplier"].name if header["supplier"] else f"Supplier #{po.supplier_id}",
                line_count=0,
                action=action,
            )
        )

    for po_key, line_rows in analysis["valid_lines_by_po"].items():
        if po_key not in po_by_key:
            existing_po = next((row["existing_po"] for row in line_rows if row["existing_po"] is not None), None)
            if existing_po is None:
                continue
            po_by_key[po_key] = existing_po

        po = po_by_key[po_key]
        po.lines.clear()
        db.flush()

        received_flags: list[bool] = []
        for line_row in line_rows:
            item: Item = line_row["item"]
            quantity: Decimal = line_row["quantity"]
            unit_cost: Decimal = line_row["unit_cost"]
            qty_received = quantity if (line_row["inv_updated"] or po.status == "RECEIVED") else Decimal("0")

            _upsert_supplier_item_link(db, supplier_id=po.supplier_id, item_id=item.id, unit_cost=unit_cost)
            _sync_inventory_from_import(db, item=item, quantity=quantity, unit_cost=unit_cost, inv_updated=line_row["inv_updated"])

            po.lines.append(
                PurchaseOrderLine(
                    item_id=item.id,
                    qty_ordered=quantity,
                    unit_cost=unit_cost,
                    freight_cost=Decimal("0.00"),
                    tariff_cost=Decimal("0.00"),
                    landed_cost=unit_cost,
                    qty_received=qty_received,
                )
            )
            received_flags.append(qty_received >= quantity)

        if po.lines:
            if all(received_flags):
                po.status = "RECEIVED"
            elif any(Decimal(line.qty_received or 0) > 0 for line in po.lines):
                po.status = "PARTIALLY_RECEIVED"

        for record in imported_records:
            if record.po_number.upper() == po_key:
                record.line_count = len(po.lines)
                break

    db.commit()
    return PurchaseOrderImportResponse(
        summary=PurchaseOrderImportSummary(**analysis["summary"]),
        rows=[
            PurchaseOrderImportRowResult(
                source=row["source"],
                row_number=row["row_number"],
                po_number=row["po_number"],
                vendor_number=row["vendor_number"],
                item_code=row["item_code"],
                quantity=row["quantity"],
                unit_cost=row["unit_cost"],
                action=row["action"],
                status=row["status"],
                messages=row["messages"],
            )
            for row in analysis["rows"]
        ],
        imported_purchase_orders=imported_records,
    )


@router.get("/import-format", response_model=PurchaseOrderImportFormatResponse)
def get_purchase_order_import_format():
    return _purchase_order_format_response()


@router.post("/import-preview", response_model=PurchaseOrderImportResponse)
def preview_purchase_order_import(payload: PurchaseOrderImportRequest, db: Session = Depends(get_db)):
    analysis = _analyze_purchase_order_import(payload, db)
    return PurchaseOrderImportResponse(
        summary=PurchaseOrderImportSummary(**analysis["summary"]),
        rows=[
            PurchaseOrderImportRowResult(
                source=row["source"],
                row_number=row["row_number"],
                po_number=row["po_number"],
                vendor_number=row["vendor_number"],
                item_code=row["item_code"],
                quantity=row["quantity"],
                unit_cost=row["unit_cost"],
                action=row["action"],
                status=row["status"],
                messages=row["messages"],
            )
            for row in analysis["rows"]
        ],
        imported_purchase_orders=[],
    )


@router.post("/import", response_model=PurchaseOrderImportResponse, status_code=status.HTTP_201_CREATED)
def import_purchase_orders(payload: PurchaseOrderImportRequest, db: Session = Depends(get_db)):
    return _import_purchase_orders(payload, db)
