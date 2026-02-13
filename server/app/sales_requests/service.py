from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from app.models import Customer, Invoice, Item, SalesRequest, SalesRequestLine, SupplierItem
from app.suppliers.service import get_supplier_link


def _next_request_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"SR-{year}-"
    latest = (
        db.query(SalesRequest.request_number)
        .filter(SalesRequest.request_number.like(f"{prefix}%"))
        .order_by(SalesRequest.id.desc())
        .first()
    )
    if latest and latest[0]:
        try:
            sequence = int(str(latest[0]).split("-")[-1]) + 1
        except (ValueError, TypeError):
            sequence = 1
    else:
        sequence = 1
    return f"{prefix}{sequence:04d}"


class InventoryQuantityExceededError(ValueError):
    def __init__(self, violations: list[dict]):
        self.violations = violations
        first = violations[0]
        super().__init__(
            f"Quantity exceeds available inventory for {first['item_name']} "
            f"(requested {first['requested_qty']}, available {first['available_qty']})."
        )



def create_sales_request(db: Session, payload: dict) -> SalesRequest:
    lines_payload = payload.pop("lines")
    customer_id = payload.get("customer_id")
    customer_name = (payload.get("customer_name") or "").strip() or None

    if customer_id:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise ValueError("Customer not found.")
        payload["customer_name"] = customer.name
    else:
        payload["customer_name"] = customer_name

    payload["request_number"] = _next_request_number(db)
    payload.setdefault("status", "OPEN")

    sales_request = SalesRequest(**payload)
    sales_request.lines = []

    inventory_violations = []
    for line in lines_payload:
        item = db.query(Item).filter(Item.id == line["item_id"]).first()
        if not item:
            raise ValueError("One or more selected items no longer exist.")

        quantity = Decimal(str(line["quantity"]))
        if quantity > item.available_qty:
            inventory_violations.append(
                {
                    "item_id": item.id,
                    "item_name": item.name,
                    "requested_qty": str(quantity),
                    "available_qty": str(item.available_qty),
                }
            )

        unit_price = Decimal(str(line["unit_price"]))
        line_total = quantity * unit_price
        sales_request.lines.append(
            SalesRequestLine(
                item_id=item.id,
                item_name=item.name,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    if inventory_violations:
        raise InventoryQuantityExceededError(inventory_violations)

    db.add(sales_request)
    return sales_request


def calculate_sales_request_total(sales_request: SalesRequest) -> Decimal:
    return sum((Decimal(line.line_total or 0) for line in sales_request.lines), Decimal("0"))


def update_sales_request_status(sales_request: SalesRequest, status: str):
    sales_request.status = status


def get_sales_request_detail(db: Session, sales_request_id: int) -> Optional[dict]:
    """Load a sales request enriched with inventory availability and supplier options per line."""
    sales_request = (
        db.query(SalesRequest)
        .options(
            selectinload(SalesRequest.lines)
            .selectinload(SalesRequestLine.item)
            .selectinload(Item.supplier_items)
            .selectinload(SupplierItem.supplier)
        )
        .filter(SalesRequest.id == sales_request_id)
        .first()
    )
    if not sales_request:
        return None

    enriched_lines = []
    for line in sales_request.lines:
        item = line.item
        supplier_options = []
        if item:
            for si in item.supplier_items:
                supplier_options.append({
                    "supplier_id": si.supplier_id,
                    "supplier_name": si.supplier.name if si.supplier else "Unknown",
                    "supplier_cost": si.supplier_cost,
                    "freight_cost": si.freight_cost,
                    "tariff_cost": si.tariff_cost,
                    "landed_cost": si.landed_cost,
                    "is_preferred": si.is_preferred,
                    "lead_time_days": si.lead_time_days,
                })
        enriched_lines.append({
            "id": line.id,
            "item_id": line.item_id,
            "item_name": line.item_name,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "line_total": line.line_total,
            "on_hand_qty": item.on_hand_qty if item else Decimal(0),
            "reserved_qty": item.reserved_qty if item else Decimal(0),
            "available_qty": item.available_qty if item else Decimal(0),
            "supplier_options": supplier_options,
        })

    linked_invoice = (
        db.query(Invoice)
        .filter(Invoice.sales_request_id == sales_request.id)
        .first()
    )

    return {
        "sales_request": sales_request,
        "enriched_lines": enriched_lines,
        "linked_invoice_id": linked_invoice.id if linked_invoice else None,
        "linked_invoice_number": linked_invoice.invoice_number if linked_invoice else None,
    }


def generate_invoice_from_sales_request(
    db: Session,
    sales_request: SalesRequest,
    payload: dict,
) -> Invoice:
    """Generate a DRAFT invoice from a fulfilled sales request."""
    from app.sales.service import create_invoice

    if not sales_request.customer_id:
        raise ValueError(
            "Cannot generate invoice for a walk-in customer without a linked customer record. "
            "Please assign a customer first."
        )

    existing = (
        db.query(Invoice)
        .filter(Invoice.sales_request_id == sales_request.id)
        .first()
    )
    if existing:
        raise ValueError(
            f"An invoice ({existing.invoice_number}) already exists for this sales request."
        )

    line_map = {line.id: line for line in sales_request.lines}
    markup = Decimal(str(payload["markup_percent"])) / Decimal("100")

    invoice_lines_data = []
    for sel in payload["line_selections"]:
        sr_line = line_map.get(sel["sales_request_line_id"])
        if not sr_line:
            raise ValueError(
                f"Sales request line {sel['sales_request_line_id']} not found."
            )

        supplier_id = sel.get("supplier_id")
        unit_cost = sel.get("unit_cost")

        # Resolve cost from supplier if not overridden
        if unit_cost is None and supplier_id:
            link = get_supplier_link(db, sr_line.item_id, supplier_id)
            if link:
                unit_cost = link.landed_cost
        if unit_cost is None:
            link = get_supplier_link(db, sr_line.item_id, None)
            if link:
                unit_cost = link.landed_cost

        # Determine unit_price: use override, or apply markup to cost, or fall back to SR price
        unit_price = sel.get("unit_price")
        if unit_price is None:
            if unit_cost is not None:
                unit_price = Decimal(str(unit_cost)) * (Decimal("1") + markup)
            else:
                unit_price = sr_line.unit_price

        invoice_lines_data.append({
            "item_id": sr_line.item_id,
            "description": sr_line.item_name,
            "quantity": sr_line.quantity,
            "unit_price": unit_price,
            "unit_cost": Decimal(str(unit_cost)) if unit_cost is not None else None,
            "supplier_id": supplier_id,
            "discount": Decimal(str(sel.get("discount", 0))),
            "tax_rate": Decimal(str(sel.get("tax_rate", 0))),
        })

    invoice_payload = {
        "customer_id": sales_request.customer_id,
        "issue_date": payload["issue_date"],
        "due_date": payload["due_date"],
        "notes": payload.get("notes"),
        "terms": payload.get("terms"),
        "line_items": invoice_lines_data,
    }
    invoice = create_invoice(db, invoice_payload)
    invoice.sales_request_id = sales_request.id

    # Mark the sales request as closed
    sales_request.status = "CLOSED"

    return invoice
