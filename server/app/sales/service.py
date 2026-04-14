from datetime import date, datetime, timedelta
from decimal import Decimal
import logging
from typing import Iterable, List, Optional, Sequence

from sqlalchemy import case, func, text
from sqlalchemy.orm import Session, selectinload

from app.accounting.gl_engine import postJournalEntries
from app.inventory.service import SOURCE_INVOICE, get_available_qty, reserve_inventory_record
from app.models import ARCollectionActivity, Customer, Inventory, Invoice, InvoiceLine, Item, Payment, PaymentApplication, SalesRequest, SupplierItem
from app.sales.calculations import (
    InvoiceLineInput,
    PaymentApplicationInput,
    calculate_invoice_totals,
    calculate_line_totals,
    validate_payment_applications,
)
from app.suppliers.service import get_supplier_link
from app.sql_expressions import days_between
from app.utils import quantize_money


logger = logging.getLogger(__name__)

DEFAULT_MARGIN_THRESHOLD_PERCENT = Decimal("20")
DEFAULT_MARKUP_BY_TIER = {
    "STANDARD": Decimal("30"),
    "BRONZE": Decimal("25"),
    "SILVER": Decimal("20"),
    "GOLD": Decimal("15"),
    "PLATINUM": Decimal("12"),
}


def _resolve_inventory_unit_cost(item: Item, inventory: Inventory | None) -> Decimal:
    inventory_cost = quantize_money(Decimal(inventory.landed_unit_cost)) if inventory and inventory.landed_unit_cost is not None else Decimal("0.00")
    if inventory_cost > 0:
        return inventory_cost

    cost_price = quantize_money(Decimal(item.cost_price)) if item.cost_price is not None else Decimal("0.00")
    if cost_price > 0:
        return cost_price

    preferred_cost = quantize_money(Decimal(item.preferred_landed_cost)) if item.preferred_landed_cost is not None else Decimal("0.00")
    if preferred_cost > 0:
        return preferred_cost

    return Decimal("0.00")


def _resolve_inventory_value(item: Item, inventory: Inventory | None, on_hand: Decimal) -> Decimal:
    if on_hand <= 0:
        return Decimal("0.00")
    return quantize_money(on_hand * _resolve_inventory_unit_cost(item, inventory))


def _quarter_start(value: date) -> date:
    quarter_month = ((value.month - 1) // 3) * 3 + 1
    return date(value.year, quarter_month, 1)


def _period_start(today: date, period: str) -> date:
    normalized = period.lower()
    if normalized == "mtd":
        return date(today.year, today.month, 1)
    if normalized == "qtd":
        return _quarter_start(today)
    if normalized == "ytd":
        return date(today.year, 1, 1)
    if normalized == "ltm":
        return today - timedelta(days=365)
    return date(today.year, 1, 1)


def _month_floor(value: date) -> date:
    return date(value.year, value.month, 1)


def _add_months(value: date, months: int) -> date:
    month_index = (value.month - 1) + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def get_items_catalog_intelligence(db: Session, *, period: str = "ytd", top_n: int = 5) -> dict:
    from app.models import Inventory

    today = date.today()
    active_period = period.lower()
    current_start = _period_start(today, active_period)
    current_month_start = date(today.year, today.month, 1)
    previous_month_start = _add_months(current_month_start, -1)
    sales_90d_start = today - timedelta(days=90)
    dead_stock_cutoff = today - timedelta(days=180)
    trend_start = _add_months(current_month_start, -11)
    ytd_start = date(today.year, 1, 1)

    item_rows = (
        db.query(Item)
        .options(selectinload(Item.supplier_items))
        .filter(Item.is_active == True)
        .all()
    )
    item_map = {item.id: item for item in item_rows}
    item_ids = list(item_map.keys())
    if not item_ids:
        return {
            "period": active_period,
            "dead_stock_count": 0,
            "low_stock_high_demand_count": 0,
            "top_sellers": [],
            "top_sellers_ytd": [],
            "rising_items": [],
            "declining_items": [],
            "dead_stock": [],
            "low_stock_high_demand": [],
            "trend": [],
        }

    inventory_rows = db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
    inventory_map = {row.item_id: row for row in inventory_rows}

    def item_state(item_id: int) -> dict:
        item = item_map[item_id]
        inv = inventory_map.get(item_id)
        on_hand = Decimal(inv.quantity_on_hand or 0) if inv else Decimal(item.on_hand_qty or 0)
        reserved = Decimal(item.reserved_qty or 0)
        reorder = Decimal(item.reorder_point or 0) if item.reorder_point else None
        return {
            "on_hand": on_hand,
            "inventory_value": _resolve_inventory_value(item, inv, on_hand),
            "stock_status": _stock_status(on_hand, reserved, reorder),
        }

    current_rows = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.quantity), 0).label("units"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= current_start,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .group_by(InvoiceLine.item_id)
        .all()
    )
    current_map = {
        row.item_id: {
            "revenue": Decimal(row.revenue or 0),
            "units": Decimal(row.units or 0),
        }
        for row in current_rows
    }

    ytd_rows = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.quantity), 0).label("units"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= ytd_start,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .group_by(InvoiceLine.item_id)
        .all()
    )
    ytd_map = {
        row.item_id: {
            "revenue": Decimal(row.revenue or 0),
            "units": Decimal(row.units or 0),
        }
        for row in ytd_rows
    }

    monthly_compare_rows = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            func.coalesce(
                func.sum(
                    InvoiceLine.line_total
                    * case((Invoice.issue_date >= current_month_start, 1), else_=0)
                ),
                0,
            ).label("current_revenue"),
            func.coalesce(
                func.sum(
                    InvoiceLine.line_total
                    * case(
                        (
                            (Invoice.issue_date >= previous_month_start) & (Invoice.issue_date < current_month_start),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("previous_revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= previous_month_start,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .group_by(InvoiceLine.item_id)
        .all()
    )
    compare_map = {
        row.item_id: {
            "current": Decimal(row.current_revenue or 0),
            "previous": Decimal(row.previous_revenue or 0),
        }
        for row in monthly_compare_rows
    }

    sold_90d_rows = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            func.coalesce(func.sum(InvoiceLine.quantity), 0).label("units"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= sales_90d_start,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .group_by(InvoiceLine.item_id)
        .all()
    )
    sold_90d_map = {
        row.item_id: {
            "units": Decimal(row.units or 0),
            "revenue": Decimal(row.revenue or 0),
        }
        for row in sold_90d_rows
    }

    recently_sold_ids = {
        row.item_id
        for row in db.query(InvoiceLine.item_id)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= dead_stock_cutoff,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .distinct()
        .all()
    }

    trend_rows = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            Invoice.issue_date.label("issue_date"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.quantity), 0).label("units"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.status != "VOID",
            Invoice.issue_date >= trend_start,
            InvoiceLine.item_id.isnot(None),
            InvoiceLine.item_id.in_(item_ids),
        )
        .group_by(InvoiceLine.item_id, Invoice.issue_date)
        .all()
    )

    def build_spotlight(item_id: int, revenue: Decimal, units: Decimal, change_percent: float | None = None) -> dict:
        item = item_map[item_id]
        state = item_state(item_id)
        return {
            "item_id": item.id,
            "item_code": item.item_code or item.sku,
            "item_name": item.name,
            "revenue": quantize_money(revenue),
            "units": units,
            "change_percent": change_percent,
            "stock_status": state["stock_status"],
            "on_hand_qty": state["on_hand"],
            "inventory_value": state["inventory_value"],
        }

    top_sellers = [
        build_spotlight(item_id, data["revenue"], data["units"])
        for item_id, data in sorted(
            current_map.items(),
            key=lambda entry: (entry[1]["revenue"], entry[1]["units"]),
            reverse=True,
        )[:top_n]
    ]

    top_sellers_ytd = [
        build_spotlight(item_id, data["revenue"], data["units"])
        for item_id, data in sorted(
            ytd_map.items(),
            key=lambda entry: (entry[1]["revenue"], entry[1]["units"]),
            reverse=True,
        )[:top_n]
    ]

    rising_candidates: list[dict] = []
    declining_candidates: list[dict] = []
    for item_id, data in compare_map.items():
        current_revenue = data["current"]
        previous_revenue = data["previous"]
        if current_revenue <= 0 and previous_revenue <= 0:
            continue
        change = current_revenue - previous_revenue
        baseline = previous_revenue if previous_revenue > 0 else Decimal("1.00")
        change_percent = float((change / baseline) * Decimal("100"))
        spotlight = build_spotlight(
            item_id,
            current_revenue,
            current_map.get(item_id, {}).get("units", Decimal("0")),
            change_percent=change_percent,
        )
        spotlight["_change_value"] = change
        if change > 0:
            rising_candidates.append(spotlight)
        elif change < 0:
            declining_candidates.append(spotlight)

    rising_items = sorted(
        rising_candidates,
        key=lambda row: (row["_change_value"], row["revenue"]),
        reverse=True,
    )[:top_n]
    declining_items = sorted(
        declining_candidates,
        key=lambda row: (row["_change_value"], -row["revenue"]),
    )[:top_n]
    for row in rising_items + declining_items:
        row.pop("_change_value", None)

    dead_stock: list[dict] = []
    low_stock_high_demand: list[dict] = []
    for item_id, item in item_map.items():
        state = item_state(item_id)
        on_hand = state["on_hand"]
        if on_hand >= 1 and item_id not in recently_sold_ids:
            dead_stock.append(
                build_spotlight(item_id, Decimal("0"), Decimal("0"))
            )
        recent = sold_90d_map.get(item_id)
        if not recent or recent["units"] <= 0:
            continue
        reorder = Decimal(item.reorder_point or 0) if item.reorder_point else Decimal("0")
        if state["stock_status"] == "low_stock" or (reorder > 0 and on_hand <= reorder):
            low_stock_high_demand.append(
                build_spotlight(item_id, recent["revenue"], recent["units"])
            )

    dead_stock_count = len(dead_stock)
    low_stock_high_demand_count = len(low_stock_high_demand)

    dead_stock = sorted(dead_stock, key=lambda row: row["inventory_value"], reverse=True)[:top_n]
    low_stock_high_demand = sorted(
        low_stock_high_demand,
        key=lambda row: (row["units"], row["revenue"]),
        reverse=True,
    )[:top_n]

    trend_item_ids = [row["item_id"] for row in top_sellers_ytd[:top_n]]
    trend_map: dict[tuple[int, str], dict[str, Decimal]] = {}
    for row in trend_rows:
        if row.item_id not in trend_item_ids or row.issue_date is None:
            continue
        period_key = row.issue_date.strftime("%Y-%m")
        bucket = trend_map.setdefault((row.item_id, period_key), {"revenue": Decimal("0"), "units": Decimal("0")})
        bucket["revenue"] += Decimal(row.revenue or 0)
        bucket["units"] += Decimal(row.units or 0)
    trend_points: list[dict] = []
    month_cursor = trend_start
    while month_cursor <= current_month_start:
        period_label = month_cursor.strftime("%Y-%m")
        for item_id in trend_item_ids:
            item = item_map[item_id]
            row = trend_map.get((item_id, period_label))
            trend_points.append({
                "period": period_label,
                "item_id": item_id,
                "item_code": item.item_code or item.sku,
                "item_name": item.name,
                "revenue": quantize_money(Decimal(row["revenue"] or 0)) if row else Decimal("0.00"),
                "units": Decimal(row["units"] or 0) if row else Decimal("0"),
            })
        month_cursor = _add_months(month_cursor, 1)

    return {
        "period": active_period,
        "dead_stock_count": dead_stock_count,
        "low_stock_high_demand_count": low_stock_high_demand_count,
        "top_sellers": top_sellers,
        "top_sellers_ytd": top_sellers_ytd,
        "rising_items": rising_items,
        "declining_items": declining_items,
        "dead_stock": dead_stock,
        "low_stock_high_demand": low_stock_high_demand,
        "trend": trend_points,
    }


def get_customer_insights(db: Session, customer_id: int) -> dict:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise ValueError("Customer not found.")

    today = date.today()
    ytd_start = date(today.year, 1, 1)
    ltm_start = today - timedelta(days=365)

    active_invoice_filter = (
        Invoice.customer_id == customer_id,
        Invoice.status != "VOID",
    )

    ytd_revenue = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(*active_invoice_filter, Invoice.issue_date >= ytd_start)
        .scalar()
    )
    ltm_revenue = (
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(*active_invoice_filter, Invoice.issue_date >= ltm_start)
        .scalar()
    )

    margin_data = (
        db.query(
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.landed_unit_cost * InvoiceLine.quantity), 0).label("cost"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            *active_invoice_filter,
            Invoice.issue_date >= ltm_start,
            InvoiceLine.landed_unit_cost.isnot(None),
            InvoiceLine.landed_unit_cost > 0,
        )
        .one()
    )
    gross_margin_percent = None
    revenue = Decimal(margin_data.revenue or 0)
    cost = Decimal(margin_data.cost or 0)
    if revenue > 0:
        gross_margin_percent = ((revenue - cost) / revenue) * Decimal("100")

    outstanding_ar = (
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(*active_invoice_filter, Invoice.amount_due > 0)
        .scalar()
    )

    payment_stats = (
        db.query(
            func.coalesce(func.sum(PaymentApplication.applied_amount), 0).label("applied_total"),
            func.coalesce(
                func.sum(
                    days_between(Payment.payment_date, Invoice.issue_date, dialect_name=db.get_bind().dialect.name)
                    * PaymentApplication.applied_amount
                ),
                0,
            ).label("weighted_days"),
        )
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .join(Invoice, Invoice.id == PaymentApplication.invoice_id)
        .filter(
            Invoice.customer_id == customer_id,
            Invoice.status != "VOID",
            Payment.payment_date >= ltm_start,
        )
        .one()
    )

    average_days_to_pay = None
    applied_total = Decimal(payment_stats.applied_total or 0)
    weighted_days = Decimal(payment_stats.weighted_days or 0)
    if applied_total > 0:
        average_days_to_pay = float(weighted_days / applied_total)

    last_invoices = (
        db.query(Invoice)
        .filter(*active_invoice_filter)
        .order_by(Invoice.issue_date.desc(), Invoice.id.desc())
        .limit(5)
        .all()
    )

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "ytd_revenue": Decimal(ytd_revenue or 0),
        "ltm_revenue": Decimal(ltm_revenue or 0),
        "gross_margin_percent": gross_margin_percent,
        "outstanding_ar": Decimal(outstanding_ar or 0),
        "average_days_to_pay": average_days_to_pay,
        "last_invoices": last_invoices,
    }


def get_default_markup_percent(customer_tier: str | None) -> Decimal:
    normalized_tier = (customer_tier or "STANDARD").upper()
    return DEFAULT_MARKUP_BY_TIER.get(normalized_tier, DEFAULT_MARKUP_BY_TIER["STANDARD"])


def get_item_pricing_context(db: Session, *, item_id: int, customer_id: int | None = None) -> dict:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError("Item not found.")

    customer_tier = "STANDARD"
    if customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise ValueError("Customer not found.")
        customer_tier = customer.tier or "STANDARD"

    warnings: list[str] = []
    inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    landed_unit_cost_raw = Decimal(inventory.landed_unit_cost) if inventory and inventory.landed_unit_cost is not None else None
    landed_unit_cost = quantize_money(landed_unit_cost_raw)

    available_qty = quantize_money(get_available_qty(db, item_id)) or Decimal("0.00")
    markup_percent = quantize_money(get_default_markup_percent(customer_tier)) or Decimal("0.00")

    history_query = (
        db.query(InvoiceLine)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(InvoiceLine.item_id == item_id, InvoiceLine.quantity > 0, Invoice.status != "VOID")
    )

    customer_history_lines = []
    if customer_id is not None:
        customer_history_lines = history_query.filter(Invoice.customer_id == customer_id).order_by(Invoice.id.desc()).all()

    global_history_lines = history_query.order_by(Invoice.id.desc()).all()

    history_lines = customer_history_lines or global_history_lines
    if customer_id is not None and not customer_history_lines and global_history_lines:
        warnings.append("Insufficient customer price history; using global median.")

    history_unit_prices: list[Decimal] = []
    for line in history_lines:
        quantity = Decimal(line.quantity or 0)
        if quantity <= 0:
            continue
        raw_unit_price = Decimal(line.line_total or 0) / quantity if line.line_total else Decimal(line.unit_price or 0)
        if raw_unit_price > 0:
            history_unit_prices.append(raw_unit_price)

    last_paid_price = quantize_money(history_unit_prices[0]) if history_unit_prices else None
    avg_unit_price = quantize_money(sum(history_unit_prices) / Decimal(len(history_unit_prices))) if history_unit_prices else None

    suggested_sell = None
    if landed_unit_cost is not None and landed_unit_cost > 0:
        suggested_sell = quantize_money(landed_unit_cost * (Decimal("1") + (markup_percent / Decimal("100"))))
    else:
        warnings.append("No landed cost available; suggested sell not computed.")

    if suggested_sell is not None and suggested_sell > 0:
        recommended_price = suggested_sell
    elif avg_unit_price is not None and avg_unit_price > 0:
        recommended_price = avg_unit_price
    elif last_paid_price is not None and last_paid_price > 0:
        recommended_price = last_paid_price
    else:
        recommended_price = quantize_money(item.unit_price)
        warnings.append("No invoice price history found; using item list price.")

    if warnings:
        logger.info("Pricing context warnings for item_id=%s customer_id=%s: %s", item_id, customer_id, warnings)

    return {
        "item_id": item_id,
        "customer_id": customer_id,
        "customer_tier": customer_tier.upper(),
        "landed_unit_cost": landed_unit_cost,
        "available_qty": available_qty,
        "last_paid_price": last_paid_price,
        "avg_unit_price": avg_unit_price,
        "suggested_sell": suggested_sell,
        "recommended_price": quantize_money(recommended_price),
        "default_markup_percent": markup_percent,
        "margin_threshold_percent": quantize_money(DEFAULT_MARGIN_THRESHOLD_PERCENT) or Decimal("0.00"),
        "warnings": warnings,
    }


def get_next_invoice_number(db: Session) -> str:
    result = db.execute(text("SELECT nextval('invoice_number_seq')")).scalar_one()
    return f"INV-{int(result):06d}"


def recalculate_invoice_totals(invoice: Invoice) -> None:
    line_inputs = [
        InvoiceLineInput(
            quantity=Decimal(line.quantity),
            unit_price=Decimal(line.unit_price),
            discount=Decimal(line.discount),
            tax_rate=Decimal(line.tax_rate),
        )
        for line in invoice.lines
    ]
    totals = calculate_invoice_totals(line_inputs)
    invoice.subtotal = totals.subtotal
    invoice.tax_total = totals.tax_total
    invoice.total = totals.total


def recalculate_invoice_balance(db: Session, invoice: Invoice) -> None:
    applied_total = (
        db.query(func.coalesce(func.sum(PaymentApplication.applied_amount), 0))
        .filter(PaymentApplication.invoice_id == invoice.id)
        .scalar()
    )
    invoice.amount_due = invoice.total - Decimal(applied_total)


def update_invoice_status(invoice: Invoice) -> None:
    if invoice.status == "VOID":
        return
    if invoice.amount_due <= 0:
        invoice.status = "PAID"
    elif invoice.amount_due < invoice.total:
        invoice.status = "PARTIALLY_PAID"
    elif invoice.status == "SENT":
        invoice.status = "SENT"


def build_invoice_lines(
    db: Session, invoice: Invoice, lines_data: Iterable[dict]
) -> List[InvoiceLine]:
    lines: List[InvoiceLine] = []
    for line in lines_data:
        item: Optional[Item] = None
        description = line.get("description")
        unit_price = line.get("unit_price")
        unit_cost = line.get("unit_cost")
        landed_unit_cost = line.get("landed_unit_cost")
        supplier_id = line.get("supplier_id")
        if line.get("item_id"):
            item = db.query(Item).filter(Item.id == line["item_id"]).first()
            if not item:
                raise ValueError("Item not found.")
            if not description:
                description = item.name
            if unit_price is None:
                unit_price = item.unit_price
            if supplier_id:
                supplier_link = get_supplier_link(db, item.id, supplier_id)
                if not supplier_link:
                    raise ValueError("Supplier link not found for item.")
                if unit_cost is None:
                    unit_cost = supplier_link.landed_cost
            elif unit_cost is None:
                supplier_link = get_supplier_link(db, item.id, None)
                if supplier_link:
                    unit_cost = supplier_link.landed_cost

            inventory_record = db.query(Inventory).filter(Inventory.item_id == item.id).first()
            if landed_unit_cost is None and inventory_record is not None:
                landed_unit_cost = Decimal(inventory_record.landed_unit_cost or 0)
        elif supplier_id:
            raise ValueError("Supplier cannot be set without an item.")
        if unit_price is None:
            raise ValueError("Unit price is required.")
        quantity = Decimal(line["quantity"])
        discount = Decimal(line.get("discount") or 0)
        tax_rate = Decimal(line.get("tax_rate") or 0)
        line_subtotal, tax_amount, line_total = calculate_line_totals(
            InvoiceLineInput(
                quantity=quantity,
                unit_price=Decimal(unit_price),
                discount=discount,
                tax_rate=tax_rate,
            )
        )
        lines.append(
            InvoiceLine(
                item=item,
                description=description,
                quantity=quantity,
                unit_price=unit_price,
                unit_cost=Decimal(unit_cost) if unit_cost is not None else None,
                landed_unit_cost=Decimal(landed_unit_cost or 0),
                supplier_id=supplier_id,
                discount=discount,
                tax_rate=tax_rate,
                line_total=line_total,
            )
        )
    return lines


def list_customers(db: Session, search: Optional[str]) -> Sequence[Customer]:
    query = db.query(Customer)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Customer.name).like(like)
            | func.lower(func.coalesce(Customer.email, "")).like(like)
            | func.lower(func.coalesce(Customer.phone, "")).like(like)
            | func.lower(func.coalesce(Customer.customer_number, "")).like(like)
            | func.lower(func.coalesce(Customer.primary_contact, "")).like(like)
        )
    return query.order_by(Customer.name).all()


def list_items(db: Session, search: Optional[str]) -> Sequence[Item]:
    query = db.query(Item).options(selectinload(Item.supplier_items).selectinload(SupplierItem.supplier))
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(func.lower(Item.name).like(like))
    return query.order_by(Item.name).all()


def list_invoices(
    db: Session,
    status: Optional[str],
    customer_id: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
    min_total: Optional[Decimal],
    max_total: Optional[Decimal],
) -> Sequence[Invoice]:
    query = db.query(Invoice)
    if status:
        query = query.filter(Invoice.status == status)
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if start_date:
        query = query.filter(Invoice.issue_date >= start_date)
    if end_date:
        query = query.filter(Invoice.issue_date <= end_date)
    if min_total:
        query = query.filter(Invoice.total >= min_total)
    if max_total:
        query = query.filter(Invoice.total <= max_total)
    return query.order_by(Invoice.issue_date.desc(), Invoice.id.desc()).all()


def create_invoice(db: Session, payload: dict, *, reserve_stock: bool = True) -> Invoice:
    invoice = Invoice(
        customer_id=payload["customer_id"],
        invoice_number=get_next_invoice_number(db),
        status="DRAFT",
        issue_date=payload["issue_date"],
        due_date=payload["due_date"],
        notes=payload.get("notes"),
        terms=payload.get("terms"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    invoice.lines = build_invoice_lines(db, invoice, payload["line_items"])
    recalculate_invoice_totals(invoice)
    invoice.amount_due = invoice.total
    db.add(invoice)
    db.flush()

    if reserve_stock:
        for line in invoice.lines:
            if line.item_id is None:
                continue
            available = get_available_qty(db, line.item_id)
            requested = Decimal(line.quantity or 0)
            if requested > available:
                raise ValueError(f"Insufficient available inventory for line item {line.item_id}.")
            reserve_inventory_record(
                db,
                item_id=line.item_id,
                qty_reserved=requested,
                source_type=SOURCE_INVOICE,
                source_id=invoice.id,
            )

    return invoice


def update_invoice(db: Session, invoice: Invoice, payload: dict) -> Invoice:
    if invoice.status != "DRAFT":
        raise ValueError("Only draft invoices can be edited.")
    for field in ["issue_date", "due_date", "notes", "terms"]:
        if field in payload and payload[field] is not None:
            setattr(invoice, field, payload[field])
    if payload.get("line_items") is not None:
        invoice.lines = build_invoice_lines(db, invoice, payload["line_items"])
    invoice.updated_at = datetime.utcnow()
    recalculate_invoice_totals(invoice)
    invoice.amount_due = invoice.total
    return invoice


def create_payment_accounting_entry_stub(payment: Payment) -> None:
    _ = payment


def apply_payment(
    db: Session,
    payment_data: dict,
    applications_data: Sequence[object],
) -> Payment:
    if not applications_data:
        raise ValueError("At least one payment application is required.")

    normalized_applications: List[dict] = []
    for application in applications_data:
        if hasattr(application, "model_dump"):
            normalized = application.model_dump()
        elif isinstance(application, dict):
            normalized = application
        else:
            raise ValueError("Invalid payment application payload.")
        normalized_applications.append(normalized)

    invoice_ids = [application["invoice_id"] for application in normalized_applications]
    invoices = db.query(Invoice).filter(Invoice.id.in_(invoice_ids)).all()
    invoice_map = {invoice.id: invoice for invoice in invoices}
    if len(invoice_map) != len(set(invoice_ids)):
        raise ValueError("Invoice not found.")
    if payment_data.get("customer_id") is not None:
        for invoice in invoices:
            if invoice.customer_id != payment_data["customer_id"]:
                raise ValueError("Invoice does not belong to the payment customer.")
    for invoice in invoices:
        normalized_status = (invoice.status or "").upper()
        if normalized_status == "VOID":
            raise ValueError("Payments can only be applied to active invoices.")
        if normalized_status not in {"SENT", "POSTED", "SHIPPED", "PARTIALLY_PAID"}:
            raise ValueError("Payment rejected: invoice must be posted/shipped before recording payment.")
    applications_inputs: List[PaymentApplicationInput] = []
    for application in normalized_applications:
        invoice = invoice_map.get(application["invoice_id"])
        if not invoice:
            raise ValueError("Invoice not found.")
        recalculate_invoice_balance(db, invoice)
        if Decimal(invoice.amount_due or 0) <= 0:
            raise ValueError(f"Payment rejected: invoice {invoice.id} has no outstanding balance.")
        applied_amount = Decimal(application["applied_amount"])
        if applied_amount > Decimal(invoice.amount_due):
            raise ValueError(
                f"Payment rejected: applied amount for invoice {invoice.id} exceeds outstanding balance."
            )
        applications_inputs.append(
            PaymentApplicationInput(
                invoice_id=invoice.id,
                invoice_balance=Decimal(invoice.amount_due),
                applied_amount=applied_amount,
            )
        )
    validate_payment_applications(Decimal(payment_data["amount"]), applications_inputs)

    payment = Payment(
        customer_id=payment_data["customer_id"],
        invoice_id=payment_data.get("invoice_id"),
        amount=payment_data["amount"],
        payment_date=payment_data["payment_date"],
        method=payment_data.get("method"),
        reference=payment_data.get("reference"),
        memo=payment_data.get("memo"),
        notes=payment_data.get("notes"),
    )
    payment.applications = [
        PaymentApplication(invoice_id=application["invoice_id"], applied_amount=application["applied_amount"])
        for application in normalized_applications
    ]
    db.add(payment)
    db.flush()

    for application in payment.applications:
        invoice = invoice_map.get(application.invoice_id)
        if not invoice:
            continue
        postJournalEntries(
            "payment",
            {
                "event_id": f"payment:{payment.id}:invoice:{invoice.id}",
                "company_id": 1,
                "invoice_id": invoice.id,
                "payment_id": payment.id,
                "amount": Decimal(application.applied_amount or 0),
                "invoice_status": invoice.status,
                "reference_id": payment.id,
                "posting_date": payment.payment_date,
            },
            db,
        )

    from app.sales_management.order_execution import close_sales_order_if_paid
    from app.sales_requests.service import close_sales_request_if_paid

    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        update_invoice_status(invoice)
        invoice.updated_at = datetime.utcnow()
        if invoice.sales_request_id:
            close_sales_request_if_paid(db, invoice.sales_request_id)
        close_sales_order_if_paid(db, invoice.id)

    return payment


def create_invoice_payment(db: Session, payload: dict) -> Payment:
    invoice = db.query(Invoice).filter(Invoice.id == payload["invoice_id"]).first()
    if not invoice:
        raise ValueError("Invoice not found.")
    if invoice.status == "VOID":
        raise ValueError("Cannot record payment for a void invoice.")
    if (invoice.status or "").upper() not in {"SENT", "POSTED", "SHIPPED", "PARTIALLY_PAID"}:
        raise ValueError("Payment rejected: invoice must be posted/shipped before recording payment.")

    recalculate_invoice_balance(db, invoice)
    current_balance = Decimal(invoice.amount_due or 0)
    amount = Decimal(payload["amount"])
    if amount <= 0:
        raise ValueError("Payment amount must be greater than 0.")
    if amount > current_balance:
        raise ValueError("Payment amount cannot exceed current balance due.")

    return apply_payment(
        db,
        {
            "customer_id": invoice.customer_id,
            "invoice_id": invoice.id,
            "amount": amount,
            "payment_date": payload["payment_date"],
            "method": payload.get("method"),
            "notes": payload.get("notes"),
            "memo": payload.get("notes"),
        },
        [{"invoice_id": invoice.id, "applied_amount": amount}],
    )


def get_invoice_payments(db: Session, invoice_id: int) -> List[dict]:
    rows = (
        db.query(
            PaymentApplication.applied_amount,
            Payment.id,
            Payment.payment_date,
            Payment.amount,
            Payment.method,
            Payment.reference,
        )
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(PaymentApplication.invoice_id == invoice_id)
        .order_by(Payment.payment_date.desc())
        .all()
    )
    return [
        {
            "payment_id": row.id,
            "payment_date": row.payment_date,
            "amount": row.amount,
            "applied_amount": row.applied_amount,
            "method": row.method,
            "reference": row.reference,
        }
        for row in rows
    ]


def sales_summary(db: Session, start_date: date, end_date: date) -> List[dict]:
    rows = (
        db.query(Invoice.status, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .group_by(Invoice.status)
        .all()
    )
    return [
        {"status": status, "invoice_count": count, "total_amount": total} for status, count, total in rows
    ]


def ar_aging(db: Session, as_of: date) -> List[dict]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.status != "VOID")
        .filter(Invoice.due_date <= as_of)
        .all()
    )
    buckets = {"0-30": Decimal("0.00"), "31-60": Decimal("0.00"), "61-90": Decimal("0.00"), "90+": Decimal("0.00")}
    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        if invoice.amount_due <= 0:
            continue
        days_past_due = (as_of - invoice.due_date).days
        if days_past_due <= 30:
            buckets["0-30"] += invoice.amount_due
        elif days_past_due <= 60:
            buckets["31-60"] += invoice.amount_due
        elif days_past_due <= 90:
            buckets["61-90"] += invoice.amount_due
        else:
            buckets["90+"] += invoice.amount_due
    return [{"bucket": bucket, "amount": amount} for bucket, amount in buckets.items()]


def customer_revenue(db: Session, start_date: date, end_date: date) -> List[dict]:
    rows = (
        db.query(Customer.id, Customer.name, func.coalesce(func.sum(Invoice.total), 0))
        .join(Invoice, Invoice.customer_id == Customer.id)
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .filter(Invoice.status != "VOID")
        .group_by(Customer.id, Customer.name)
        .order_by(Customer.name)
        .all()
    )
    return [
        {"customer_id": customer_id, "customer_name": name, "total_revenue": total}
        for customer_id, name, total in rows
    ]


# ── Customer 360 ────────────────────────────────────────────────


def _payment_score(avg_days: Optional[float], overdue: Decimal) -> str:
    """Return a payment behaviour label: good / average / slow / at-risk."""
    if avg_days is None:
        return "good"
    if overdue > 0 and avg_days > 60:
        return "at-risk"
    if avg_days > 45:
        return "slow"
    if avg_days > 30:
        return "average"
    return "good"


def get_customer_360(db: Session, customer_id: int) -> dict:
    """Full Customer-360 payload: profile, KPIs, aging, trend, activity, top items."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise ValueError("Customer not found.")

    today = date.today()
    ytd_start = date(today.year, 1, 1)
    ltm_start = today - timedelta(days=365)
    active_filter = (Invoice.customer_id == customer_id, Invoice.status != "VOID")

    # ── KPIs ────────────────────────────────────────────────
    lifetime_revenue = Decimal(
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(*active_filter)
        .scalar() or 0
    )
    ytd_revenue = Decimal(
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(*active_filter, Invoice.issue_date >= ytd_start)
        .scalar() or 0
    )
    outstanding_ar = Decimal(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(*active_filter, Invoice.amount_due > 0)
        .scalar() or 0
    )
    total_invoices = db.query(func.count(Invoice.id)).filter(*active_filter).scalar() or 0
    total_payments = (
        db.query(func.count(Payment.id))
        .filter(Payment.customer_id == customer_id)
        .scalar() or 0
    )

    # Gross margin (LTM)
    margin_data = (
        db.query(
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.landed_unit_cost * InvoiceLine.quantity), 0).label("cost"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter, Invoice.issue_date >= ltm_start,
                InvoiceLine.landed_unit_cost.isnot(None), InvoiceLine.landed_unit_cost > 0)
        .one()
    )
    rev = Decimal(margin_data.revenue or 0)
    cost = Decimal(margin_data.cost or 0)
    gross_margin_percent = float((rev - cost) / rev * 100) if rev > 0 else None

    # Average days-to-pay (LTM)
    from app.sql_expressions import days_between
    ps = (
        db.query(
            func.coalesce(func.sum(PaymentApplication.applied_amount), 0).label("applied"),
            func.coalesce(
                func.sum(
                    days_between(Payment.payment_date, Invoice.issue_date, dialect_name=db.get_bind().dialect.name)
                    * PaymentApplication.applied_amount
                ), 0
            ).label("weighted"),
        )
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .join(Invoice, Invoice.id == PaymentApplication.invoice_id)
        .filter(Invoice.customer_id == customer_id, Invoice.status != "VOID", Payment.payment_date >= ltm_start)
        .one()
    )
    applied = Decimal(ps.applied or 0)
    weighted = Decimal(ps.weighted or 0)
    avg_days_to_pay = float(weighted / applied) if applied > 0 else None

    # Overdue
    overdue_amount = Decimal(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(*active_filter, Invoice.amount_due > 0, Invoice.due_date < today)
        .scalar() or 0
    )

    score = _payment_score(avg_days_to_pay, overdue_amount)

    kpis = {
        "lifetime_revenue": lifetime_revenue,
        "ytd_revenue": ytd_revenue,
        "outstanding_ar": outstanding_ar,
        "avg_days_to_pay": avg_days_to_pay,
        "gross_margin_percent": gross_margin_percent,
        "total_invoices": total_invoices,
        "total_payments": total_payments,
        "overdue_amount": overdue_amount,
        "payment_score": score,
    }

    # ── Aging buckets ───────────────────────────────────────
    open_invoices = (
        db.query(Invoice)
        .filter(*active_filter, Invoice.amount_due > 0)
        .all()
    )
    aging = {"current": Decimal(0), "days_1_30": Decimal(0), "days_31_60": Decimal(0),
             "days_61_90": Decimal(0), "days_90_plus": Decimal(0)}
    for inv in open_invoices:
        days_past = max((today - inv.due_date).days, 0) if inv.due_date <= today else -1
        amt = Decimal(inv.amount_due or 0)
        if days_past < 0:
            aging["current"] += amt
        elif days_past <= 30:
            aging["days_1_30"] += amt
        elif days_past <= 60:
            aging["days_31_60"] += amt
        elif days_past <= 90:
            aging["days_61_90"] += amt
        else:
            aging["days_90_plus"] += amt

    # ── Revenue trend (last 12 months) ──────────────────────
    revenue_trend: List[dict] = []
    for i in range(11, -1, -1):
        m_start = date(today.year, today.month, 1) - timedelta(days=i * 30)
        m_start = date(m_start.year, m_start.month, 1)
        if m_start.month == 12:
            m_end = date(m_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            m_end = date(m_start.year, m_start.month + 1, 1) - timedelta(days=1)
        period_label = m_start.strftime("%Y-%m")

        rev_val = Decimal(
            db.query(func.coalesce(func.sum(Invoice.total), 0))
            .filter(*active_filter, Invoice.issue_date >= m_start, Invoice.issue_date <= m_end)
            .scalar() or 0
        )
        pay_val = Decimal(
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.customer_id == customer_id, Payment.payment_date >= m_start, Payment.payment_date <= m_end)
            .scalar() or 0
        )
        revenue_trend.append({"period": period_label, "revenue": rev_val, "payments": pay_val})

    # ── Activity timeline (last 50 events) ──────────────────
    activity: List[dict] = []
    # Invoices
    invoices = (
        db.query(Invoice).filter(*active_filter)
        .order_by(Invoice.created_at.desc()).limit(20).all()
    )
    for inv in invoices:
        activity.append({
            "id": f"inv-{inv.id}",
            "type": "invoice_created",
            "title": f"Invoice {inv.invoice_number}",
            "description": f"Created for {currency_fmt(inv.total)} — {inv.status}",
            "amount": inv.total,
            "reference": inv.invoice_number,
            "date": inv.created_at,
            "icon": "invoice",
        })
        if inv.shipped_at:
            activity.append({
                "id": f"ship-{inv.id}",
                "type": "invoice_shipped",
                "title": f"Shipped {inv.invoice_number}",
                "description": f"Invoice shipped",
                "amount": inv.total,
                "reference": inv.invoice_number,
                "date": inv.shipped_at,
                "icon": "shipped",
            })
    # Payments
    payments = (
        db.query(Payment).filter(Payment.customer_id == customer_id)
        .order_by(Payment.created_at.desc()).limit(20).all()
    )
    for pmt in payments:
        inv_num = pmt.invoice.invoice_number if pmt.invoice else "N/A"
        activity.append({
            "id": f"pmt-{pmt.id}",
            "type": "payment_received",
            "title": f"Payment received",
            "description": f"{currency_fmt(pmt.amount)} applied to {inv_num}" + (f" via {pmt.method}" if pmt.method else ""),
            "amount": pmt.amount,
            "reference": pmt.reference,
            "date": pmt.created_at,
            "icon": "payment",
        })
    # AR collection activities (notes/reminders)
    ar_acts = (
        db.query(ARCollectionActivity).filter(ARCollectionActivity.customer_id == customer_id)
        .order_by(ARCollectionActivity.created_at.desc()).limit(10).all()
    )
    for act in ar_acts:
        activity.append({
            "id": f"ar-{act.id}",
            "type": act.activity_type.lower(),
            "title": act.activity_type.replace("_", " ").title(),
            "description": act.note or "",
            "amount": None,
            "reference": None,
            "date": act.created_at,
            "icon": "reminder" if "reminder" in act.activity_type.lower() else "note",
        })
    activity.sort(key=lambda x: x["date"], reverse=True)
    activity = activity[:50]

    # ── Top items purchased ─────────────────────────────────
    top_items_rows = (
        db.query(
            InvoiceLine.item_id,
            func.max(Item.item_code).label("item_code"),
            func.max(Item.sku).label("sku"),
            InvoiceLine.description,
            func.sum(InvoiceLine.quantity).label("qty"),
            func.sum(InvoiceLine.line_total).label("revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .outerjoin(Item, Item.id == InvoiceLine.item_id)
        .filter(*active_filter)
        .group_by(InvoiceLine.item_id, InvoiceLine.description)
        .order_by(func.sum(InvoiceLine.line_total).desc())
        .limit(10)
        .all()
    )
    top_items = [
        {
            "item_id": row.item_id,
            "item_code": row.item_code or row.sku,
            "item_name": row.description or "Untitled",
            "quantity": float(row.qty or 0),
            "revenue": float(row.revenue or 0),
        }
        for row in top_items_rows
    ]

    return {
        "customer": customer,
        "kpis": kpis,
        "aging": aging,
        "revenue_trend": revenue_trend,
        "recent_activity": activity,
        "top_items": top_items,
    }


def currency_fmt(v) -> str:
    """Tiny helper to format a decimal as $X,XXX.XX for activity descriptions."""
    try:
        return f"${Decimal(v):,.2f}"
    except Exception:
        return str(v)


def get_customers_enriched(
    db: Session,
    *,
    search: Optional[str] = None,
    tier: Optional[str] = None,
    is_active: Optional[bool] = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
) -> List[dict]:
    """Return enriched customer list with revenue, AR, payment behaviour."""
    today = date.today()
    ytd_start = date(today.year, 1, 1)

    query = (
        db.query(
            Customer,
            func.coalesce(func.sum(Invoice.total).filter(Invoice.status != "VOID", Invoice.issue_date >= ytd_start), 0).label("total_revenue"),
            func.coalesce(func.sum(Invoice.amount_due).filter(Invoice.status != "VOID", Invoice.amount_due > 0), 0).label("outstanding_ar"),
            func.count(Invoice.id.distinct()).filter(Invoice.status != "VOID").label("invoice_count"),
            func.max(Invoice.issue_date).filter(Invoice.status != "VOID").label("last_invoice_date"),
        )
        .outerjoin(Invoice, Invoice.customer_id == Customer.id)
        .group_by(Customer.id)
    )

    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Customer.name).like(like)
            | func.lower(func.coalesce(Customer.email, "")).like(like)
            | func.lower(func.coalesce(Customer.phone, "")).like(like)
            | func.lower(func.coalesce(Customer.customer_number, "")).like(like)
            | func.lower(func.coalesce(Customer.primary_contact, "")).like(like)
        )
    if tier:
        query = query.filter(Customer.tier == tier.upper())
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)

    # Sorting
    sort_map = {
        "name": Customer.name,
        "total_revenue": "total_revenue",
        "outstanding_ar": "outstanding_ar",
        "invoice_count": "invoice_count",
        "created_at": Customer.created_at,
    }
    sort_col = sort_map.get(sort_by, Customer.name)
    if isinstance(sort_col, str):
        sort_expr = text(sort_col)
    else:
        sort_expr = sort_col
    if sort_dir == "desc":
        sort_expr = sort_expr.desc() if hasattr(sort_expr, "desc") else text(f"{sort_col} DESC")
    query = query.order_by(sort_expr)

    rows = query.all()
    result = []
    for row in rows:
        cust = row[0]
        total_rev = Decimal(row[1] or 0)
        outstanding = Decimal(row[2] or 0)
        inv_count = row[3] or 0
        last_inv = row[4]

        # Quick payment score approximation
        overdue_amt = Decimal(
            db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
            .filter(Invoice.customer_id == cust.id, Invoice.status != "VOID",
                    Invoice.amount_due > 0, Invoice.due_date < today)
            .scalar() or 0
        )
        score = "good"
        if overdue_amt > 0:
            overdue_ratio = float(overdue_amt / outstanding) if outstanding > 0 else 1.0
            if overdue_ratio > 0.5:
                score = "at-risk"
            elif overdue_ratio > 0.2:
                score = "slow"
            else:
                score = "average"

        result.append({
            "id": cust.id,
            "customer_number": cust.customer_number,
            "name": cust.name,
            "primary_contact": cust.primary_contact,
            "email": cust.email,
            "phone": cust.phone,
            "payment_terms": cust.payment_terms,
            "tier": cust.tier or "STANDARD",
            "is_active": cust.is_active,
            "created_at": cust.created_at,
            "total_revenue": total_rev,
            "outstanding_ar": outstanding,
            "invoice_count": inv_count,
            "last_invoice_date": last_inv,
            "avg_days_to_pay": None,  # omitted from list for performance
            "payment_score": score,
        })
    return result


def get_customers_intelligence(db: Session, *, period: str = "ytd", top_n: int = 5) -> dict:
    today = date.today()
    active_period = period.lower()
    current_start = _period_start(today, active_period)
    current_days = max((today - current_start).days, 0)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=current_days)
    dormancy_cutoff = today - timedelta(days=180)
    current_month_start = date(today.year, today.month, 1)
    trend_start = _add_months(current_month_start, -11)

    customers = db.query(Customer).filter(Customer.is_active == True).all()
    customer_map = {customer.id: customer for customer in customers}
    customer_ids = list(customer_map.keys())
    if not customer_ids:
        return {
            "period": active_period,
            "dormant_count": 0,
            "collections_priority_count": 0,
            "fastest_growing": [],
            "biggest_declines": [],
            "largest_overdue": [],
            "dormant_customers": [],
            "collections_priority": [],
            "concentration": {
                "top_customer_share_percent": 0,
                "top_5_share_percent": 0,
                "top_10_share_percent": 0,
            },
            "trend": [],
        }

    current_rows = (
        db.query(
            Invoice.customer_id.label("customer_id"),
            func.coalesce(func.sum(Invoice.total), 0).label("revenue"),
            func.count(Invoice.id).label("invoice_count"),
        )
        .filter(
            Invoice.customer_id.in_(customer_ids),
            Invoice.status != "VOID",
            Invoice.issue_date >= current_start,
            Invoice.issue_date <= today,
        )
        .group_by(Invoice.customer_id)
        .all()
    )
    current_map = {
        row.customer_id: {
            "revenue": Decimal(row.revenue or 0),
            "invoice_count": int(row.invoice_count or 0),
        }
        for row in current_rows
    }

    previous_map: dict[int, Decimal] = {}
    if previous_end >= previous_start:
        previous_rows = (
            db.query(
                Invoice.customer_id.label("customer_id"),
                func.coalesce(func.sum(Invoice.total), 0).label("revenue"),
            )
            .filter(
                Invoice.customer_id.in_(customer_ids),
                Invoice.status != "VOID",
                Invoice.issue_date >= previous_start,
                Invoice.issue_date <= previous_end,
            )
            .group_by(Invoice.customer_id)
            .all()
        )
        previous_map = {row.customer_id: Decimal(row.revenue or 0) for row in previous_rows}

    outstanding_rows = (
        db.query(
            Invoice.customer_id.label("customer_id"),
            func.coalesce(func.sum(Invoice.amount_due), 0).label("outstanding"),
            func.coalesce(
                func.sum(
                    case(
                        (((Invoice.due_date < today) & (Invoice.amount_due > 0)), Invoice.amount_due),
                        else_=0,
                    )
                ),
                0,
            ).label("overdue"),
        )
        .filter(
            Invoice.customer_id.in_(customer_ids),
            Invoice.status != "VOID",
            Invoice.amount_due > 0,
        )
        .group_by(Invoice.customer_id)
        .all()
    )
    outstanding_map = {
        row.customer_id: {
            "outstanding": Decimal(row.outstanding or 0),
            "overdue": Decimal(row.overdue or 0),
        }
        for row in outstanding_rows
    }

    lifetime_rows = (
        db.query(
            Invoice.customer_id.label("customer_id"),
            func.coalesce(func.sum(Invoice.total), 0).label("revenue"),
            func.count(Invoice.id).label("invoice_count"),
            func.max(Invoice.issue_date).label("last_invoice_date"),
        )
        .filter(
            Invoice.customer_id.in_(customer_ids),
            Invoice.status != "VOID",
        )
        .group_by(Invoice.customer_id)
        .all()
    )
    lifetime_map = {
        row.customer_id: {
            "revenue": Decimal(row.revenue or 0),
            "invoice_count": int(row.invoice_count or 0),
            "last_invoice_date": row.last_invoice_date,
        }
        for row in lifetime_rows
    }

    trend_rows = (
        db.query(
            Invoice.customer_id.label("customer_id"),
            Invoice.issue_date.label("issue_date"),
            func.coalesce(func.sum(Invoice.total), 0).label("revenue"),
        )
        .filter(
            Invoice.customer_id.in_(customer_ids),
            Invoice.status != "VOID",
            Invoice.issue_date >= trend_start,
            Invoice.issue_date <= today,
        )
        .group_by(Invoice.customer_id, Invoice.issue_date)
        .all()
    )

    def payment_score(customer_id: int) -> str:
        outstanding = outstanding_map.get(customer_id, {}).get("outstanding", Decimal("0"))
        overdue = outstanding_map.get(customer_id, {}).get("overdue", Decimal("0"))
        if overdue <= 0:
            return "good"
        overdue_ratio = float(overdue / outstanding) if outstanding > 0 else 1.0
        if overdue_ratio > 0.5:
            return "at-risk"
        if overdue_ratio > 0.2:
            return "slow"
        return "average"

    def spotlight(customer_id: int, revenue: Decimal, change_percent: float | None = None) -> dict:
        customer = customer_map[customer_id]
        outstanding = outstanding_map.get(customer_id, {})
        lifetime = lifetime_map.get(customer_id, {})
        return {
            "customer_id": customer.id,
            "customer_number": customer.customer_number,
            "customer_name": customer.name,
            "revenue": quantize_money(revenue),
            "outstanding_ar": quantize_money(outstanding.get("outstanding", Decimal("0"))),
            "overdue_amount": quantize_money(outstanding.get("overdue", Decimal("0"))),
            "invoice_count": int(current_map.get(customer_id, {}).get("invoice_count", lifetime.get("invoice_count", 0))),
            "last_invoice_date": lifetime.get("last_invoice_date"),
            "payment_score": payment_score(customer_id),
            "change_percent": change_percent,
        }

    fastest_growing_candidates: list[dict] = []
    biggest_declines_candidates: list[dict] = []
    for customer_id in customer_ids:
        current_revenue = current_map.get(customer_id, {}).get("revenue", Decimal("0"))
        previous_revenue = previous_map.get(customer_id, Decimal("0"))
        if current_revenue <= 0 and previous_revenue <= 0:
            continue
        change_value = current_revenue - previous_revenue
        baseline = previous_revenue if previous_revenue > 0 else Decimal("1.00")
        change_percent = float((change_value / baseline) * Decimal("100"))
        row = spotlight(customer_id, current_revenue, change_percent)
        row["_change"] = change_value
        if change_value > 0:
            fastest_growing_candidates.append(row)
        elif change_value < 0:
            biggest_declines_candidates.append(row)

    fastest_growing = sorted(
        fastest_growing_candidates,
        key=lambda row: (row["_change"], row["revenue"]),
        reverse=True,
    )[:top_n]
    biggest_declines = sorted(
        biggest_declines_candidates,
        key=lambda row: (row["_change"], -row["revenue"]),
    )[:top_n]
    for row in fastest_growing + biggest_declines:
        row.pop("_change", None)

    largest_overdue = [
        spotlight(customer_id, current_map.get(customer_id, {}).get("revenue", Decimal("0")))
        for customer_id, amounts in sorted(
            outstanding_map.items(),
            key=lambda entry: (entry[1]["overdue"], entry[1]["outstanding"]),
            reverse=True,
        )
        if amounts["overdue"] > 0
    ][:top_n]

    dormant_candidates = [
        spotlight(customer_id, lifetime_map.get(customer_id, {}).get("revenue", Decimal("0")))
        for customer_id, data in lifetime_map.items()
        if data.get("invoice_count", 0) > 0 and data.get("last_invoice_date") and data["last_invoice_date"] < dormancy_cutoff
    ]
    dormant_count = len(dormant_candidates)
    dormant_customers = sorted(
        dormant_candidates,
        key=lambda row: (row["revenue"], row["overdue_amount"]),
        reverse=True,
    )[:top_n]

    collections_candidates = [
        spotlight(customer_id, current_map.get(customer_id, {}).get("revenue", Decimal("0")))
        for customer_id, amounts in outstanding_map.items()
        if amounts["overdue"] > 0 and current_map.get(customer_id, {}).get("revenue", Decimal("0")) > 0
    ]
    collections_priority_count = len(collections_candidates)
    collections_priority = sorted(
        collections_candidates,
        key=lambda row: (row["overdue_amount"], row["revenue"], row["outstanding_ar"]),
        reverse=True,
    )[:top_n]

    current_total = sum((values.get("revenue", Decimal("0")) for values in current_map.values()), Decimal("0"))
    sorted_current = sorted(current_map.items(), key=lambda entry: entry[1]["revenue"], reverse=True)
    top_customer_share = float((sorted_current[0][1]["revenue"] / current_total) * Decimal("100")) if current_total > 0 and sorted_current else 0.0
    top_5_share = float((sum((row[1]["revenue"] for row in sorted_current[:5]), Decimal("0")) / current_total) * Decimal("100")) if current_total > 0 else 0.0
    top_10_share = float((sum((row[1]["revenue"] for row in sorted_current[:10]), Decimal("0")) / current_total) * Decimal("100")) if current_total > 0 else 0.0

    trend_customer_ids = [customer_id for customer_id, _ in sorted_current[:top_n]]
    trend_map: dict[tuple[int, str], Decimal] = {}
    for row in trend_rows:
        if row.customer_id not in trend_customer_ids or row.issue_date is None:
            continue
        period_key = row.issue_date.strftime("%Y-%m")
        trend_map[(row.customer_id, period_key)] = trend_map.get((row.customer_id, period_key), Decimal("0")) + Decimal(row.revenue or 0)

    trend: list[dict] = []
    month_cursor = trend_start
    while month_cursor <= current_month_start:
        period_label = month_cursor.strftime("%Y-%m")
        for customer_id in trend_customer_ids:
            customer = customer_map[customer_id]
            trend.append({
                "period": period_label,
                "customer_id": customer_id,
                "customer_name": customer.name,
                "customer_number": customer.customer_number,
                "revenue": quantize_money(trend_map.get((customer_id, period_label), Decimal("0"))),
            })
        month_cursor = _add_months(month_cursor, 1)

    return {
        "period": active_period,
        "dormant_count": dormant_count,
        "collections_priority_count": collections_priority_count,
        "fastest_growing": fastest_growing,
        "biggest_declines": biggest_declines,
        "largest_overdue": largest_overdue,
        "dormant_customers": dormant_customers,
        "collections_priority": collections_priority,
        "concentration": {
            "top_customer_share_percent": top_customer_share,
            "top_5_share_percent": top_5_share,
            "top_10_share_percent": top_10_share,
        },
        "trend": trend,
    }


def _stock_status(on_hand: Decimal, reserved: Decimal, reorder: Decimal | None) -> str:
    """Return stock status: in_stock, low_stock, out_of_stock, overstocked."""
    available = on_hand - reserved
    if available <= 0:
        return "out_of_stock"
    if reorder is not None and reorder > 0:
        if available <= reorder:
            return "low_stock"
        if available > reorder * 5:
            return "overstocked"
    return "in_stock"


# ── Item 360 ────────────────────────────────────────────────


def get_item_360(db: Session, item_ref: int | str) -> dict:
    """Full Item-360 payload: detail, KPIs, sales trend, top customers, suppliers, movements."""
    from app.models import Inventory, InventoryMovement, SupplierItem, Supplier

    item_query = db.query(Item).options(selectinload(Item.supplier_items).selectinload(SupplierItem.supplier))
    item = None
    if isinstance(item_ref, str):
        item_code = item_ref.strip()
        if item_code:
            exact_code_matches = item_query.filter(Item.item_code == item_code).all()
            if len(exact_code_matches) == 1:
                item = exact_code_matches[0]
            elif len(exact_code_matches) > 1:
                raise ValueError("Multiple items share this item code.")
            else:
                exact_sku_matches = item_query.filter(Item.sku == item_code).all()
                if len(exact_sku_matches) == 1:
                    item = exact_sku_matches[0]
                elif len(exact_sku_matches) > 1:
                    raise ValueError("Multiple items share this SKU.")
        if not item and item_ref.isdigit():
            numeric_id = int(item_ref)
            item = item_query.filter(Item.id == numeric_id).first()
    elif isinstance(item_ref, int):
        item = item_query.filter(Item.id == item_ref).first()
    if not item:
        raise ValueError("Item not found.")
    item_id = item.id

    today = date.today()
    ytd_start = date(today.year, 1, 1)
    active_filter = (InvoiceLine.item_id == item_id, Invoice.status != "VOID")

    # ── Inventory ──────────────────────────────────────────
    inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    on_hand = Decimal(inventory.quantity_on_hand or 0) if inventory else Decimal(item.on_hand_qty or 0)
    reserved = Decimal(item.reserved_qty or 0)
    available = on_hand - reserved
    inv_value = _resolve_inventory_value(item, inventory, on_hand)
    reorder = Decimal(item.reorder_point or 0) if item.reorder_point else None

    # ── Sales KPIs ─────────────────────────────────────────
    total_revenue = Decimal(
        db.query(func.coalesce(func.sum(InvoiceLine.line_total), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter)
        .scalar() or 0
    )
    ytd_revenue = Decimal(
        db.query(func.coalesce(func.sum(InvoiceLine.line_total), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter, Invoice.issue_date >= ytd_start)
        .scalar() or 0
    )
    units_sold_total = Decimal(
        db.query(func.coalesce(func.sum(InvoiceLine.quantity), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter)
        .scalar() or 0
    )
    units_sold_ytd = Decimal(
        db.query(func.coalesce(func.sum(InvoiceLine.quantity), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter, Invoice.issue_date >= ytd_start)
        .scalar() or 0
    )

    avg_selling_price = None
    if units_sold_total > 0:
        avg_selling_price = total_revenue / units_sold_total

    # Gross margin
    margin_data = (
        db.query(
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
            func.coalesce(func.sum(InvoiceLine.landed_unit_cost * InvoiceLine.quantity), 0).label("cost"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(*active_filter, InvoiceLine.landed_unit_cost.isnot(None), InvoiceLine.landed_unit_cost > 0)
        .one()
    )
    rev = Decimal(margin_data.revenue or 0)
    cost = Decimal(margin_data.cost or 0)
    gross_margin_percent = float((rev - cost) / rev * 100) if rev > 0 else None

    unique_customers = (
        db.query(func.count(func.distinct(Invoice.customer_id)))
        .join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id)
        .filter(*active_filter)
        .scalar() or 0
    )
    total_invoices = (
        db.query(func.count(func.distinct(Invoice.id)))
        .join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id)
        .filter(*active_filter)
        .scalar() or 0
    )

    stock_status = _stock_status(on_hand, reserved, reorder)

    kpis = {
        "total_revenue": total_revenue,
        "ytd_revenue": ytd_revenue,
        "units_sold_ytd": units_sold_ytd,
        "units_sold_total": units_sold_total,
        "avg_selling_price": avg_selling_price,
        "gross_margin_percent": gross_margin_percent,
        "on_hand_qty": on_hand,
        "reserved_qty": reserved,
        "available_qty": available,
        "inventory_value": inv_value,
        "unique_customers": unique_customers,
        "total_invoices": total_invoices,
        "stock_status": stock_status,
    }

    # ── Sales trend (last 12 months) ───────────────────────
    sales_trend: List[dict] = []
    for i in range(11, -1, -1):
        m_start = date(today.year, today.month, 1) - timedelta(days=i * 30)
        m_start = date(m_start.year, m_start.month, 1)
        if m_start.month == 12:
            m_end = date(m_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            m_end = date(m_start.year, m_start.month + 1, 1) - timedelta(days=1)
        period_label = m_start.strftime("%Y-%m")

        rev_val = Decimal(
            db.query(func.coalesce(func.sum(InvoiceLine.line_total), 0))
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .filter(*active_filter, Invoice.issue_date >= m_start, Invoice.issue_date <= m_end)
            .scalar() or 0
        )
        units_val = Decimal(
            db.query(func.coalesce(func.sum(InvoiceLine.quantity), 0))
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .filter(*active_filter, Invoice.issue_date >= m_start, Invoice.issue_date <= m_end)
            .scalar() or 0
        )
        sales_trend.append({"period": period_label, "revenue": rev_val, "units": units_val})

    # ── Top customers ──────────────────────────────────────
    top_customers_rows = (
        db.query(
            Invoice.customer_id,
            Customer.name.label("customer_name"),
            func.sum(InvoiceLine.quantity).label("units"),
            func.sum(InvoiceLine.line_total).label("revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Customer, Customer.id == Invoice.customer_id)
        .filter(*active_filter)
        .group_by(Invoice.customer_id, Customer.name)
        .order_by(func.sum(InvoiceLine.line_total).desc())
        .limit(10)
        .all()
    )
    top_customers = [
        {
            "customer_id": row.customer_id,
            "customer_name": row.customer_name,
            "units": Decimal(row.units or 0),
            "revenue": Decimal(row.revenue or 0),
        }
        for row in top_customers_rows
    ]

    # ── Suppliers ──────────────────────────────────────────
    suppliers_list = []
    for link in item.supplier_items:
        suppliers_list.append({
            "supplier_id": link.supplier_id,
            "supplier_name": link.supplier.name if link.supplier else "Unknown",
            "supplier_cost": Decimal(link.supplier_cost or 0),
            "freight_cost": Decimal(link.freight_cost or 0),
            "tariff_cost": Decimal(link.tariff_cost or 0),
            "landed_cost": link.landed_cost,
            "is_preferred": link.is_preferred,
            "lead_time_days": link.lead_time_days,
            "min_order_qty": Decimal(link.min_order_qty or 0) if link.min_order_qty else None,
        })

    # ── Recent inventory movements ─────────────────────────
    movements_rows = (
        db.query(InventoryMovement)
        .filter(InventoryMovement.item_id == item_id)
        .order_by(InventoryMovement.created_at.desc())
        .limit(20)
        .all()
    )
    recent_movements = [
        {
            "id": m.id,
            "date": m.created_at,
            "reason": m.reason,
            "qty_delta": Decimal(m.qty_delta or 0),
            "ref_type": m.ref_type,
            "ref_id": m.ref_id,
        }
        for m in movements_rows
    ]

    # ── Item detail response ───────────────────────────────
    item_detail = {
        "id": item.id,
        "item_code": item.item_code,
        "sku": item.sku,
        "name": item.name,
        "color": item.color,
        "monument_type": item.monument_type,
        "lr_feet": item.lr_feet,
        "lr_inches": item.lr_inches,
        "fb_feet": item.fb_feet,
        "fb_inches": item.fb_inches,
        "tb_feet": item.tb_feet,
        "tb_inches": item.tb_inches,
        "shape": item.shape,
        "finish": item.finish,
        "category": item.category,
        "description": item.description,
        "sales_description": item.sales_description,
        "purchase_description": item.purchase_description,
        "unit_price": Decimal(item.unit_price or 0),
        "cost_price": Decimal(item.cost_price or 0) if item.cost_price is not None else None,
        "weight_lbs": Decimal(item.weight_lbs or 0) if item.weight_lbs is not None else None,
        "location": item.location,
        "peach_id": item.peach_id,
        "new_code": item.new_code,
        "exclude_from_price_list": item.exclude_from_price_list,
        "upload_to_peach": item.upload_to_peach,
        "item_type": item.item_type,
        "inventory_check": item.inventory_check,
        "income_account_id": item.income_account_id,
        "is_active": item.is_active,
        "created_at": item.created_at,
        "preferred_supplier_id": item.preferred_supplier_id,
        "preferred_supplier_name": item.preferred_supplier_name,
        "preferred_landed_cost": item.preferred_landed_cost,
        "on_hand_qty": on_hand,
        "reserved_qty": reserved,
        "reorder_point": item.reorder_point,
    }

    return {
        "item": item_detail,
        "kpis": kpis,
        "sales_trend": sales_trend,
        "top_customers": top_customers,
        "suppliers": suppliers_list,
        "recent_movements": recent_movements,
    }


def get_items_enriched(
    db: Session,
    *,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    stock_status: Optional[str] = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    page: int = 0,
    page_size: int = 50,
) -> dict:
    """Return enriched item list with inventory, revenue, margin data."""
    from app.models import Inventory, SupplierItem, Supplier

    today = date.today()
    ytd_start = date(today.year, 1, 1)

    items_all = (
        db.query(Item)
        .options(selectinload(Item.supplier_items).selectinload(SupplierItem.supplier))
        .all()
    )

    if search:
        like = search.lower()
        items_all = [i for i in items_all if like in (i.name or "").lower() or like in (i.sku or "").lower()]
    if is_active is not None:
        items_all = [i for i in items_all if i.is_active == is_active]

    # Batch-fetch inventory data
    item_ids = [i.id for i in items_all]
    inv_map: dict = {}
    if item_ids:
        inv_rows = db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
        inv_map = {row.item_id: row for row in inv_rows}

    # Batch-fetch YTD revenue + units
    ytd_data: dict = {}
    if item_ids:
        ytd_rows = (
            db.query(
                InvoiceLine.item_id,
                func.sum(InvoiceLine.line_total).label("revenue"),
                func.sum(InvoiceLine.quantity).label("units"),
                func.count(func.distinct(Invoice.customer_id)).label("unique_cust"),
            )
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .filter(
                InvoiceLine.item_id.in_(item_ids),
                Invoice.status != "VOID",
                Invoice.issue_date >= ytd_start,
            )
            .group_by(InvoiceLine.item_id)
            .all()
        )
        for row in ytd_rows:
            ytd_data[row.item_id] = {
                "revenue": Decimal(row.revenue or 0),
                "units": Decimal(row.units or 0),
                "unique_cust": row.unique_cust or 0,
            }

    # Batch-fetch margin data
    margin_data: dict = {}
    if item_ids:
        margin_rows = (
            db.query(
                InvoiceLine.item_id,
                func.sum(InvoiceLine.line_total).label("revenue"),
                func.sum(InvoiceLine.landed_unit_cost * InvoiceLine.quantity).label("cost"),
            )
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .filter(
                InvoiceLine.item_id.in_(item_ids),
                Invoice.status != "VOID",
                Invoice.issue_date >= ytd_start,
                InvoiceLine.landed_unit_cost.isnot(None),
                InvoiceLine.landed_unit_cost > 0,
            )
            .group_by(InvoiceLine.item_id)
            .all()
        )
        for row in margin_rows:
            rev = Decimal(row.revenue or 0)
            cst = Decimal(row.cost or 0)
            margin_data[row.item_id] = float((rev - cst) / rev * 100) if rev > 0 else None

    result = []
    for item in items_all:
        inv = inv_map.get(item.id)
        on_hand = Decimal(inv.quantity_on_hand or 0) if inv else Decimal(item.on_hand_qty or 0)
        reserved = Decimal(item.reserved_qty or 0)
        available = on_hand - reserved
        inv_value = _resolve_inventory_value(item, inv, on_hand)
        reorder = Decimal(item.reorder_point or 0) if item.reorder_point else None
        status = _stock_status(on_hand, reserved, reorder)

        ytd = ytd_data.get(item.id, {"revenue": Decimal(0), "units": Decimal(0), "unique_cust": 0})
        margin = margin_data.get(item.id)

        pref_name = item.preferred_supplier_name
        pref_cost = item.preferred_landed_cost

        result.append({
            "id": item.id,
            "name": item.name,
            "sku": item.sku,
            "unit_price": Decimal(item.unit_price or 0),
            "is_active": item.is_active,
            "created_at": item.created_at,
            "on_hand_qty": on_hand,
            "available_qty": available,
            "inventory_value": inv_value,
            "total_revenue_ytd": ytd["revenue"],
            "units_sold_ytd": ytd["units"],
            "gross_margin_percent": margin,
            "preferred_supplier_name": pref_name,
            "preferred_landed_cost": pref_cost,
            "stock_status": status,
            "unique_customers": ytd["unique_cust"],
        })

    # Filter by stock status
    if stock_status:
        result = [r for r in result if r["stock_status"] == stock_status]

    # Sorting
    sort_key_map = {
        "name": lambda r: (r["name"] or "").lower(),
        "unit_price": lambda r: r["unit_price"],
        "on_hand_qty": lambda r: r["on_hand_qty"],
        "available_qty": lambda r: r["available_qty"],
        "inventory_value": lambda r: r["inventory_value"],
        "total_revenue_ytd": lambda r: r["total_revenue_ytd"],
        "units_sold_ytd": lambda r: r["units_sold_ytd"],
        "gross_margin_percent": lambda r: r["gross_margin_percent"] if r["gross_margin_percent"] is not None else -999,
        "created_at": lambda r: r["created_at"],
    }
    key_fn = sort_key_map.get(sort_by, sort_key_map["name"])
    result.sort(key=key_fn, reverse=(sort_dir == "desc"))

    total_count = len(result)
    safe_page = max(page, 0)
    safe_page_size = max(1, min(page_size, 200))
    start = safe_page * safe_page_size
    end = start + safe_page_size

    return {
        "items": result[start:end],
        "total_count": total_count,
        "page": safe_page,
        "page_size": safe_page_size,
    }


def get_items_summary(db: Session) -> dict:
    """Aggregate KPIs for the items list header."""
    from app.models import Inventory

    today = date.today()
    ytd_start = date(today.year, 1, 1)

    total = db.query(func.count(Item.id)).scalar() or 0
    active = db.query(func.count(Item.id)).filter(Item.is_active == True).scalar() or 0

    rev_ytd = Decimal(
        db.query(func.coalesce(func.sum(InvoiceLine.line_total), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(Invoice.status != "VOID", Invoice.issue_date >= ytd_start)
        .scalar() or 0
    )

    # Count low/out of stock
    all_items = db.query(Item).filter(Item.is_active == True).all()
    inv_map = {}
    item_ids = [i.id for i in all_items]
    if item_ids:
        rows = db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all()
        inv_map = {r.item_id: r for r in rows}

    total_inv_value = Decimal("0.00")
    low_stock = 0
    out_of_stock = 0
    for item in all_items:
        inv = inv_map.get(item.id)
        on_hand = Decimal(inv.quantity_on_hand or 0) if inv else Decimal(item.on_hand_qty or 0)
        reserved = Decimal(item.reserved_qty or 0)
        reorder = Decimal(item.reorder_point or 0) if item.reorder_point else None
        total_inv_value += _resolve_inventory_value(item, inv, on_hand)
        status = _stock_status(on_hand, reserved, reorder)
        if status == "low_stock":
            low_stock += 1
        elif status == "out_of_stock":
            out_of_stock += 1

    return {
        "total_items": total,
        "active_items": active,
        "total_inventory_value": total_inv_value,
        "total_revenue_ytd": rev_ytd,
        "low_stock_items": low_stock,
        "out_of_stock_items": out_of_stock,
    }


def get_customers_summary(db: Session) -> dict:
    """Aggregate KPIs for the customer list header."""
    today = date.today()
    ytd_start = date(today.year, 1, 1)

    total = db.query(func.count(Customer.id)).scalar() or 0
    active = db.query(func.count(Customer.id)).filter(Customer.is_active == True).scalar() or 0

    rev_ytd = Decimal(
        db.query(func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.status != "VOID", Invoice.issue_date >= ytd_start)
        .scalar() or 0
    )
    total_ar = Decimal(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status != "VOID", Invoice.amount_due > 0)
        .scalar() or 0
    )

    # Count customers with significant overdue
    overdue_customers = (
        db.query(func.count(func.distinct(Invoice.customer_id)))
        .filter(Invoice.status != "VOID", Invoice.amount_due > 0, Invoice.due_date < today)
        .scalar() or 0
    )

    return {
        "total_customers": total,
        "active_customers": active,
        "total_revenue_ytd": rev_ytd,
        "total_outstanding_ar": total_ar,
        "avg_days_to_pay": None,
        "customers_at_risk": overdue_customers,
    }





