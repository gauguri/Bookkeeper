from __future__ import annotations

from datetime import date
from decimal import Decimal
import tempfile
from pathlib import Path
import zipfile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Company, Item, PurchaseOrder, Supplier, SupplierItem
from app.suppliers.replacement import analyze_supplier_replacement, replace_suppliers_from_xlsx


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def create_company(db, name: str) -> Company:
    company = Company(name=name, base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()
    return company


def create_supplier(db, company_id: int, name: str, status: str = "active", notes: str | None = None) -> Supplier:
    supplier = Supplier(
        company_id=company_id,
        name=name,
        status=status,
        payment_terms="Net 30",
        currency="USD",
        notes=notes,
    )
    db.add(supplier)
    db.flush()
    return supplier


def create_item(db, name: str = "Widget") -> Item:
    item = Item(name=name, unit_price=Decimal("10.00"), is_active=True)
    db.add(item)
    db.flush()
    return item


def create_supplier_item(db, supplier_id: int, item_id: int) -> SupplierItem:
    link = SupplierItem(
        supplier_id=supplier_id,
        item_id=item_id,
        supplier_cost=Decimal("5.00"),
        freight_cost=Decimal("0.00"),
        tariff_cost=Decimal("0.00"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()
    return link


def create_purchase_order(db, supplier_id: int, number: str = "PO-001") -> PurchaseOrder:
    po = PurchaseOrder(
        po_number=number,
        supplier_id=supplier_id,
        order_date=date(2024, 1, 1),
        status="DRAFT",
    )
    db.add(po)
    db.flush()
    return po


def write_vendor_workbook(path: Path, rows: list[list[str]]) -> None:
    header = [
        "Vendor Number",
        "Vendor Name",
        "Address",
        "Address",
        "City",
        "State/Province",
        "Postal Code",
        "Country",
        "Telephone",
        "Fax Number",
        "Email Address",
        "Primary Contact",
        "Payment Terms",
        "VendorPeachtreeID",
        "SentToPeachtree",
    ]
    all_rows = [header] + rows

    def col_ref(index: int) -> str:
        result = ""
        current = index
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            result = chr(65 + remainder) + result
        return result

    shared_strings: list[str] = []
    shared_index: dict[str, int] = {}

    def string_id(value: str) -> int:
        if value not in shared_index:
            shared_index[value] = len(shared_strings)
            shared_strings.append(value)
        return shared_index[value]

    row_xml: list[str] = []
    for row_number, row in enumerate(all_rows, start=1):
        cells: list[str] = []
        for column_number, value in enumerate(row, start=1):
            if value == "":
                continue
            index = string_id(str(value))
            cells.append(f'<c r="{col_ref(column_number)}{row_number}" t="s"><v>{index}</v></c>')
        row_xml.append(f'<row r="{row_number}">{"".join(cells)}</row>')

    shared_xml = "".join(f"<si><t>{value}</t></si>" for value in shared_strings)
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(row_xml)}</sheetData>"
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        "</Relationships>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    )
    shared_strings_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared_strings)}" uniqueCount="{len(shared_strings)}">'
        f"{shared_xml}</sst>"
    )

    with zipfile.ZipFile(path, "w") as workbook:
        workbook.writestr("[Content_Types].xml", content_types_xml)
        workbook.writestr("_rels/.rels", root_rels_xml)
        workbook.writestr("xl/workbook.xml", workbook_xml)
        workbook.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        workbook.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        workbook.writestr("xl/sharedStrings.xml", shared_strings_xml)


def create_workbook_path() -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False, dir=Path.cwd())
    tmp.close()
    return Path(tmp.name)


def test_supplier_replacement_dry_run_reports_diff_and_does_not_mutate():
    db = create_session()
    company = create_company(db, "Glenrock")
    existing = create_supplier(db, company.id, "Legacy Stone")
    item = create_item(db)
    create_supplier_item(db, existing.id, item.id)
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(
        workbook,
        [
            ["101", "Legacy Stone", "123 Main", "", "Paterson", "NJ", "07501", "USA", "555-1000", "", "legacy@test.com", "Lee", "Net 15", "LEGACY", "0"],
            ["102", "New Granite", "5 Quarry Rd", "Unit A", "Newark", "NJ", "07102", "USA", "555-2000", "", "new@test.com", "Nora", "Net 30", "NEW", "0"],
        ],
    )

    result = replace_suppliers_from_xlsx(db, workbook, company.id, dry_run=True)

    assert result["summary"]["create_count"] == 1
    assert result["summary"]["update_count"] == 1
    assert result["summary"]["archive_count"] == 0
    assert result["summary"]["delete_count"] == 0
    assert result["summary"]["supplier_item_links_to_remove"] == 1
    assert db.query(Supplier).filter(Supplier.company_id == company.id).count() == 1
    assert db.query(SupplierItem).count() == 1


def test_supplier_replacement_is_company_scoped():
    db = create_session()
    glenrock = create_company(db, "Glenrock")
    other = create_company(db, "OtherCo")
    create_supplier(db, glenrock.id, "Legacy Stone")
    untouched = create_supplier(db, other.id, "Other Supplier")
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(workbook, [["101", "New Granite", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "", "0"]])

    result = replace_suppliers_from_xlsx(db, workbook, glenrock.id, dry_run=False)
    db.commit()

    assert result["summary"]["create_count"] == 1
    assert db.query(Supplier).filter(Supplier.company_id == other.id, Supplier.id == untouched.id).one().name == "Other Supplier"


def test_supplier_replacement_archives_referenced_suppliers_and_preserves_history():
    db = create_session()
    company = create_company(db, "Glenrock")
    old_supplier = create_supplier(db, company.id, "Legacy Stone", notes="Original")
    create_purchase_order(db, old_supplier.id)
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(workbook, [["201", "Modern Marble", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "", "0"]])

    result = replace_suppliers_from_xlsx(db, workbook, company.id, dry_run=False)
    db.commit()

    archived = db.query(Supplier).filter(Supplier.id == old_supplier.id).one()
    po = db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == old_supplier.id).one()
    assert result["summary"]["archive_count"] == 1
    assert archived.status == "inactive"
    assert "Archived by Glenrock vendor replacement." in (archived.notes or "")
    assert po.supplier_id == old_supplier.id


def test_supplier_replacement_deletes_unreferenced_suppliers_and_removes_links():
    db = create_session()
    company = create_company(db, "Glenrock")
    old_supplier = create_supplier(db, company.id, "Legacy Stone")
    item = create_item(db)
    create_supplier_item(db, old_supplier.id, item.id)
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(workbook, [["301", "Fresh Vendor", "", "", "", "", "", "USA", "", "", "", "", "Net 45", "", "0"]])

    result = replace_suppliers_from_xlsx(
        db,
        workbook,
        company.id,
        allow_delete_unreferenced=True,
        dry_run=False,
    )
    db.commit()

    assert result["summary"]["delete_count"] == 1
    assert db.query(Supplier).filter(Supplier.id == old_supplier.id).first() is None
    assert db.query(SupplierItem).count() == 0


def test_supplier_replacement_maps_vendor_fields_into_supplier_record():
    db = create_session()
    company = create_company(db, "Glenrock")
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(
        workbook,
        [["401", "Quartz Supply", "14 First St", "Suite 2", "Clifton", "NJ", "07011", "USA", "555-1111", "", "sales@quartz.test", "Quinn", "Net 10", "QTZ", "1"]],
    )

    replace_suppliers_from_xlsx(db, workbook, company.id, dry_run=False)
    db.commit()

    created = db.query(Supplier).filter(Supplier.company_id == company.id, Supplier.name == "Quartz Supply").one()
    assert created.address == "14 First St, Suite 2, Clifton, NJ, 07011, USA"
    assert created.phone == "555-1111"
    assert created.email == "sales@quartz.test"
    assert created.contact_name == "Quinn"
    assert created.payment_terms == "Net 10"
    assert "vendor_number=401" in (created.notes or "")
    assert "vendor_peachtree_id=QTZ" in (created.notes or "")


def test_supplier_replacement_is_idempotent():
    db = create_session()
    company = create_company(db, "Glenrock")
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(
        workbook,
        [
            ["501", "Alpha Stone", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "ALPHA", "0"],
            ["502", "Beta Stone", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "BETA", "0"],
        ],
    )

    first = replace_suppliers_from_xlsx(db, workbook, company.id, dry_run=False)
    db.commit()
    second = replace_suppliers_from_xlsx(db, workbook, company.id, dry_run=False)
    db.commit()

    active_suppliers = db.query(Supplier).filter(Supplier.company_id == company.id, Supplier.status == "active").all()
    assert first["summary"]["create_count"] == 2
    assert second["summary"]["create_count"] == 0
    assert second["summary"]["update_count"] == 2
    assert sorted(supplier.name for supplier in active_suppliers) == ["Alpha Stone", "Beta Stone"]


def test_supplier_replacement_analysis_rejects_duplicate_vendor_names():
    db = create_session()
    company = create_company(db, "Glenrock")
    db.commit()

    workbook = create_workbook_path()
    write_vendor_workbook(
        workbook,
        [
            ["601", "Alpha Stone", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "", "0"],
            ["602", "Alpha Stone", "", "", "", "", "", "USA", "", "", "", "", "Net 30", "", "0"],
        ],
    )

    result = analyze_supplier_replacement(db, workbook, company.id)

    assert result["summary"]["error_rows"] == 1
    assert "Duplicate vendor name in workbook." in result["rows"][1]["messages"][0]
