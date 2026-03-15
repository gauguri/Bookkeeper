from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Customer, DiscountApprovalRule, Invoice, InvoiceLine, Item, Opportunity, Quote, SalesAccount
from app.pricing.mwb import compute_mwb_price
from app.sales.service import DEFAULT_MARGIN_THRESHOLD_PERCENT, get_customer_360, get_item_pricing_context
from app.utils import quantize_money


ZERO = Decimal("0.00")
HUNDRED = Decimal("100")


@dataclass
class QuoteLineInput:
    item_id: int | None
    description: str | None
    qty: Decimal
    unit_price: Decimal
    discount_pct: Decimal


def normalize_discount_pct(value: Decimal | float | int | str | None) -> Decimal:
    pct = Decimal(str(value or 0))
    if pct > Decimal("1"):
        pct = pct / HUNDRED
    if pct < 0:
        pct = Decimal("0")
    return pct.quantize(Decimal("0.0001"))


def display_discount_pct(value: Decimal | float | int | str | None) -> Decimal:
    return (normalize_discount_pct(value) * HUNDRED).quantize(Decimal("0.01"))


def _to_decimal(value: Any, fallback: Decimal = ZERO) -> Decimal:
    if value is None:
        return fallback
    return Decimal(str(value))


def _quantize(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return quantize_money(value) or ZERO


def _gross_margin_percent(revenue: Decimal, cost: Decimal) -> Decimal | None:
    if revenue <= 0:
        return None
    return ((revenue - cost) / revenue * HUNDRED).quantize(Decimal("0.01"))


def _floor_price_from_cost(cost: Decimal | None, margin_threshold_percent: Decimal) -> Decimal | None:
    if cost is None or cost <= 0:
        return None
    denominator = Decimal("1") - (margin_threshold_percent / HUNDRED)
    if denominator <= 0:
        return None
    return _quantize(cost / denominator)


def _discount_approval_limit(db: Session) -> Decimal:
    max_rule = db.query(func.max(DiscountApprovalRule.max_discount_pct)).scalar()
    if max_rule is None:
        return Decimal("10.00")
    value = _to_decimal(max_rule)
    if value <= Decimal("1"):
        value *= HUNDRED
    return value.quantize(Decimal("0.01"))


def _line_from_payload(payload: dict[str, Any]) -> QuoteLineInput:
    return QuoteLineInput(
        item_id=payload.get("item_id"),
        description=payload.get("description"),
        qty=_to_decimal(payload.get("qty") or 0),
        unit_price=_to_decimal(payload.get("unit_price") or 0),
        discount_pct=normalize_discount_pct(payload.get("discount_pct") or 0),
    )


def _resolve_customer_for_account(db: Session, account: SalesAccount | None) -> Customer | None:
    if not account:
        return None
    if account.customer_id:
        return db.query(Customer).filter(Customer.id == account.customer_id).first()
    return db.query(Customer).filter(func.lower(Customer.name) == (account.name or "").strip().lower()).first()


def _customer_context_payload(db: Session, account: SalesAccount | None) -> dict[str, Any]:
    customer = _resolve_customer_for_account(db, account)
    if not account:
        return {
            "account_id": None,
            "account_name": None,
            "customer_id": None,
            "customer_name": None,
            "tier": "STANDARD",
            "ytd_revenue": ZERO,
            "lifetime_revenue": ZERO,
            "outstanding_ar": ZERO,
            "avg_days_to_pay": None,
            "gross_margin_percent": None,
            "payment_score": "unknown",
            "overdue_amount": ZERO,
            "top_items": [],
        }
    if not customer:
        return {
            "account_id": account.id,
            "account_name": account.name,
            "customer_id": None,
            "customer_name": None,
            "tier": "STANDARD",
            "ytd_revenue": ZERO,
            "lifetime_revenue": ZERO,
            "outstanding_ar": ZERO,
            "avg_days_to_pay": None,
            "gross_margin_percent": None,
            "payment_score": "unknown",
            "overdue_amount": ZERO,
            "top_items": [],
        }

    customer_360 = get_customer_360(db, customer.id)
    return {
        "account_id": account.id,
        "account_name": account.name,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "tier": customer.tier or "STANDARD",
        "ytd_revenue": _quantize(_to_decimal(customer_360["kpis"]["ytd_revenue"])),
        "lifetime_revenue": _quantize(_to_decimal(customer_360["kpis"]["lifetime_revenue"])),
        "outstanding_ar": _quantize(_to_decimal(customer_360["kpis"]["outstanding_ar"])),
        "avg_days_to_pay": customer_360["kpis"].get("avg_days_to_pay"),
        "gross_margin_percent": customer_360["kpis"].get("gross_margin_percent"),
        "payment_score": customer_360["kpis"].get("payment_score", "unknown"),
        "overdue_amount": _quantize(_to_decimal(customer_360["kpis"]["overdue_amount"])),
        "top_items": customer_360.get("top_items", []),
    }


def _quoted_item_ids(lines: list[QuoteLineInput]) -> set[int]:
    return {line.item_id for line in lines if line.item_id}


def _build_upsell_suggestions(
    db: Session,
    *,
    customer_id: int | None,
    quoted_item_ids: set[int],
    limit: int = 3,
) -> list[dict[str, Any]]:
    if not quoted_item_ids:
        return []

    invoice_ids = [
        invoice_id
        for (invoice_id,) in (
            db.query(InvoiceLine.invoice_id)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .filter(Invoice.status != "VOID", InvoiceLine.item_id.in_(quoted_item_ids))
            .distinct()
            .all()
        )
    ]
    if not invoice_ids:
        return []

    candidates = (
        db.query(
            InvoiceLine.item_id.label("item_id"),
            func.count(func.distinct(InvoiceLine.invoice_id)).label("co_purchase_count"),
            func.coalesce(func.sum(InvoiceLine.line_total), 0).label("revenue"),
        )
        .filter(
            InvoiceLine.invoice_id.in_(invoice_ids),
            InvoiceLine.item_id.isnot(None),
            ~InvoiceLine.item_id.in_(quoted_item_ids),
        )
        .group_by(InvoiceLine.item_id)
        .order_by(func.count(func.distinct(InvoiceLine.invoice_id)).desc(), func.sum(InvoiceLine.line_total).desc())
        .limit(limit * 2)
        .all()
    )

    suggestions: list[dict[str, Any]] = []
    for candidate in candidates:
        item = db.query(Item).filter(Item.id == candidate.item_id).first()
        if not item:
            continue
        recommended_price = _to_decimal(item.unit_price or 0)
        if customer_id:
            try:
                context = get_item_pricing_context(db, item_id=item.id, customer_id=customer_id)
                recommended_price = _to_decimal(context.get("recommended_price") or item.unit_price)
            except ValueError:
                pass
        suggestions.append(
            {
                "item_id": item.id,
                "name": item.name,
                "sku": item.sku,
                "reason": "Frequently purchased alongside items already on this deal.",
                "available_qty": _to_decimal(item.on_hand_qty or 0) - _to_decimal(item.reserved_qty or 0),
                "unit_price": _quantize(_to_decimal(item.unit_price or 0)),
                "recommended_price": _quantize(recommended_price),
                "co_purchase_count": int(candidate.co_purchase_count or 0),
                "revenue": _quantize(_to_decimal(candidate.revenue or 0)),
            }
        )
        if len(suggestions) >= limit:
            break
    return suggestions


def evaluate_deal(
    db: Session,
    *,
    opportunity_id: int,
    lines_payload: list[dict[str, Any]],
    valid_until: date | None = None,
) -> dict[str, Any]:
    opportunity = (
        db.query(Opportunity)
        .options(joinedload(Opportunity.account))
        .filter(Opportunity.id == opportunity_id)
        .first()
    )
    if not opportunity:
        raise ValueError("Opportunity not found.")

    account = opportunity.account
    customer_context = _customer_context_payload(db, account)
    customer_id = customer_context.get("customer_id")
    discount_limit_percent = _discount_approval_limit(db)
    margin_floor_percent = DEFAULT_MARGIN_THRESHOLD_PERCENT.quantize(Decimal("0.01"))

    lines = [_line_from_payload(line) for line in lines_payload]
    line_evaluations: list[dict[str, Any]] = []
    approval_reasons: list[str] = []
    risk_flags: list[str] = []
    recommended_revenue_uplift = ZERO
    subtotal = ZERO
    total_discount = ZERO
    total_revenue = ZERO
    total_cost = ZERO
    total_confidence = Decimal("0")
    confident_lines = 0

    for index, line in enumerate(lines, start=1):
        quantity = max(line.qty, ZERO)
        entered_unit_price = _quantize(line.unit_price) or ZERO
        discount_fraction = line.discount_pct
        discount_percent = display_discount_pct(discount_fraction)
        entered_net_unit_price = _quantize(entered_unit_price * (Decimal("1") - discount_fraction)) or ZERO
        line_subtotal = _quantize(quantity * entered_unit_price) or ZERO
        line_discount = _quantize(line_subtotal * discount_fraction) or ZERO
        line_total = _quantize(line_subtotal - line_discount) or ZERO
        subtotal += line_subtotal
        total_discount += line_discount

        evaluation: dict[str, Any] = {
            "line_number": index,
            "item_id": line.item_id,
            "description": line.description,
            "qty": quantity,
            "entered_unit_price": entered_unit_price,
            "entered_net_unit_price": entered_net_unit_price,
            "discount_percent": discount_percent,
            "line_total": line_total,
            "list_price": None,
            "recommended_unit_price": None,
            "recommended_net_unit_price": None,
            "recommended_line_total": None,
            "floor_unit_price": None,
            "preferred_landed_cost": None,
            "margin_percent": None,
            "confidence": "Low",
            "confidence_score": 0.0,
            "source_level": "manual",
            "available_qty": ZERO,
            "stock_risk": "unknown",
            "approval_reasons": [],
            "opportunity_uplift": ZERO,
            "warnings": [],
        }

        if not line.item_id:
            evaluation["warnings"] = ["Select an item to unlock pricing guidance."]
            line_evaluations.append(evaluation)
            continue

        item = db.query(Item).filter(Item.id == line.item_id).first()
        if not item:
            evaluation["warnings"] = ["Item not found."]
            line_evaluations.append(evaluation)
            continue

        pricing_context = get_item_pricing_context(db, item_id=item.id, customer_id=customer_id)
        recommended_unit_price = _to_decimal(pricing_context.get("recommended_price") or item.unit_price)
        source_level = "pricing_context"
        confidence = "Medium"
        confidence_score = 0.35
        if customer_id:
            try:
                mwb = compute_mwb_price(db, customer_id=customer_id, item_id=item.id, qty=quantity or Decimal("1"))
                recommended_unit_price = mwb.mwb_unit_price
                source_level = mwb.source_level
                confidence = mwb.confidence
                confidence_score = mwb.confidence_score
            except Exception:
                pass

        recommended_unit_price = max(_to_decimal(item.unit_price or 0), recommended_unit_price)
        recommended_unit_price = _quantize(recommended_unit_price) or ZERO
        recommended_net_unit_price = _quantize(recommended_unit_price * (Decimal("1") - discount_fraction)) or ZERO
        preferred_landed_cost = pricing_context.get("landed_unit_cost")
        preferred_landed_cost = _quantize(_to_decimal(preferred_landed_cost)) if preferred_landed_cost is not None else None
        floor_unit_price = _floor_price_from_cost(preferred_landed_cost, margin_floor_percent)
        recommended_line_total = _quantize(recommended_net_unit_price * quantity) or ZERO
        margin_percent = _gross_margin_percent(entered_net_unit_price, preferred_landed_cost or ZERO) if preferred_landed_cost else None
        available_qty = _quantize(_to_decimal(pricing_context.get("available_qty") or ZERO)) or ZERO
        stock_risk = "healthy"
        if available_qty <= 0:
            stock_risk = "out_of_stock"
        elif available_qty < quantity:
            stock_risk = "short"

        line_approval_reasons: list[str] = []
        if discount_percent > discount_limit_percent:
            line_approval_reasons.append(f"Discount {discount_percent}% exceeds policy threshold of {discount_limit_percent}%.")
        if floor_unit_price is not None and entered_net_unit_price < floor_unit_price:
            line_approval_reasons.append(f"Net sell {entered_net_unit_price} is below margin floor {floor_unit_price}.")
        if margin_percent is not None and margin_percent < margin_floor_percent:
            line_approval_reasons.append(f"Gross margin {margin_percent}% is below required floor {margin_floor_percent}%.")
        if recommended_net_unit_price > entered_net_unit_price and entered_net_unit_price > ZERO:
            gap_pct = ((recommended_net_unit_price - entered_net_unit_price) / entered_net_unit_price * HUNDRED).quantize(Decimal("0.01"))
            if gap_pct >= Decimal("8.00"):
                line_approval_reasons.append(f"Quoted price trails recommendation by {gap_pct}%.")

        if line_approval_reasons:
            approval_reasons.extend(line_approval_reasons)
        if stock_risk == "out_of_stock":
            risk_flags.append(f"{item.name} is out of stock.")
        elif stock_risk == "short":
            risk_flags.append(f"{item.name} is short against requested quantity.")

        uplift = max(recommended_line_total - line_total, ZERO)
        recommended_revenue_uplift += uplift
        total_revenue += line_total
        total_cost += (preferred_landed_cost or ZERO) * quantity
        total_confidence += Decimal(str(confidence_score))
        confident_lines += 1

        evaluation.update(
            {
                "item_id": item.id,
                "description": line.description or item.name,
                "sku": item.sku,
                "list_price": _quantize(_to_decimal(item.unit_price or 0)),
                "recommended_unit_price": recommended_unit_price,
                "recommended_net_unit_price": recommended_net_unit_price,
                "recommended_line_total": recommended_line_total,
                "floor_unit_price": floor_unit_price,
                "preferred_landed_cost": preferred_landed_cost,
                "margin_percent": margin_percent,
                "confidence": confidence,
                "confidence_score": confidence_score,
                "source_level": source_level,
                "available_qty": available_qty,
                "stock_risk": stock_risk,
                "approval_reasons": line_approval_reasons,
                "opportunity_uplift": _quantize(uplift),
                "warnings": pricing_context.get("warnings", []),
            }
        )
        line_evaluations.append(evaluation)

    if customer_context.get("payment_score") in {"slow", "at-risk"} and _to_decimal(customer_context.get("outstanding_ar") or 0) > 0:
        risk_flags.append(
            f"Customer collections health is {customer_context['payment_score']} with {_quantize(_to_decimal(customer_context['outstanding_ar']))} outstanding."
        )

    average_confidence = round(float(total_confidence / max(confident_lines, 1)), 3)
    overall_margin_percent = _gross_margin_percent(total_revenue, total_cost)
    approval_required = bool(approval_reasons)
    valid_until_days = (valid_until - date.today()).days if valid_until else None
    if valid_until_days is not None and valid_until_days > 45:
        risk_flags.append("Quote validity extends beyond 45 days; market costs may move.")

    score = Decimal("72")
    if approval_required:
        score -= Decimal("18")
    if any(flag.endswith("out of stock.") for flag in risk_flags):
        score -= Decimal("12")
    if customer_context.get("payment_score") == "at-risk":
        score -= Decimal("10")
    elif customer_context.get("payment_score") == "slow":
        score -= Decimal("6")
    if overall_margin_percent is not None:
        if overall_margin_percent >= Decimal("35"):
            score += Decimal("8")
        elif overall_margin_percent < margin_floor_percent:
            score -= Decimal("12")
    score += Decimal(str(average_confidence * 10))
    deal_score = int(max(0, min(100, round(float(score)))))

    next_best_actions: list[str] = []
    if approval_required:
        next_best_actions.append("Route this quote for approval before converting it to an order.")
    if recommended_revenue_uplift > 0:
        next_best_actions.append(f"Apply recommended pricing to protect {_quantize(recommended_revenue_uplift)} of revenue.")
    if risk_flags:
        next_best_actions.append("Resolve the flagged commercial risks before issuing the quote.")
    if not next_best_actions:
        next_best_actions.append("Deal is commercially healthy. Send the quote and follow up within 48 hours.")

    return {
        "opportunity_id": opportunity.id,
        "opportunity_name": opportunity.name,
        "account_id": account.id if account else None,
        "account_name": account.name if account else None,
        "customer": customer_context,
        "summary": {
            "subtotal": _quantize(subtotal),
            "discount_total": _quantize(total_discount),
            "total": _quantize(total_revenue),
            "recommended_total": _quantize(total_revenue + recommended_revenue_uplift),
            "recommended_revenue_uplift": _quantize(recommended_revenue_uplift),
            "gross_margin_percent": overall_margin_percent,
            "approval_required": approval_required,
            "approval_reasons": list(dict.fromkeys(approval_reasons)),
            "risk_flags": list(dict.fromkeys(risk_flags)),
            "deal_score": deal_score,
            "average_confidence_score": average_confidence,
            "discount_policy_limit_percent": discount_limit_percent,
            "margin_floor_percent": margin_floor_percent,
            "next_best_actions": next_best_actions,
        },
        "lines": line_evaluations,
        "upsell_suggestions": _build_upsell_suggestions(db, customer_id=customer_id, quoted_item_ids=_quoted_item_ids(lines)),
    }


def evaluate_quote_record(db: Session, quote: Quote) -> dict[str, Any]:
    return evaluate_deal(
        db,
        opportunity_id=quote.opportunity_id,
        lines_payload=[
            {
                "item_id": line.item_id,
                "description": line.description,
                "qty": line.qty,
                "unit_price": line.unit_price,
                "discount_pct": line.discount_pct,
            }
            for line in quote.lines
        ],
        valid_until=quote.valid_until,
    )


def approve_quote(db: Session, quote: Quote, *, approver_user_id: int | None) -> Quote:
    quote.approval_status = "APPROVED"
    quote.approved_by = approver_user_id
    quote.approved_at = datetime.utcnow()
    db.flush()
    return quote


def revenue_control_summary(db: Session) -> dict[str, Any]:
    quotes = (
        db.query(Quote)
        .options(joinedload(Quote.lines), joinedload(Quote.opportunity).joinedload(Opportunity.account))
        .filter(Quote.created_at >= date.today() - timedelta(days=90))
        .order_by(Quote.updated_at.desc())
        .limit(20)
        .all()
    )

    pending_approvals = 0
    low_margin_quotes = 0
    revenue_uplift = ZERO
    largest_opportunities: list[dict[str, Any]] = []
    for quote in quotes:
        evaluation = evaluate_quote_record(db, quote)
        summary = evaluation["summary"]
        uplift = _to_decimal(summary["recommended_revenue_uplift"] or 0)
        revenue_uplift += uplift
        if summary["approval_required"]:
            pending_approvals += 1
        gross_margin_percent = summary.get("gross_margin_percent")
        if gross_margin_percent is not None and _to_decimal(gross_margin_percent) < _to_decimal(summary["margin_floor_percent"]):
            low_margin_quotes += 1
        if uplift > 0:
            largest_opportunities.append(
                {
                    "quote_id": quote.id,
                    "quote_number": quote.quote_number,
                    "account_name": evaluation.get("account_name"),
                    "uplift": _quantize(uplift),
                }
            )

    largest_opportunities.sort(key=lambda item: _to_decimal(item["uplift"] or 0), reverse=True)
    return {
        "quotes_reviewed": len(quotes),
        "pending_approvals": pending_approvals,
        "low_margin_quotes": low_margin_quotes,
        "revenue_uplift": _quantize(revenue_uplift),
        "largest_opportunities": largest_opportunities[:5],
    }


