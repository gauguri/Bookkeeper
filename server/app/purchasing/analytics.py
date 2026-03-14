from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models import Item, PurchaseOrder, PurchaseOrderLine, Supplier, SupplierItem
from app.purchasing.service import po_total

ZERO = Decimal("0.00")
OPEN_PO_STATUSES = {"DRAFT", "SENT", "PARTIALLY_RECEIVED"}
RECEIVED_PO_STATUSES = {"PARTIALLY_RECEIVED", "RECEIVED"}


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _month_key(d: date) -> str:
    return d.strftime("%b")


def _safe_div(num: Decimal, denom: Decimal) -> Decimal:
    if denom == 0:
        return ZERO
    return num / denom


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value or 0))


def _format_currency(amount: Decimal) -> str:
    absolute = abs(amount)
    if absolute >= Decimal("1000000"):
        return f"${(amount / Decimal('1000000')):.2f}M"
    if absolute >= Decimal("1000"):
        return f"${(amount / Decimal('1000')):.1f}K"
    return f"${amount:.2f}"


def _format_count(value: int) -> str:
    return f"{value}"


def _format_days(value: Decimal) -> str:
    if value <= 0:
        return "--"
    return f"{value.quantize(Decimal('0.1'))}d"


def _format_percent(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.1'))}%"


def _average(values: list[Decimal]) -> Decimal:
    if not values:
        return ZERO
    return sum(values, ZERO) / Decimal(len(values))


def _build_risk_items(pos: list[PurchaseOrder], suppliers: list[Supplier]) -> list[dict[str, Any]]:
    open_po_value_by_supplier: dict[int, Decimal] = defaultdict(lambda: ZERO)
    open_po_count_by_supplier: dict[int, int] = defaultdict(int)
    for po in pos:
        if po.status in OPEN_PO_STATUSES:
            open_po_value_by_supplier[po.supplier_id] += po_total(po)
            open_po_count_by_supplier[po.supplier_id] += 1

    max_exposure = max(open_po_value_by_supplier.values(), default=ZERO)
    items: list[dict[str, Any]] = []
    for supplier in suppliers:
        missing_contact = not (supplier.email or supplier.phone)
        missing_catalog = len(supplier.supplier_items) == 0
        lead_time = supplier.default_lead_time_days or 0
        open_exposure = open_po_value_by_supplier[supplier.id]
        open_count = open_po_count_by_supplier[supplier.id]

        triggers: list[tuple[str, Decimal, Decimal, str]] = []
        if missing_catalog:
            triggers.append(("Missing catalog coverage", Decimal("0.55"), Decimal("0.45"), "Master Data"))
        if missing_contact:
            triggers.append(("Missing supplier contact", Decimal("0.40"), Decimal("0.35"), "Supplier"))
        if lead_time > 60:
            impact = Decimal("0.55") if open_exposure == 0 else Decimal("0.75")
            triggers.append(("Long lead-time supplier", Decimal("0.70"), impact, "Delivery"))
        if open_count >= 2:
            probability = Decimal("0.50") + Decimal(min(open_count, 4)) * Decimal("0.05")
            impact = Decimal("0.45") + _safe_div(open_exposure, max_exposure or Decimal("1")) * Decimal("0.40")
            triggers.append(("Open PO backlog concentration", probability, impact, "Backlog"))

        for index, (label, probability, impact, category) in enumerate(triggers, start=1):
            score = probability * impact
            if score >= Decimal("0.55"):
                level = "critical"
            elif score >= Decimal("0.40"):
                level = "high"
            elif score >= Decimal("0.25"):
                level = "medium"
            else:
                level = "low"
            exposure = open_exposure if open_exposure > 0 else Decimal("0.00")
            items.append(
                {
                    "id": f"SUP-{supplier.id}-{index}",
                    "label": f"{supplier.name}: {label}",
                    "probability": float((probability * Decimal("100")).quantize(Decimal("0.01"))),
                    "impact": float((impact * Decimal("100")).quantize(Decimal("0.01"))),
                    "exposure": exposure.quantize(Decimal("0.01")),
                    "category": category,
                    "level": level,
                }
            )
    return sorted(items, key=lambda item: (item["impact"] * item["probability"], item["exposure"]), reverse=True)[:10]


def _build_insights(
    *,
    open_po_count: int,
    total_spend: Decimal,
    suppliers: list[Supplier],
    compliance_rules: list[dict[str, Any]],
    risk_items: list[dict[str, Any]],
) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    long_lead = [supplier for supplier in suppliers if (supplier.default_lead_time_days or 0) > 60]
    missing_catalog = [supplier for supplier in suppliers if len(supplier.supplier_items) == 0]
    if open_po_count:
        insights.append(
            {
                "id": "backlog",
                "title": f"{open_po_count} purchase orders are still open",
                "description": f"Current open procurement commitments total {_format_currency(total_spend)} across draft, sent, and partially received orders.",
                "recommendation": "Review open POs with expected dates and push the oldest orders to receipt or cancellation.",
                "category": "Backlog",
            }
        )
    if long_lead:
        insights.append(
            {
                "id": "lead-time",
                "title": f"{len(long_lead)} suppliers have long lead times",
                "description": "Suppliers with lead times above 60 days materially increase replenishment risk.",
                "recommendation": "Prioritize alternate sourcing or earlier PO releases for these suppliers.",
                "category": "Delivery",
            }
        )
    if missing_catalog:
        insights.append(
            {
                "id": "catalog",
                "title": f"{len(missing_catalog)} suppliers have no item catalog",
                "description": "Supplier records without linked items weaken sourcing controls and pricing consistency.",
                "recommendation": "Map supplier items so new POs default the correct cost and preferred vendor.",
                "category": "Master Data",
            }
        )
    weak_rule = next((rule for rule in compliance_rules if rule["failed"] > 0), None)
    if weak_rule and len(insights) < 4:
        insights.append(
            {
                "id": "compliance",
                "title": f"Compliance gap: {weak_rule['rule']}",
                "description": f"{weak_rule['failed']} procurement records currently fail this live control.",
                "recommendation": "Clear the failed records before relying on downstream analytics or approvals.",
                "category": "Compliance",
            }
        )
    if not insights:
        insights.append(
            {
                "id": "healthy",
                "title": "Live procurement data is currently stable",
                "description": "No material procurement backlog, lead-time, or master-data issues were detected from the current records.",
                "recommendation": "Keep supplier master data and PO posting discipline current to preserve clean analytics.",
                "category": "Operations",
            }
        )
    if risk_items and len(insights) < 5:
        top_risk = risk_items[0]
        insights.append(
            {
                "id": "risk",
                "title": f"Highest current risk: {top_risk['category']}",
                "description": top_risk["label"],
                "recommendation": "Resolve the highest exposure supplier issue before expanding purchase commitments.",
                "category": "Risk",
            }
        )
    return insights[:5]


def get_procurement_hub_analytics(db: Session, as_of: date) -> dict[str, Any]:
    ytd_start = date(as_of.year, 1, 1)
    trend_start = _add_months(date(as_of.year, as_of.month, 1), -11)

    pos = (
        db.query(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.item),
            selectinload(PurchaseOrder.supplier),
        )
        .filter(PurchaseOrder.order_date >= trend_start, PurchaseOrder.order_date <= as_of)
        .all()
    )
    suppliers = (
        db.query(Supplier)
        .options(selectinload(Supplier.supplier_items))
        .order_by(Supplier.name.asc())
        .all()
    )

    live_pos = [po for po in pos if po.status != "CANCELLED"]
    ytd_pos = [po for po in live_pos if ytd_start <= po.order_date <= as_of]
    ytd_open_pos = [po for po in ytd_pos if po.status in OPEN_PO_STATUSES]
    ytd_received_pos = [po for po in ytd_pos if po.status in RECEIVED_PO_STATUSES]

    total_spend = sum((po_total(po) for po in ytd_pos), ZERO).quantize(Decimal("0.01"))
    open_po_value = sum((po_total(po) for po in ytd_open_pos), ZERO).quantize(Decimal("0.01"))
    received_po_value = sum((po_total(po) for po in ytd_received_pos), ZERO).quantize(Decimal("0.01"))

    active_suppliers = sum(1 for supplier in suppliers if (supplier.status or "active") == "active")
    avg_lead_time_query = db.query(func.avg(Supplier.default_lead_time_days)).scalar() or 0
    average_lead_time_days = Decimal(str(avg_lead_time_query or 0)).quantize(Decimal("0.1"))
    total_items = db.query(func.count(Item.id)).scalar() or 0
    mapped_items = (
        db.query(func.count(func.distinct(SupplierItem.item_id)))
        .filter(SupplierItem.is_active.is_(True))
        .scalar()
        or 0
    )
    coverage_pct = (
        (Decimal(mapped_items) / Decimal(total_items) * Decimal("100"))
        if total_items
        else ZERO
    ).quantize(Decimal("0.1"))

    monthly_spend: dict[date, Decimal] = {}
    cursor = trend_start
    while cursor <= as_of:
        monthly_spend[cursor] = ZERO
        cursor = _add_months(cursor, 1)
    for po in live_pos:
        month_start = date(po.order_date.year, po.order_date.month, 1)
        monthly_spend[month_start] = monthly_spend.get(month_start, ZERO) + po_total(po)
    spend_trend = [
        {"month": _month_key(month), "actual_spend": amount.quantize(Decimal("0.01"))}
        for month, amount in monthly_spend.items()
    ]

    vendor_spend_totals: dict[int, dict[str, Any]] = {}
    for po in ytd_pos:
        supplier_name = po.supplier.name if po.supplier else f"Supplier #{po.supplier_id}"
        row = vendor_spend_totals.setdefault(
            po.supplier_id,
            {"supplier_id": po.supplier_id, "supplier_name": supplier_name, "total_spend": ZERO},
        )
        row["total_spend"] += po_total(po)
    vendor_spend = sorted(vendor_spend_totals.values(), key=lambda row: row["total_spend"], reverse=True)[:5]
    for row in vendor_spend:
        row["total_spend"] = row["total_spend"].quantize(Decimal("0.01"))

    order_to_sent: list[Decimal] = []
    planned_lead: list[Decimal] = []
    order_to_receipt: list[Decimal] = []
    for po in ytd_pos:
        if po.sent_at is not None:
            order_to_sent.append(Decimal((po.sent_at.date() - po.order_date).days))
        if po.expected_date is not None:
            planned_lead.append(Decimal((po.expected_date - po.order_date).days))
        if po.landed_at is not None:
            order_to_receipt.append(Decimal((po.landed_at.date() - po.order_date).days))
    cycle_metrics = [
        {
            "key": "order_to_sent",
            "stage": "Order to Sent",
            "avg_days": float(_average(order_to_sent).quantize(Decimal("0.1"))) if order_to_sent else 0.0,
            "sample_size": len(order_to_sent),
        },
        {
            "key": "planned_lead",
            "stage": "Planned Lead Time",
            "avg_days": float(_average(planned_lead).quantize(Decimal("0.1"))) if planned_lead else 0.0,
            "sample_size": len(planned_lead),
        },
        {
            "key": "order_to_receipt",
            "stage": "Order to Receipt",
            "avg_days": float(_average(order_to_receipt).quantize(Decimal("0.1"))) if order_to_receipt else 0.0,
            "sample_size": len(order_to_receipt),
        },
    ]

    total_ytd_pos = len(ytd_pos)
    sent_or_received_pos = [po for po in ytd_pos if po.status in {"SENT", "PARTIALLY_RECEIVED", "RECEIVED"}]
    po_lines = [line for po in ytd_pos for line in po.lines]
    received_with_posting = [po for po in ytd_received_pos if po.posted_journal_entry_id is not None]
    compliance_rules = []
    for rule_id, rule_label, passed, total in [
        ("expected-date", "Expected date captured", sum(1 for po in ytd_pos if po.expected_date is not None), total_ytd_pos),
        ("supplier-contact", "Supplier contact available for transmitted POs", sum(1 for po in sent_or_received_pos if po.supplier and (po.supplier.email or po.supplier.phone)), len(sent_or_received_pos)),
        ("line-pricing", "PO lines have non-zero unit cost", sum(1 for line in po_lines if _decimal(line.unit_cost) > 0), len(po_lines)),
        ("received-posted", "Received POs posted to accounting", len(received_with_posting), len(ytd_received_pos)),
    ]:
        failed = max(total - passed, 0)
        rate = float((Decimal(passed) / Decimal(total) * Decimal("100")).quantize(Decimal("0.1"))) if total else 0.0
        compliance_rules.append(
            {
                "id": rule_id,
                "rule": rule_label,
                "passed": passed,
                "failed": failed,
                "total": total,
                "rate_percent": rate,
            }
        )

    risk_items = _build_risk_items(ytd_pos, suppliers)
    insights = _build_insights(
        open_po_count=len(ytd_open_pos),
        total_spend=open_po_value,
        suppliers=suppliers,
        compliance_rules=compliance_rules,
        risk_items=risk_items,
    )

    cards = [
        {
            "key": "total_spend_ytd",
            "label": "Total Spend",
            "value": float(total_spend),
            "display_value": _format_currency(total_spend),
            "helper": "Live YTD PO value",
            "unit": "currency",
        },
        {
            "key": "open_purchase_orders",
            "label": "Open POs",
            "value": len(ytd_open_pos),
            "display_value": _format_count(len(ytd_open_pos)),
            "helper": "Draft, sent, or partially received",
            "unit": "count",
        },
        {
            "key": "average_lead_time_days",
            "label": "Avg Lead Time",
            "value": float(average_lead_time_days),
            "display_value": _format_days(average_lead_time_days),
            "helper": "Supplier master average",
            "unit": "days",
        },
        {
            "key": "received_purchase_orders",
            "label": "Received POs",
            "value": len(ytd_received_pos),
            "display_value": _format_count(len(ytd_received_pos)),
            "helper": f"{_format_currency(received_po_value)} received YTD",
            "unit": "count",
        },
        {
            "key": "active_suppliers",
            "label": "Active Suppliers",
            "value": active_suppliers,
            "display_value": _format_count(active_suppliers),
            "helper": "Supplier master status = active",
            "unit": "count",
        },
        {
            "key": "catalog_coverage_percent",
            "label": "Catalog Coverage",
            "value": float(coverage_pct),
            "display_value": _format_percent(coverage_pct),
            "helper": "Items mapped to active supplier links",
            "unit": "percent",
        },
    ]

    return {
        "cards": cards,
        "spend_trend": spend_trend,
        "vendor_spend": vendor_spend,
        "cycle_metrics": cycle_metrics,
        "compliance_rules": compliance_rules,
        "risk_items": risk_items,
        "insights": insights,
    }
