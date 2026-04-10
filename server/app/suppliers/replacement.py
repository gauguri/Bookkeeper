from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
import zipfile
import xml.etree.ElementTree as ET

from sqlalchemy.orm import Session

from app.models import InvoiceLine, PurchaseOrder, PurchaseOrderSendLog, Supplier, SupplierItem


SPREADSHEET_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}


@dataclass
class SupplierWorkbookRow:
    row_number: int
    vendor_number: str | None
    name: str | None
    address: str | None
    phone: str | None
    email: str | None
    contact_name: str | None
    payment_terms: str | None
    vendor_peachtree_id: str | None
    sent_to_peachtree: str | None


@dataclass
class SupplierReplacementRowResult:
    row_number: int
    vendor_number: str | None
    name: str | None
    action: str
    status: str
    messages: list[str]
    matched_supplier_id: int | None = None


@dataclass
class SupplierRetirementResult:
    supplier_id: int
    name: str
    action: str
    referenced: bool
    messages: list[str]


def _normalize_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_name(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).lower()


def _build_traceability_note(row: SupplierWorkbookRow) -> str:
    parts: list[str] = []
    if row.vendor_number:
        parts.append(f"vendor_number={row.vendor_number}")
    if row.vendor_peachtree_id:
        parts.append(f"vendor_peachtree_id={row.vendor_peachtree_id}")
    if row.sent_to_peachtree:
        parts.append(f"sent_to_peachtree={row.sent_to_peachtree}")
    return "Glenrock vendor import: " + ", ".join(parts) if parts else "Glenrock vendor import"


def _append_note(existing_notes: str | None, note: str) -> str:
    existing = _normalize_string(existing_notes)
    if not existing:
        return note
    if note in existing:
        return existing
    return f"{existing}\n{note}"


def _supplier_has_references(db: Session, supplier_id: int) -> bool:
    return (
        db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == supplier_id).first() is not None
        or db.query(InvoiceLine.id).filter(InvoiceLine.supplier_id == supplier_id).first() is not None
        or db.query(PurchaseOrderSendLog.id).filter(PurchaseOrderSendLog.supplier_id == supplier_id).first() is not None
    )


def _load_shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []
    root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("a:si", SPREADSHEET_NS):
        strings.append("".join((node.text or "") for node in item.iterfind(".//a:t", SPREADSHEET_NS)))
    return strings


def _sheet_targets(workbook: zipfile.ZipFile) -> dict[str, str]:
    workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
    rels_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root.findall("p:Relationship", SPREADSHEET_NS)}
    targets: dict[str, str] = {}
    sheets = workbook_root.find("a:sheets", SPREADSHEET_NS)
    if sheets is None:
        return targets
    for sheet in sheets:
        name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if name and rel_id and rel_id in rel_map:
            targets[name] = rel_map[rel_id]
    return targets


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_node = cell.find("a:v", SPREADSHEET_NS)
    if value_node is None:
        return ""
    value = value_node.text or ""
    if cell_type == "s" and value:
        return shared_strings[int(value)]
    return value


def _column_index(cell_reference: str) -> int:
    letters = "".join(ch for ch in cell_reference if ch.isalpha())
    result = 0
    for letter in letters:
        result = result * 26 + (ord(letter.upper()) - 64)
    return result - 1


def _parse_rows_from_xlsx(workbook_path: str | Path) -> list[SupplierWorkbookRow]:
    path = Path(workbook_path)
    with zipfile.ZipFile(path) as workbook:
        shared_strings = _load_shared_strings(workbook)
        targets = _sheet_targets(workbook)
        if not targets:
            raise ValueError("Workbook does not contain any worksheets.")

        first_sheet_target = next(iter(targets.values()))
        sheet_root = ET.fromstring(workbook.read(f"xl/{first_sheet_target}"))
        rows = sheet_root.findall(".//a:sheetData/a:row", SPREADSHEET_NS)
        parsed_rows: list[SupplierWorkbookRow] = []
        for row in rows[1:]:
            padded = [""] * 15
            for cell in row.findall("a:c", SPREADSHEET_NS):
                ref = cell.attrib.get("r", "")
                index = _column_index(ref) if ref else None
                if index is None or index < 0 or index >= len(padded):
                    continue
                padded[index] = _cell_value(cell, shared_strings)
            address_parts = [_normalize_string(part) for part in padded[2:8]]
            address = ", ".join(part for part in address_parts if part)
            parsed_rows.append(
                SupplierWorkbookRow(
                    row_number=int(row.attrib.get("r", "0")),
                    vendor_number=_normalize_string(padded[0]),
                    name=_normalize_string(padded[1]),
                    address=address or None,
                    phone=_normalize_string(padded[8]),
                    email=_normalize_string(padded[10]),
                    contact_name=_normalize_string(padded[11]),
                    payment_terms=_normalize_string(padded[12]),
                    vendor_peachtree_id=_normalize_string(padded[13]),
                    sent_to_peachtree=_normalize_string(padded[14]),
                )
            )
        return parsed_rows


def analyze_supplier_replacement(
    db: Session,
    workbook_path: str | Path,
    company_id: int,
    allow_delete_unreferenced: bool = False,
) -> dict[str, Any]:
    workbook_rows = _parse_rows_from_xlsx(workbook_path)
    existing_suppliers = (
        db.query(Supplier)
        .filter(Supplier.company_id == company_id)
        .order_by(Supplier.id.asc())
        .all()
    )

    existing_by_name: dict[str, Supplier] = {}
    duplicate_existing_names: set[str] = set()
    for supplier in existing_suppliers:
        key = _normalize_name(supplier.name)
        if not key:
            continue
        if key in existing_by_name:
            duplicate_existing_names.add(key)
        else:
            existing_by_name[key] = supplier

    seen_workbook_names: dict[str, int] = {}
    matched_existing_ids: set[int] = set()
    row_results: list[SupplierReplacementRowResult] = []

    for row in workbook_rows:
        messages: list[str] = []
        normalized_name = _normalize_name(row.name)
        if not normalized_name:
            messages.append("Vendor name is blank.")
            row_results.append(
                SupplierReplacementRowResult(
                    row_number=row.row_number,
                    vendor_number=row.vendor_number,
                    name=row.name,
                    action="SKIP",
                    status="ERROR",
                    messages=messages,
                )
            )
            continue

        if normalized_name in seen_workbook_names:
            messages.append(f"Duplicate vendor name in workbook. First seen at row {seen_workbook_names[normalized_name]}.")
        else:
            seen_workbook_names[normalized_name] = row.row_number

        if normalized_name in duplicate_existing_names:
            messages.append("Multiple existing suppliers with this name already exist for the target company.")

        existing_supplier = existing_by_name.get(normalized_name) if normalized_name not in duplicate_existing_names else None
        if existing_supplier is not None:
            matched_existing_ids.add(existing_supplier.id)

        row_results.append(
            SupplierReplacementRowResult(
                row_number=row.row_number,
                vendor_number=row.vendor_number,
                name=row.name,
                action="UPDATE" if existing_supplier is not None else "CREATE",
                status="ERROR" if messages else "VALID",
                messages=messages,
                matched_supplier_id=existing_supplier.id if existing_supplier is not None else None,
            )
        )

    retirements: list[SupplierRetirementResult] = []
    for supplier in existing_suppliers:
        if supplier.id in matched_existing_ids:
            continue
        referenced = _supplier_has_references(db, supplier.id)
        if referenced:
            retirements.append(
                SupplierRetirementResult(
                    supplier_id=supplier.id,
                    name=supplier.name,
                    action="ARCHIVE",
                    referenced=True,
                    messages=["Supplier has purchasing or invoice history and must be archived."],
                )
            )
        elif allow_delete_unreferenced:
            retirements.append(
                SupplierRetirementResult(
                    supplier_id=supplier.id,
                    name=supplier.name,
                    action="DELETE",
                    referenced=False,
                    messages=["Supplier is unreferenced and can be deleted."],
                )
            )
        else:
            retirements.append(
                SupplierRetirementResult(
                    supplier_id=supplier.id,
                    name=supplier.name,
                    action="ARCHIVE",
                    referenced=False,
                    messages=["Supplier is unreferenced but delete is disabled, so it will be archived."],
                )
            )

    summary = {
        "total_rows": len(workbook_rows),
        "valid_rows": sum(1 for row in row_results if row.status == "VALID"),
        "error_rows": sum(1 for row in row_results if row.status == "ERROR"),
        "create_count": sum(1 for row in row_results if row.status == "VALID" and row.action == "CREATE"),
        "update_count": sum(1 for row in row_results if row.status == "VALID" and row.action == "UPDATE"),
        "skip_count": sum(1 for row in row_results if row.action == "SKIP"),
        "archive_count": sum(1 for item in retirements if item.action == "ARCHIVE"),
        "delete_count": sum(1 for item in retirements if item.action == "DELETE"),
        "supplier_item_links_to_remove": (
            db.query(SupplierItem.id)
            .join(Supplier, Supplier.id == SupplierItem.supplier_id)
            .filter(Supplier.company_id == company_id)
            .count()
        ),
    }

    return {
        "summary": summary,
        "rows": [asdict(row) for row in row_results],
        "retirements": [asdict(item) for item in retirements],
    }


def replace_suppliers_from_xlsx(
    db: Session,
    workbook_path: str | Path,
    company_id: int,
    allow_delete_unreferenced: bool = False,
    dry_run: bool = True,
) -> dict[str, Any]:
    analysis = analyze_supplier_replacement(
        db=db,
        workbook_path=workbook_path,
        company_id=company_id,
        allow_delete_unreferenced=allow_delete_unreferenced,
    )
    if analysis["summary"]["error_rows"] > 0 or dry_run:
        return analysis

    workbook_rows = _parse_rows_from_xlsx(workbook_path)
    existing_suppliers = {
        _normalize_name(supplier.name): supplier
        for supplier in db.query(Supplier).filter(Supplier.company_id == company_id).all()
        if _normalize_name(supplier.name)
    }
    retirement_map = {item["supplier_id"]: item for item in analysis["retirements"]}

    (
        db.query(SupplierItem)
        .filter(SupplierItem.supplier_id.in_(db.query(Supplier.id).filter(Supplier.company_id == company_id)))
        .delete(synchronize_session=False)
    )

    for row in workbook_rows:
        normalized_name = _normalize_name(row.name)
        if not normalized_name:
            continue

        supplier = existing_suppliers.get(normalized_name)
        payload = {
            "company_id": company_id,
            "name": row.name,
            "address": row.address,
            "phone": row.phone,
            "email": row.email,
            "contact_name": row.contact_name,
            "payment_terms": row.payment_terms or "Net 30",
            "status": "active",
            "notes": _build_traceability_note(row),
        }
        if supplier is None:
            supplier = Supplier(**payload)
            db.add(supplier)
            db.flush()
            existing_suppliers[normalized_name] = supplier
            continue

        for key, value in payload.items():
            setattr(supplier, key, value)

    suppliers_to_retire = (
        db.query(Supplier)
        .filter(Supplier.company_id == company_id)
        .order_by(Supplier.id.asc())
        .all()
    )
    retained_names = {_normalize_name(row.name) for row in workbook_rows if _normalize_name(row.name)}
    for supplier in suppliers_to_retire:
        if _normalize_name(supplier.name) in retained_names:
            continue
        retirement = retirement_map.get(supplier.id)
        if retirement is None:
            continue
        if retirement["action"] == "DELETE":
            db.delete(supplier)
            continue
        supplier.status = "inactive"
        supplier.notes = _append_note(supplier.notes, "Archived by Glenrock vendor replacement.")

    db.flush()
    return analysis
