from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session, selectinload

from app.inventory.service import (
    SOURCE_SALES_REQUEST,
    get_available_qty,
    get_reserved_qty,
    get_source_reserved_qty_map,
    sync_reservations_for_source,
)
from app.models import AuditEvent, Company, Customer, Inventory, Invoice, Item, SalesRequest, SalesRequestLine, SupplierItem, User
from app.suppliers.service import get_supplier_link


SALES_REQUEST_STATUS_FLOW = ["NEW", "QUOTED", "CONFIRMED", "INVOICED", "SHIPPED", "CLOSED"]
SALES_REQUEST_TERMINAL_STATUSES = {"LOST", "CANCELLED", "CLOSED"}


def _status_rank(status: str) -> int:
    try:
        return SALES_REQUEST_STATUS_FLOW.index(status)
    except ValueError:
        return -1


def should_reserve_inventory_for_status(status: str) -> bool:
    return _status_rank(status) >= _status_rank("CONFIRMED") and status not in SALES_REQUEST_TERMINAL_STATUSES


def get_allowed_sales_request_status_transitions(sales_request: SalesRequest) -> list[str]:
    status = sales_request.status
    if status in SALES_REQUEST_TERMINAL_STATUSES:
        return []

    transitions: list[str] = []
    rank = _status_rank(status)
    if rank >= 0 and rank < len(SALES_REQUEST_STATUS_FLOW) - 1:
        transitions.append(SALES_REQUEST_STATUS_FLOW[rank + 1])

    transitions.extend(["LOST", "CANCELLED"])
    if status != "CLOSED":
        transitions.append("CLOSED")
    return transitions


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


def _get_default_company_id(db: Session) -> int:
    return db.query(Company.id).order_by(Company.id.asc()).scalar() or 1


def _resolve_created_by_user_id(db: Session, created_by_user_id: Optional[int]) -> Optional[int]:
    if created_by_user_id is None:
        return None
    exists = (
        db.query(User.id)
        .filter(User.id == created_by_user_id)
        .scalar()
    )
    return created_by_user_id if exists is not None else None


class InventoryQuantityExceededError(ValueError):
    def __init__(self, violations: list[dict]):
        self.violations = violations
        first = violations[0]
        super().__init__(
            f"Quantity exceeds available inventory for {first['item_name']} "
            f"(requested {first['requested_qty']}, available {first['available_qty']})."
        )


class MissingInventoryRecordError(ValueError):
    pass


class InsufficientInventoryError(ValueError):
    pass


class SalesRequestImmutableError(ValueError):
    pass


def _sync_sales_request_reservations(db: Session, sales_request: SalesRequest) -> None:
    if not should_reserve_inventory_for_status(sales_request.status):
        sync_reservations_for_source(
            db,
            source_type=SOURCE_SALES_REQUEST,
            source_id=sales_request.id,
            item_qty_map={},
        )
        return

    item_qty_map: dict[int, Decimal] = {}
    for line in sales_request.lines:
        item_qty_map[line.item_id] = item_qty_map.get(line.item_id, Decimal("0")) + Decimal(line.quantity or 0)
    sync_reservations_for_source(
        db,
        source_type=SOURCE_SALES_REQUEST,
        source_id=sales_request.id,
        item_qty_map=item_qty_map,
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
    payload.setdefault("status", "NEW")
    payload["created_by_user_id"] = _resolve_created_by_user_id(db, payload.get("created_by_user_id"))

    sales_request = SalesRequest(**payload)
    sales_request.lines = []

    inventory_violations = []
    company_id = _get_default_company_id(db)
    for line in lines_payload:
        item = db.query(Item).filter(Item.id == line["item_id"]).first()
        if not item:
            raise ValueError("One or more selected items no longer exist.")

        quantity = Decimal(str(line["quantity"]))
        available_qty = get_available_qty(db, item.id, company_id=company_id)
        if quantity > available_qty:
            inventory_violations.append(
                {
                    "item_id": item.id,
                    "item_name": item.name,
                    "requested_qty": str(quantity),
                    "available_qty": str(available_qty),
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
    db.flush()
    _sync_sales_request_reservations(db, sales_request)
    return sales_request


def update_open_sales_request(db: Session, sales_request: SalesRequest, payload: dict) -> SalesRequest:
    if sales_request.status not in {"NEW", "QUOTED"}:
        raise SalesRequestImmutableError("Only NEW or QUOTED sales requests can be edited.")

    existing_invoice = db.query(Invoice.id).filter(Invoice.sales_request_id == sales_request.id).scalar()
    if existing_invoice is not None:
        raise SalesRequestImmutableError("Sales request cannot be edited after an invoice is generated.")

    customer_id = payload.get("customer_id")
    customer_name = (payload.get("customer_name") or "").strip() or None
    if customer_id:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise ValueError("Customer not found.")
        sales_request.customer_id = customer.id
        sales_request.customer_name = customer.name
    else:
        sales_request.customer_id = None
        sales_request.customer_name = customer_name

    sales_request.notes = payload.get("notes")
    sales_request.requested_fulfillment_date = payload.get("requested_fulfillment_date")

    line_items = payload["line_items"]
    inventory_violations = []
    company_id = _get_default_company_id(db)
    new_lines: list[SalesRequestLine] = []
    current_reserved_by_item = get_source_reserved_qty_map(
        db,
        source_type=SOURCE_SALES_REQUEST,
        source_id=sales_request.id,
    )

    for line in line_items:
        item = db.query(Item).filter(Item.id == line["item_id"]).first()
        if not item:
            raise ValueError("One or more selected items no longer exist.")

        quantity = Decimal(str(line["quantity"]))
        available_qty = get_available_qty(db, item.id, company_id=company_id) + current_reserved_by_item.get(item.id, Decimal("0"))
        if quantity > available_qty:
            inventory_violations.append(
                {
                    "item_id": item.id,
                    "item_name": item.name,
                    "requested_qty": str(quantity),
                    "available_qty": str(available_qty),
                }
            )

        unit_price = Decimal(str(line["requested_price"]))
        new_lines.append(
            SalesRequestLine(
                item_id=item.id,
                item_name=item.name,
                quantity=quantity,
                unit_price=unit_price,
                line_total=quantity * unit_price,
            )
        )

    if inventory_violations:
        raise InventoryQuantityExceededError(inventory_violations)

    sales_request.lines.clear()
    sales_request.lines.extend(new_lines)
    db.flush()
    _sync_sales_request_reservations(db, sales_request)
    return sales_request


def calculate_sales_request_total(sales_request: SalesRequest) -> Decimal:
    return sum((Decimal(line.line_total or 0) for line in sales_request.lines), Decimal("0"))


def update_sales_request_status(sales_request: SalesRequest, status: str):
    sales_request.status = status


def record_sales_request_status_transition(
    db: Session,
    *,
    sales_request: SalesRequest,
    from_status: str,
    to_status: str,
    user_id: Optional[int] = None,
) -> None:
    db.add(
        AuditEvent(
            company_id=_get_default_company_id(db),
            user_id=user_id,
            entity_type="sales_request",
            entity_id=sales_request.id,
            action="STATUS_TRANSITION",
            event_metadata=f"{from_status}->{to_status}",
        )
    )


def close_sales_request_if_paid(db: Session, sales_request_id: int) -> bool:
    invoices = db.query(Invoice.status).filter(Invoice.sales_request_id == sales_request_id).all()
    if not invoices:
        return False

    if any(row.status != "PAID" for row in invoices):
        return False

    sales_request = db.query(SalesRequest).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        return False

    sales_request.status = "CLOSED"
    return True


def deduct_inventory_for_sales_request(db: Session, sales_request: SalesRequest) -> None:
    """Deprecated: inventory deduction now happens only when invoice is shipped."""
    return None


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

    linked_invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.lines))
        .filter(Invoice.sales_request_id == sales_request.id)
        .first()
    )

    invoice_lines_by_item: dict[int, list] = {}
    if linked_invoice:
        for invoice_line in linked_invoice.lines:
            if invoice_line.item_id is None:
                continue
            invoice_lines_by_item.setdefault(invoice_line.item_id, []).append(invoice_line)

    enriched_lines = []
    company_id = _get_default_company_id(db)
    for line in sales_request.lines:
        item = line.item
        matched_invoice_line = None
        if line.item_id in invoice_lines_by_item and invoice_lines_by_item[line.item_id]:
            matched_invoice_line = invoice_lines_by_item[line.item_id].pop(0)
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
        on_hand_qty = Decimal("0")
        reserved_qty = Decimal("0")
        if item:
            inventory = db.query(Inventory).filter(Inventory.item_id == item.id).first()
            on_hand_qty = Decimal(inventory.quantity_on_hand or 0) if inventory else Decimal("0")
            reserved_qty = get_reserved_qty(db, item.id)
        enriched_lines.append({
            "id": line.id,
            "item_id": line.item_id,
            "item_name": line.item_name,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "line_total": line.line_total,
            "mwb_unit_price": line.mwb_unit_price,
            "mwb_explanation": line.mwb_explanation,
            "mwb_computed_at": line.mwb_computed_at,
            "invoice_unit_price": matched_invoice_line.unit_price if matched_invoice_line else None,
            "invoice_line_total": matched_invoice_line.line_total if matched_invoice_line else None,
            "on_hand_qty": on_hand_qty,
            "reserved_qty": reserved_qty,
            "available_qty": get_available_qty(db, item.id, company_id=company_id) if item else Decimal(0),
            "supplier_options": supplier_options,
        })

    display_total_amount = calculate_sales_request_total(sales_request)
    if sales_request.status in {"SHIPPED", "CLOSED"} and linked_invoice:
        display_total_amount = Decimal(linked_invoice.total or 0)

    return {
        "sales_request": sales_request,
        "enriched_lines": enriched_lines,
        "linked_invoice_id": linked_invoice.id if linked_invoice else None,
        "linked_invoice_number": linked_invoice.invoice_number if linked_invoice else None,
        "linked_invoice_status": linked_invoice.status if linked_invoice else None,
        "linked_invoice_shipped_at": linked_invoice.shipped_at if linked_invoice else None,
        "display_total_amount": display_total_amount,
    }


def generate_invoice_from_sales_request(
    db: Session,
    sales_request: SalesRequest,
    payload: dict,
) -> Invoice:
    """Generate a DRAFT invoice from a fulfilled sales request."""
    from app.sales.service import create_invoice

    if sales_request.status != "CONFIRMED":
        raise ValueError("Invoice generation is only allowed when the sales request is CONFIRMED.")

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

        if unit_cost is None and supplier_id:
            link = get_supplier_link(db, sr_line.item_id, supplier_id)
            if link:
                unit_cost = link.landed_cost
        if unit_cost is None:
            link = get_supplier_link(db, sr_line.item_id, None)
            if link:
                unit_cost = link.landed_cost

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
            "landed_unit_cost": Decimal(
                str(
                    (
                        db.query(Inventory.landed_unit_cost)
                        .filter(Inventory.item_id == sr_line.item_id)
                        .scalar()
                    )
                    or unit_cost
                    or 0
                )
            ),
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
    invoice = create_invoice(db, invoice_payload, reserve_stock=False)
    invoice.sales_request_id = sales_request.id

    update_sales_request_status(sales_request, "INVOICED")

    return invoice
