from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import func
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
            "mwb_confidence": line.mwb_confidence,
            "mwb_confidence_score": float(line.mwb_confidence_score) if line.mwb_confidence_score is not None else None,
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


# ── Enriched / 360 service functions ─────────────────────────


def get_sales_requests_summary(db: Session) -> dict:
    """Aggregate pipeline KPIs for the sales-orders list page header."""
    today = date.today()

    total_orders = db.query(func.count(SalesRequest.id)).scalar() or 0

    # Pipeline value: sum of line totals for non-terminal statuses
    pipeline_value = (
        db.query(func.coalesce(func.sum(SalesRequestLine.line_total), 0))
        .join(SalesRequest, SalesRequest.id == SalesRequestLine.sales_request_id)
        .filter(SalesRequest.status.notin_(list(SALES_REQUEST_TERMINAL_STATUSES)))
        .scalar()
    ) or Decimal("0")

    # Terminal counts for conversion rate
    closed = db.query(func.count(SalesRequest.id)).filter(SalesRequest.status == "CLOSED").scalar() or 0
    lost = db.query(func.count(SalesRequest.id)).filter(SalesRequest.status == "LOST").scalar() or 0
    cancelled = db.query(func.count(SalesRequest.id)).filter(SalesRequest.status == "CANCELLED").scalar() or 0
    terminal_total = closed + lost + cancelled
    conversion_rate = round((closed / terminal_total) * 100, 1) if terminal_total > 0 else None

    # Average deal size (across all orders that have line items)
    sr_totals = (
        db.query(func.sum(SalesRequestLine.line_total))
        .group_by(SalesRequestLine.sales_request_id)
        .all()
    )
    if sr_totals:
        deal_values = [Decimal(row[0] or 0) for row in sr_totals]
        avg_deal_size = sum(deal_values) / len(deal_values) if deal_values else None
    else:
        avg_deal_size = None

    # Overdue: past fulfillment date and non-terminal
    overdue = (
        db.query(func.count(SalesRequest.id))
        .filter(
            SalesRequest.requested_fulfillment_date < today,
            SalesRequest.requested_fulfillment_date.isnot(None),
            SalesRequest.status.notin_(list(SALES_REQUEST_TERMINAL_STATUSES)),
        )
        .scalar()
    ) or 0

    # Average cycle time: avg days from created_at to CLOSED transition
    closed_srs = (
        db.query(SalesRequest.id, SalesRequest.created_at)
        .filter(SalesRequest.status == "CLOSED")
        .all()
    )
    cycle_times: list[float] = []
    for sr_id, created_at in closed_srs:
        closed_event = (
            db.query(AuditEvent.created_at)
            .filter(
                AuditEvent.entity_type == "sales_request",
                AuditEvent.entity_id == sr_id,
                AuditEvent.action == "STATUS_TRANSITION",
                AuditEvent.event_metadata.like("%->CLOSED"),
            )
            .order_by(AuditEvent.created_at.desc())
            .first()
        )
        if closed_event and created_at:
            delta = (closed_event[0] - created_at).total_seconds() / 86400
            cycle_times.append(delta)
    avg_cycle_time_days = round(sum(cycle_times) / len(cycle_times), 1) if cycle_times else None

    # Orders by status
    status_rows = (
        db.query(SalesRequest.status, func.count(SalesRequest.id))
        .group_by(SalesRequest.status)
        .all()
    )
    orders_by_status = {row[0]: row[1] for row in status_rows}

    return {
        "total_orders": total_orders,
        "pipeline_value": Decimal(str(pipeline_value)),
        "conversion_rate": conversion_rate,
        "avg_deal_size": avg_deal_size,
        "overdue_orders": overdue,
        "avg_cycle_time_days": avg_cycle_time_days,
        "orders_by_status": orders_by_status,
    }


def get_sales_requests_view_summary(db: Session, view: str) -> dict:
    """Compute view-specific KPIs for the Salesforce-style list page tabs."""
    today = date.today()

    if view == "active_pipeline":
        active_statuses = ["NEW", "QUOTED", "CONFIRMED"]
        orders = (
            db.query(SalesRequest)
            .options(selectinload(SalesRequest.lines))
            .filter(SalesRequest.status.in_(active_statuses))
            .all()
        )
        pipeline_value = Decimal("0")
        total_days = 0
        stage_counts: dict[str, int] = {s: 0 for s in active_statuses}
        for sr in orders:
            sr_total = sum(Decimal(str(line.line_total or 0)) for line in sr.lines)
            pipeline_value += sr_total
            total_days += (today - sr.created_at.date()).days if sr.created_at else 0
            if sr.status in stage_counts:
                stage_counts[sr.status] += 1

        count = len(orders)
        return {
            "pipeline_value": pipeline_value,
            "avg_deal_size": pipeline_value / count if count > 0 else None,
            "orders_by_stage": stage_counts,
            "avg_days_open": round(total_days / count, 1) if count > 0 else None,
            "order_count": count,
        }

    elif view == "fulfillment":
        fulfillment_statuses = ["INVOICED", "SHIPPED"]
        orders = (
            db.query(SalesRequest)
            .filter(SalesRequest.status.in_(fulfillment_statuses))
            .all()
        )
        to_ship = sum(1 for o in orders if o.status == "INVOICED")
        overdue = sum(
            1 for o in orders
            if o.requested_fulfillment_date and o.requested_fulfillment_date < today
        )
        return {
            "order_count": len(orders),
            "orders_to_ship": to_ship,
            "overdue_shipments": overdue,
        }

    elif view == "closed":
        closed_orders = (
            db.query(SalesRequest)
            .options(selectinload(SalesRequest.lines))
            .filter(SalesRequest.status == "CLOSED")
            .all()
        )
        total_value = Decimal("0")
        for sr in closed_orders:
            total_value += sum(Decimal(str(line.line_total or 0)) for line in sr.lines)

        closed_count = len(closed_orders)
        lost = db.query(func.count(SalesRequest.id)).filter(SalesRequest.status == "LOST").scalar() or 0
        cancelled = db.query(func.count(SalesRequest.id)).filter(SalesRequest.status == "CANCELLED").scalar() or 0
        terminal_total = closed_count + lost + cancelled
        conversion_rate = round((closed_count / terminal_total) * 100, 1) if terminal_total > 0 else None

        # Avg cycle time for closed orders
        cycle_times: list[float] = []
        for sr in closed_orders:
            closed_event = (
                db.query(AuditEvent.created_at)
                .filter(
                    AuditEvent.entity_type == "sales_request",
                    AuditEvent.entity_id == sr.id,
                    AuditEvent.action == "STATUS_TRANSITION",
                    AuditEvent.event_metadata.like("%->%CLOSED%"),
                )
                .order_by(AuditEvent.created_at.desc())
                .first()
            )
            if closed_event and sr.created_at:
                delta = (closed_event[0] - sr.created_at).total_seconds() / 86400
                cycle_times.append(delta)

        avg_cycle = round(sum(cycle_times) / len(cycle_times), 1) if cycle_times else None

        return {
            "order_count": closed_count,
            "total_closed_value": total_value,
            "avg_cycle_time_days": avg_cycle,
            "conversion_rate": conversion_rate,
        }

    else:
        # "all" or "needs_attention" — return the full summary
        return get_sales_requests_summary(db)


def get_sales_requests_enriched(
    db: Session,
    *,
    search: Optional[str] = None,
    item_id: Optional[int] = None,
    status_filter: Optional[List[str]] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    needs_attention: bool = False,
    limit: int = 25,
    offset: int = 0,
) -> dict:
    """Return enriched sales request list with computed fields."""
    today = date.today()

    # Base query: SR + aggregated line info
    query = (
        db.query(
            SalesRequest,
            func.count(SalesRequestLine.id).label("line_count"),
            func.coalesce(func.sum(SalesRequestLine.line_total), 0).label("total_amount"),
        )
        .outerjoin(SalesRequestLine, SalesRequestLine.sales_request_id == SalesRequest.id)
        .group_by(SalesRequest.id)
    )

    # Filters
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            func.lower(SalesRequest.request_number).like(like)
            | func.lower(SalesRequest.customer_name).like(like)
        )
    if item_id:
        query = query.filter(
            db.query(SalesRequestLine.id)
            .filter(
                SalesRequestLine.sales_request_id == SalesRequest.id,
                SalesRequestLine.item_id == item_id,
            )
            .exists()
        )
    if status_filter:
        query = query.filter(SalesRequest.status.in_(status_filter))
    if needs_attention:
        # Override: non-terminal orders that are overdue OR open > 14 days
        query = query.filter(
            SalesRequest.status.notin_(list(SALES_REQUEST_TERMINAL_STATUSES))
        )
        today_val = date.today()
        fourteen_days_ago = today_val - timedelta(days=14)
        from sqlalchemy import or_, and_
        query = query.filter(
            or_(
                and_(
                    SalesRequest.requested_fulfillment_date.isnot(None),
                    SalesRequest.requested_fulfillment_date < today_val,
                ),
                func.date(SalesRequest.created_at) <= fourteen_days_ago,
            )
        )
    if date_from:
        query = query.filter(func.date(SalesRequest.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(SalesRequest.created_at) <= date_to)

    # Sorting
    sort_map = {
        "created_at": SalesRequest.created_at,
        "request_number": SalesRequest.request_number,
        "customer_name": SalesRequest.customer_name,
        "status": SalesRequest.status,
        "updated_at": SalesRequest.updated_at,
    }
    sort_col = sort_map.get(sort_by)
    if sort_col is not None:
        query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    elif sort_by == "total_amount":
        from sqlalchemy import literal_column
        query = query.order_by(
            literal_column("total_amount").desc()
            if sort_dir == "desc"
            else literal_column("total_amount").asc()
        )
    else:
        query = query.order_by(SalesRequest.created_at.desc())

    # Get total count BEFORE applying limit/offset
    total_count = query.count()

    # Apply pagination
    query = query.offset(offset).limit(limit)

    rows = query.all()

    # Batch fetch: linked invoices (subquery)
    sr_ids = [row[0].id for row in rows]
    linked_invoice_ids: set[int] = set()
    if sr_ids:
        invoice_rows = (
            db.query(Invoice.sales_request_id)
            .filter(Invoice.sales_request_id.in_(sr_ids))
            .all()
        )
        linked_invoice_ids = {row[0] for row in invoice_rows}

    # Batch fetch: user names
    user_ids = {row[0].created_by_user_id for row in rows if row[0].created_by_user_id}
    user_name_map: dict[int, str] = {}
    if user_ids:
        user_rows = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_name_map = {uid: email for uid, email in user_rows}

    # Batch fetch: preferred supplier costs per item for margin estimation
    # Note: SupplierItem.landed_cost is a @property, not a column.
    # We compute it as supplier_cost + freight_cost + tariff_cost in SQL.
    all_item_ids: set[int] = set()
    for row in rows:
        sr = row[0]
        for line in sr.lines:
            all_item_ids.add(line.item_id)
    preferred_cost_map: dict[int, Decimal] = {}
    if all_item_ids:
        pref_rows = (
            db.query(
                SupplierItem.item_id,
                (
                    func.coalesce(SupplierItem.supplier_cost, 0)
                    + func.coalesce(SupplierItem.freight_cost, 0)
                    + func.coalesce(SupplierItem.tariff_cost, 0)
                ).label("landed_cost"),
            )
            .filter(SupplierItem.item_id.in_(all_item_ids), SupplierItem.is_preferred.is_(True))
            .all()
        )
        for item_id, landed_cost in pref_rows:
            preferred_cost_map[item_id] = Decimal(str(landed_cost or 0))

    result = []
    for row in rows:
        sr = row[0]
        line_count = row[1] or 0
        total_amount = Decimal(str(row[2] or 0))

        days_open = (today - sr.created_at.date()).days if sr.created_at else 0

        # Fulfillment urgency
        urgency = "none"
        if sr.requested_fulfillment_date and sr.status not in SALES_REQUEST_TERMINAL_STATUSES:
            delta = (sr.requested_fulfillment_date - today).days
            if delta < 0:
                urgency = "overdue"
            elif delta <= 3:
                urgency = "due_soon"
            else:
                urgency = "normal"

        # Estimated margin from preferred supplier costs
        estimated_margin_pct = None
        if total_amount > 0:
            total_cost = Decimal("0")
            has_cost_data = False
            for line in sr.lines:
                cost = preferred_cost_map.get(line.item_id)
                if cost is not None:
                    total_cost += cost * Decimal(str(line.quantity or 0))
                    has_cost_data = True
            if has_cost_data and total_cost > 0:
                margin = total_amount - total_cost
                estimated_margin_pct = round(float((margin / total_amount) * 100), 1)

        result.append({
            "id": sr.id,
            "request_number": sr.request_number,
            "customer_id": sr.customer_id,
            "customer_name": sr.customer_name,
            "status": sr.status,
            "created_at": sr.created_at,
            "updated_at": sr.updated_at,
            "requested_fulfillment_date": sr.requested_fulfillment_date,
            "total_amount": total_amount,
            "line_count": line_count,
            "days_open": days_open,
            "created_by_user_id": sr.created_by_user_id,
            "created_by_name": user_name_map.get(sr.created_by_user_id),
            "has_linked_invoice": sr.id in linked_invoice_ids,
            "fulfillment_urgency": urgency,
            "estimated_margin_percent": estimated_margin_pct,
            "notes": sr.notes,
        })

    return {
        "items": result,
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
    }


def get_sales_request_360(db: Session, sales_request_id: int) -> Optional[dict]:
    """Full 360 view: existing detail + KPIs + customer recent orders."""
    base = get_sales_request_detail(db, sales_request_id)
    if not base:
        return None

    sr = base["sales_request"]
    today = date.today()

    # Compute KPIs
    total_amount = Decimal(str(base["display_total_amount"]))
    line_count = len(sr.lines)
    avg_line_value = (total_amount / line_count) if line_count > 0 else None
    days_open = (today - sr.created_at.date()).days if sr.created_at else 0

    fulfillment_remaining = None
    if sr.requested_fulfillment_date:
        fulfillment_remaining = (sr.requested_fulfillment_date - today).days

    # Estimated margin from preferred supplier landed costs
    total_cost = Decimal("0")
    has_cost_data = False
    for eline in base["enriched_lines"]:
        preferred = next((s for s in eline["supplier_options"] if s.get("is_preferred")), None)
        if preferred:
            total_cost += Decimal(str(preferred["landed_cost"])) * Decimal(str(eline["quantity"]))
            has_cost_data = True

    margin_amount = (total_amount - total_cost) if has_cost_data and total_cost > 0 else None
    margin_pct = round(float((margin_amount / total_amount) * 100), 1) if margin_amount is not None and total_amount > 0 else None

    kpis = {
        "total_amount": total_amount,
        "line_count": line_count,
        "avg_line_value": avg_line_value,
        "estimated_margin_percent": margin_pct,
        "estimated_margin_amount": margin_amount,
        "days_open": days_open,
        "fulfillment_days_remaining": fulfillment_remaining,
    }

    # Customer's recent orders (last 5, excluding current)
    customer_recent_orders: list[dict] = []
    if sr.customer_id:
        recent = (
            db.query(SalesRequest)
            .options(selectinload(SalesRequest.lines))
            .filter(SalesRequest.customer_id == sr.customer_id, SalesRequest.id != sr.id)
            .order_by(SalesRequest.created_at.desc())
            .limit(5)
            .all()
        )
        for o in recent:
            customer_recent_orders.append({
                "id": o.id,
                "request_number": o.request_number,
                "status": o.status,
                "total_amount": calculate_sales_request_total(o),
                "created_at": o.created_at,
            })

    base["kpis"] = kpis
    base["customer_recent_orders"] = customer_recent_orders
    return base
