import csv
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.models import Customer, Invoice, InvoiceLine, Item
from app.module_keys import ModuleKey


router = APIRouter(
    prefix="/api/invoices",
    tags=["invoices-import"],
    dependencies=[Depends(require_module(ModuleKey.INVOICES.value))],
)


class SalesImportFieldSpec(BaseModel):
    field: str
    label: str
    required: bool
    description: str
    example: Optional[str] = None


class SalesImportFormatResponse(BaseModel):
    delimiter: str
    has_header: bool
    sales_required_fields: list[str]
    sales_optional_fields: list[str]
    sales_fields: list[SalesImportFieldSpec]
    line_required_fields: list[str]
    line_optional_fields: list[str]
    line_fields: list[SalesImportFieldSpec]
    sales_sample_csv: str
    line_sample_csv: str
    notes: list[str]


class SalesImportRequest(BaseModel):
    sales_csv: str
    sales_inventory_csv: str
    has_header: bool = True


class SalesImportSummary(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    create_count: int
    update_count: int
    skip_count: int
    sales_rows: int
    line_rows: int


class SalesImportRowResult(BaseModel):
    source: Literal["SALES", "LINE"]
    row_number: int
    sales_order_number: Optional[str] = None
    invoice_number: Optional[str] = None
    customer_number: Optional[str] = None
    item_code: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    action: Literal["CREATE", "UPDATE", "SKIP", "ERROR"]
    status: Literal["VALID", "ERROR"]
    messages: list[str]


class SalesImportRecord(BaseModel):
    id: int
    invoice_number: str
    customer_name: str
    line_count: int
    action: Literal["CREATED"]


class SalesImportResponse(BaseModel):
    summary: SalesImportSummary
    rows: list[SalesImportRowResult]
    imported_invoices: list[SalesImportRecord]


SALES_HEADER_ALIASES = {
    "sales order number": "sales_order_number",
    "order date": "order_date",
    "sales person": "sales_person",
    "customer number": "customer_number",
    "customer po number": "customer_po_number",
    "comments": "comments",
    "p.o. number": "po_number",
    "po number": "po_number",
    "convertflag": "convert_flag",
    "invoice number": "invoice_number",
    "invoice date": "invoice_date",
    "pay by date": "pay_by_date",
    "discount rate": "discount_rate",
    "invoicetotal": "invoice_total",
    "invoicepayment": "invoice_payment",
    "backorder": "back_order",
    "senttopeachtree": "sent_to_peachtree",
    "officecomment": "office_comment",
    "paid": "paid",
    "deliverto": "deliver_to",
    "shiplabel": "ship_label",
    "printlabel": "print_label",
}

LINE_HEADER_ALIASES = {
    "sales order number": "sales_order_number",
    "item code": "item_code",
    "quantity": "quantity",
    "sell price": "sell_price",
    "sinvamount": "line_amount",
    "family name": "family_name",
    "item status": "item_status",
    "convertflag": "convert_flag",
    "carrier": "carrier",
    "freight rate": "freight_rate",
    "inv updated": "inv_updated",
    "invoicenumber": "invoice_number",
    "invoice number": "invoice_number",
    "ship to name": "ship_to_name",
    "shipping address": "shipping_address",
    "city": "city",
    "state": "state",
    "zipcode": "zip_code",
    "discountrate": "discount_rate",
    "discount rate": "discount_rate",
    "oceanfreightsurcharge": "ocean_freight_surcharge",
    "ocean freight surcharge": "ocean_freight_surcharge",
    "marked": "marked",
}

SALES_FIELD_SPECS = [
    SalesImportFieldSpec(field="sales_order_number", label="Sales Order Number", required=True, description="Legacy sales order number used to join header and line files.", example="3078"),
    SalesImportFieldSpec(field="order_date", label="Order Date", required=True, description="Original sales order date.", example="3/13/2001"),
    SalesImportFieldSpec(field="customer_number", label="Customer Number", required=True, description="Existing customer master key from the Customers module.", example="570"),
    SalesImportFieldSpec(field="invoice_number", label="Invoice Number", required=True, description="Invoice number to create in Bedrock.", example="5386"),
    SalesImportFieldSpec(field="invoice_date", label="Invoice Date", required=True, description="Legacy invoice date.", example="7/31/2001"),
    SalesImportFieldSpec(field="pay_by_date", label="Pay By Date", required=False, description="Legacy due date.", example="8/30/2001"),
    SalesImportFieldSpec(field="invoice_total", label="InvoiceTotal", required=True, description="Legacy invoice total for reconciliation.", example="$3,140.00"),
    SalesImportFieldSpec(field="invoice_payment", label="InvoicePayment", required=False, description="Legacy payment amount retained as a note in phase 1.", example="$1,220.00"),
    SalesImportFieldSpec(field="paid", label="Paid", required=False, description="Legacy paid flag retained as a note in phase 1.", example="TRUE"),
    SalesImportFieldSpec(field="comments", label="Comments", required=False, description="Legacy customer-facing comments."),
    SalesImportFieldSpec(field="po_number", label="P.O. Number", required=False, description="Linked procurement reference."),
    SalesImportFieldSpec(field="office_comment", label="OfficeComment", required=False, description="Internal legacy notes."),
]

LINE_FIELD_SPECS = [
    SalesImportFieldSpec(field="sales_order_number", label="Sales Order Number", required=True, description="Header join key.", example="3078"),
    SalesImportFieldSpec(field="item_code", label="Item Code", required=True, description="Existing Glenrock item code / SKU from the Items module.", example="1267"),
    SalesImportFieldSpec(field="quantity", label="Quantity", required=True, description="Sold quantity.", example="9"),
    SalesImportFieldSpec(field="sell_price", label="Sell Price", required=True, description="Unit selling price.", example="$240.00"),
    SalesImportFieldSpec(field="line_amount", label="SInvAmount", required=False, description="Legacy line amount for reconciliation.", example="$2,160.00"),
    SalesImportFieldSpec(field="invoice_number", label="InvoiceNumber", required=False, description="Legacy invoice number repeated on the line file."),
    SalesImportFieldSpec(field="family_name", label="Family Name", required=False, description="Legacy family grouping used as descriptive context."),
    SalesImportFieldSpec(field="item_status", label="Item Status", required=False, description="Legacy status field."),
]

SALES_SAMPLE_CSV = "\n".join(
    [
        "Sales Order Number,Order Date,Sales Person,Customer Number,Customer PO Number,Comments,P.O. Number,ConvertFlag,Invoice Number,Invoice Date,Pay By Date,Discount Rate,InvoiceTotal,InvoicePayment,BackOrder,SentToPeachTree,OfficeComment,Paid,DeliverTo,ShipLabel,PrintLabel",
        '3078,3/13/2001,MIKE,570,,3 MONTHS DELIVERY TIME,GR-08/2001,TRUE,5386,7/31/2001,8/30/2001,$183.00,"$3,140.00","$1,220.00",FALSE,FALSE,,TRUE,,TRUE,FALSE',
    ]
)

LINE_SAMPLE_CSV = "\n".join(
    [
        "Sales Order Number,Item Code,Quantity,Sell Price,SInvAmount,Family Name,Item Status,ConvertFlag,Carrier,Family Name,Freight Rate,Inv Updated,InvoiceNumber,Ship To Name,Shipping Address,Shipping Address,City,State,Zipcode,DiscountRate,OceanFreightSurcharge,Marked",
        '3078,1267,9,$240.00,"$2,160.00",ABRAMOV 2010236,SHIPPED,TRUE,,ABRAMOV 2010236,$0.00,TRUE,5386,,,,,,,0,$0.00,FALSE',
    ]
)


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
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    return None


def _parse_date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _chunked_values(values: list[str], size: int = 900) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


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
        if canonical and canonical not in header_map:
            header_map[canonical] = field_name

    for required_field in required_fields:
        if required_field not in header_map:
            raise HTTPException(status_code=400, detail=f"Missing required {label} CSV header: {required_field}")

    rows: list[dict[str, Any]] = []
    for row_number, raw_row in enumerate(reader, start=2):
        parsed_row: dict[str, Any] = {"row_number": row_number}
        for field in ordered_fields:
            parsed_row[field] = raw_row.get(header_map.get(field, ""), "")
        rows.append(parsed_row)
    return rows


def _build_invoice_notes(header_row: dict[str, Any]) -> Optional[str]:
    parts: list[str] = []
    for label, field in [
        ("Legacy Sales Order", "sales_order_number"),
        ("Sales Person", "sales_person"),
        ("Customer PO Number", "customer_po_number"),
        ("Comments", "comments"),
        ("Procurement PO", "po_number"),
        ("Legacy Payment Amount", "invoice_payment"),
        ("Legacy Paid Flag", "paid"),
        ("BackOrder", "back_order"),
        ("SentToPeachTree", "sent_to_peachtree"),
        ("DeliverTo", "deliver_to"),
        ("ShipLabel", "ship_label"),
        ("PrintLabel", "print_label"),
        ("OfficeComment", "office_comment"),
    ]:
        value = _normalize_nullable_string(header_row.get(field))
        if value:
            parts.append(f"{label}: {value}")
    return "\n".join(parts) if parts else None


def _sales_import_format_response() -> SalesImportFormatResponse:
    return SalesImportFormatResponse(
        delimiter=",",
        has_header=True,
        sales_required_fields=["sales_order_number", "order_date", "customer_number", "invoice_number", "invoice_date", "invoice_total"],
        sales_optional_fields=["sales_person", "customer_po_number", "comments", "po_number", "pay_by_date", "discount_rate", "invoice_payment", "back_order", "sent_to_peachtree", "office_comment", "paid", "deliver_to", "ship_label", "print_label"],
        sales_fields=SALES_FIELD_SPECS,
        line_required_fields=["sales_order_number", "item_code", "quantity", "sell_price"],
        line_optional_fields=["line_amount", "invoice_number", "family_name", "item_status"],
        line_fields=LINE_FIELD_SPECS,
        sales_sample_csv=SALES_SAMPLE_CSV,
        line_sample_csv=LINE_SAMPLE_CSV,
        notes=[
            "Upload both Sales2.csv and Sales-Inventory2.csv together.",
            "Customer Number must already exist in the Customers module.",
            "Item Code must already exist in the Items module and matches item_code first, then SKU.",
            "Phase 1 creates invoices and invoice lines only. It does not create payments or inventory movements.",
            "Invoice totals are validated against the summed sales lines before import is allowed.",
        ],
    )


def _analyze_sales_import(payload: SalesImportRequest, db: Session) -> dict[str, Any]:
    sales_rows = _parse_csv_rows(
        payload.sales_csv,
        payload.has_header,
        SALES_HEADER_ALIASES,
        ["sales_order_number", "order_date", "customer_number", "invoice_number", "invoice_date", "invoice_total"],
        [spec.field for spec in SALES_FIELD_SPECS] + [field for field in SALES_HEADER_ALIASES.values() if field not in {spec.field for spec in SALES_FIELD_SPECS}],
        "Sales",
    )
    line_rows = _parse_csv_rows(
        payload.sales_inventory_csv,
        payload.has_header,
        LINE_HEADER_ALIASES,
        ["sales_order_number", "item_code", "quantity", "sell_price"],
        [spec.field for spec in LINE_FIELD_SPECS] + [field for field in LINE_HEADER_ALIASES.values() if field not in {spec.field for spec in LINE_FIELD_SPECS}],
        "Sales Inventory",
    )

    sales_by_order = {
        str(row["sales_order_number"]).strip(): row
        for row in sales_rows
        if _normalize_nullable_string(row.get("sales_order_number"))
    }
    lines_by_order: dict[str, list[dict[str, Any]]] = {}
    for row in line_rows:
        order_number = _normalize_nullable_string(row.get("sales_order_number"))
        if not order_number:
            continue
        lines_by_order.setdefault(order_number, []).append(row)

    customer_numbers = {
        str(row["customer_number"]).strip()
        for row in sales_rows
        if _normalize_nullable_string(row.get("customer_number"))
    }
    item_codes = {
        str(row["item_code"]).strip()
        for row in line_rows
        if _normalize_nullable_string(row.get("item_code"))
    }

    customers = {}
    customer_number_list = list(customer_numbers)
    for chunk in _chunked_values(customer_number_list):
        for customer in db.query(Customer).filter(Customer.customer_number.in_(chunk)).all():
            if customer.customer_number:
                customers[str(customer.customer_number)] = customer
    items = {}
    item_code_list = list(item_codes)
    for chunk in _chunked_values(item_code_list):
        for item in db.query(Item).filter((Item.item_code.in_(chunk)) | (Item.sku.in_(chunk))).all():
            if item.item_code:
                items[str(item.item_code)] = item
            if item.sku:
                items.setdefault(str(item.sku), item)

    existing_invoices: set[str] = set()
    invoice_number_values = [
        str(row["invoice_number"]).strip()
        for row in sales_rows
        if _normalize_nullable_string(row.get("invoice_number"))
    ]
    for chunk in _chunked_values(invoice_number_values):
        for invoice in db.query(Invoice).filter(Invoice.invoice_number.in_(chunk)).all():
            existing_invoices.add(invoice.invoice_number)

    sales_order_counts: dict[str, int] = {}
    for row in sales_rows:
        order_number = _normalize_nullable_string(row.get("sales_order_number"))
        if order_number:
            sales_order_counts[order_number] = sales_order_counts.get(order_number, 0) + 1

    rows: list[SalesImportRowResult] = []
    create_count = 0
    skip_count = 0
    seen_invoices: set[str] = set()
    prepared_documents: list[dict[str, Any]] = []
    valid_sales_orders: set[str] = set()
    skipped_sales_orders: set[str] = set()

    for row in sales_rows:
        row_number = row["row_number"]
        order_number = _normalize_nullable_string(row.get("sales_order_number"))
        customer_number = _normalize_nullable_string(row.get("customer_number"))
        messages: list[str] = []
        skip_messages: list[str] = []
        normalized_line_rows: list[SalesImportRowResult] = []

        customer = customers.get(customer_number or "")
        if not customer:
            messages.append("Customer Number does not match an existing customer.")

        if not order_number:
            messages.append("Sales Order Number is required.")
        elif sales_order_counts.get(order_number, 0) > 1:
            messages.append("Sales Order Number is duplicated in the upload.")

        associated_lines = lines_by_order.get(order_number or "", [])
        line_invoice_numbers = sorted(
            {
                value
                for line in associated_lines
                if (value := _normalize_nullable_string(line.get("invoice_number"))) and value != "0"
            }
        )
        invoice_number = _normalize_nullable_string(row.get("invoice_number")) or (
            line_invoice_numbers[0] if len(line_invoice_numbers) == 1 else None
        )
        if not invoice_number:
            skip_messages.append("Skipped because no invoice number is available for this sales order.")
        elif invoice_number in existing_invoices:
            messages.append("Invoice Number already exists in Bedrock.")
        elif invoice_number in seen_invoices:
            messages.append("Invoice Number is duplicated in the upload.")

        order_date = _parse_date(_normalize_nullable_string(row.get("order_date")))
        if not order_date:
            messages.append("Order Date is invalid.")

        invoice_date = _parse_date(_normalize_nullable_string(row.get("invoice_date"))) or order_date
        if not invoice_date:
            skip_messages.append("Skipped because no invoice date is available for this sales order.")

        due_date = _parse_date(_normalize_nullable_string(row.get("pay_by_date"))) or invoice_date or order_date
        if not due_date:
            messages.append("Pay By Date is invalid.")

        if not associated_lines:
            skip_messages.append("Skipped because no sales lines were found for this Sales Order Number.")

        prepared_lines: list[dict[str, Any]] = []
        computed_total = Decimal("0.00")
        for line in associated_lines:
            line_messages: list[str] = []
            line_info_messages: list[str] = []
            item_code = _normalize_nullable_string(line.get("item_code"))
            item = items.get(item_code or "")
            if not item:
                line_messages.append("Item Code does not match an existing item.")

            quantity = _parse_decimal(_normalize_nullable_string(line.get("quantity")))
            unit_price = _parse_decimal(_normalize_nullable_string(line.get("sell_price")))
            line_amount = _parse_decimal(_normalize_nullable_string(line.get("line_amount")))

            if quantity is not None and quantity < 0:
                quantity = abs(quantity)
                line_info_messages.append("Quantity normalized from a negative legacy value.")

            if quantity is None or quantity == 0:
                if line_amount and line_amount > 0:
                    quantity = Decimal("1")
                    line_info_messages.append("Quantity defaulted to 1 from legacy sales amount.")
                elif unit_price and unit_price > 0:
                    quantity = Decimal("1")
                    line_info_messages.append("Quantity defaulted to 1 from legacy unit price.")
                else:
                    normalized_line_rows.append(
                        SalesImportRowResult(
                            source="LINE",
                            row_number=line["row_number"],
                            sales_order_number=order_number,
                            invoice_number=_normalize_nullable_string(line.get("invoice_number")),
                            item_code=item_code,
                            quantity=quantity,
                            unit_price=unit_price,
                            action="SKIP",
                            status="VALID",
                            messages=["Skipped because the line has no usable quantity or amount."],
                        )
                    )
                    continue

            if line_amount is not None and line_amount < 0:
                line_amount = abs(line_amount)
                line_info_messages.append("Line amount normalized from a negative legacy value.")

            if unit_price is not None and unit_price < 0:
                unit_price = abs(unit_price)
                line_info_messages.append("Sell Price normalized from a negative legacy value.")

            if (unit_price is None or unit_price == 0) and line_amount is not None and quantity and quantity > 0:
                unit_price = _quantize_money(line_amount / quantity)
                line_info_messages.append("Sell Price inferred from legacy sales amount.")

            if unit_price is None or unit_price < 0:
                normalized_line_rows.append(
                    SalesImportRowResult(
                        source="LINE",
                        row_number=line["row_number"],
                        sales_order_number=order_number,
                        invoice_number=_normalize_nullable_string(line.get("invoice_number")),
                        item_code=item_code,
                        quantity=quantity,
                        unit_price=unit_price,
                        action="SKIP",
                        status="VALID",
                        messages=["Skipped because the line has no usable sell price or amount."],
                    )
                )
                continue

            if line_amount is None:
                line_amount = _quantize_money((quantity or Decimal("0")) * unit_price)

            line_invoice_number = _normalize_nullable_string(line.get("invoice_number"))
            if line_invoice_number and invoice_number and line_invoice_number != invoice_number:
                line_info_messages.append("Line invoice number differed from the sales header and the header value was used.")

            if line_messages:
                messages.extend([f"Line {line['row_number']}: {message}" for message in line_messages])
                continue

            computed_total += line_amount
            prepared_lines.append(
                {
                    "row_number": line["row_number"],
                    "item": item,
                    "item_code": item_code,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_amount,
                    "description": _normalize_nullable_string(line.get("family_name")) or (item.name if item else item_code),
                }
            )
            normalized_line_rows.append(
                SalesImportRowResult(
                    source="LINE",
                    row_number=line["row_number"],
                    sales_order_number=order_number,
                    invoice_number=line_invoice_number or invoice_number,
                    item_code=item_code,
                    quantity=quantity,
                    unit_price=unit_price,
                    action="CREATE",
                    status="VALID",
                    messages=line_info_messages or ["Ready to attach to invoice."],
                )
            )

        invoice_total = _parse_decimal(_normalize_nullable_string(row.get("invoice_total")))
        if invoice_total is None:
            invoice_total = _quantize_money(computed_total) if computed_total > 0 else None
        if invoice_total is None:
            skip_messages.append("Skipped because no invoice total or usable sales lines are available.")
        elif invoice_total < 0:
            invoice_total = abs(invoice_total)

        if not prepared_lines:
            skip_messages.append("Skipped because no usable sales lines remain after legacy normalization.")

        variance_note = None
        if invoice_total is not None and prepared_lines and abs(invoice_total - computed_total) > Decimal("0.01"):
            variance_note = f"Legacy header total differed from summed lines by {invoice_total - computed_total:+.2f}."

        if messages:
            rows.append(
                SalesImportRowResult(
                    source="SALES",
                    row_number=row_number,
                    sales_order_number=order_number,
                    invoice_number=invoice_number,
                    customer_number=customer_number,
                    action="ERROR",
                    status="ERROR",
                    messages=messages,
                )
            )
            continue

        if skip_messages:
            skipped_sales_orders.add(order_number or "")
            skip_count += 1
            rows.append(
                SalesImportRowResult(
                    source="SALES",
                    row_number=row_number,
                    sales_order_number=order_number,
                    invoice_number=invoice_number,
                    customer_number=customer_number,
                    action="SKIP",
                    status="VALID",
                    messages=skip_messages,
                )
            )
            rows.extend(normalized_line_rows)
            continue

        seen_invoices.add(invoice_number or "")
        valid_sales_orders.add(order_number or "")
        create_count += 1
        rows.append(
            SalesImportRowResult(
                source="SALES",
                row_number=row_number,
                sales_order_number=order_number,
                invoice_number=invoice_number,
                customer_number=customer_number,
                action="CREATE",
                status="VALID",
                messages=[variance_note] if variance_note else ["Ready to create invoice and invoice lines."],
            )
        )
        rows.extend(normalized_line_rows)
        prepared_documents.append(
            {
                "header": row,
                "customer": customer,
                "invoice_number": invoice_number,
                "issue_date": invoice_date,
                "due_date": due_date,
                "invoice_total": invoice_total,
                "line_subtotal": _quantize_money(computed_total),
                "variance_note": variance_note,
                "prepared_lines": prepared_lines,
            }
        )

    handled_line_rows = {row.row_number for row in rows if row.source == "LINE"}
    for line in line_rows:
        if line["row_number"] in handled_line_rows:
            continue
        order_number = _normalize_nullable_string(line.get("sales_order_number"))
        invoice_number = _normalize_nullable_string(line.get("invoice_number"))
        item_code = _normalize_nullable_string(line.get("item_code"))
        quantity = _parse_decimal(_normalize_nullable_string(line.get("quantity")))
        unit_price = _parse_decimal(_normalize_nullable_string(line.get("sell_price")))
        if not order_number or order_number not in sales_by_order:
            rows.append(
                SalesImportRowResult(
                    source="LINE",
                    row_number=line["row_number"],
                    sales_order_number=order_number,
                    invoice_number=invoice_number,
                    item_code=item_code,
                    quantity=quantity,
                    unit_price=unit_price,
                    action="ERROR",
                    status="ERROR",
                    messages=["Sales Order Number does not match a row in Sales2.csv."],
                )
            )
        elif order_number in skipped_sales_orders:
            rows.append(
                SalesImportRowResult(
                    source="LINE",
                    row_number=line["row_number"],
                    sales_order_number=order_number,
                    invoice_number=invoice_number,
                    item_code=item_code,
                    quantity=quantity,
                    unit_price=unit_price,
                    action="SKIP",
                    status="VALID",
                    messages=["Skipped because the related sales header was not importable as an invoice."],
                )
            )
        elif order_number not in valid_sales_orders:
            rows.append(
                SalesImportRowResult(
                    source="LINE",
                    row_number=line["row_number"],
                    sales_order_number=order_number,
                    invoice_number=invoice_number,
                    item_code=item_code,
                    quantity=quantity,
                    unit_price=unit_price,
                    action="ERROR",
                    status="ERROR",
                    messages=["Sales header row for this Sales Order Number has validation errors."],
                )
            )

    summary = SalesImportSummary(
        total_rows=len(sales_rows) + len(line_rows),
        valid_rows=sum(1 for row in rows if row.status == "VALID"),
        error_rows=sum(1 for row in rows if row.status == "ERROR"),
        create_count=create_count,
        update_count=0,
        skip_count=skip_count + sum(1 for row in rows if row.source == "LINE" and row.action == "SKIP"),
        sales_rows=len(sales_rows),
        line_rows=len(line_rows),
    )

    return {"summary": summary, "rows": rows, "prepared_documents": prepared_documents}


@router.get("/import-format", response_model=SalesImportFormatResponse)
def get_sales_import_format() -> SalesImportFormatResponse:
    return _sales_import_format_response()


@router.post("/import-preview", response_model=SalesImportResponse)
def preview_sales_import(payload: SalesImportRequest, db: Session = Depends(get_db)) -> SalesImportResponse:
    analysis = _analyze_sales_import(payload, db)
    return SalesImportResponse(
        summary=analysis["summary"],
        rows=analysis["rows"],
        imported_invoices=[],
    )


@router.post("/import", response_model=SalesImportResponse, status_code=201)
def execute_sales_import(payload: SalesImportRequest, db: Session = Depends(get_db)) -> SalesImportResponse:
    analysis = _analyze_sales_import(payload, db)
    summary: SalesImportSummary = analysis["summary"]
    if summary.error_rows > 0:
        raise HTTPException(status_code=400, detail="Resolve validation errors before importing sales.")

    imported_records: list[SalesImportRecord] = []
    for document in analysis["prepared_documents"]:
        subtotal = document["line_subtotal"]
        invoice_total = document["invoice_total"]
        tax_total = invoice_total - subtotal if invoice_total >= subtotal else Decimal("0.00")
        notes = _build_invoice_notes(document["header"])
        if document.get("variance_note"):
            notes = f"{notes}\n{document['variance_note']}" if notes else document["variance_note"]
        invoice = Invoice(
            customer_id=document["customer"].id,
            invoice_number=document["invoice_number"],
            status="DRAFT",
            issue_date=document["issue_date"],
            due_date=document["due_date"],
            notes=notes,
            terms=None,
            subtotal=subtotal if invoice_total >= subtotal else invoice_total,
            tax_total=tax_total,
            total=invoice_total,
            amount_due=invoice_total,
        )
        db.add(invoice)
        db.flush()

        for prepared_line in document["prepared_lines"]:
            item = prepared_line["item"]
            line_total = prepared_line["line_total"]
            db.add(InvoiceLine(
                invoice_id=invoice.id,
                item_id=item.id if item else None,
                description=prepared_line["description"],
                quantity=prepared_line["quantity"],
                unit_price=prepared_line["unit_price"],
                unit_cost=item.cost_price if item else None,
                landed_unit_cost=item.cost_price if item and item.cost_price is not None else Decimal("0.00"),
                supplier_id=item.preferred_supplier_id if item else None,
                discount=Decimal("0.00"),
                tax_rate=Decimal("0.0000"),
                line_total=line_total,
            ))

        db.flush()
        imported_records.append(SalesImportRecord(
            id=invoice.id,
            invoice_number=invoice.invoice_number,
            customer_name=document["customer"].name,
            line_count=len(document["prepared_lines"]),
            action="CREATED",
        ))

    db.commit()
    return SalesImportResponse(
        summary=summary,
        rows=analysis["rows"],
        imported_invoices=imported_records,
    )
