from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models import Invoice, InvoiceLine, Item, SalesRequestLine, SupplierItem


EPSILON = 0.0001
DEFAULT_LOOKBACK_MONTHS = 24
DEFAULT_HALF_LIFE_DAYS = 180
DEFAULT_MIN_OBSERVATIONS = 5
DEFAULT_MIN_MARKUP = Decimal("1.05")
DEFAULT_Q95_GUARDRAIL_PERCENT = Decimal("0.10")


@dataclass
class Observation:
    unit_price: Decimal
    quantity: Decimal
    issue_date: date
    item_id: int | None
    source: str


@dataclass
class MWBResult:
    mwb_unit_price: Decimal
    source_level: str
    explanation: dict[str, Any]
    confidence: str


SOURCE_LEVELS = [
    "customer_item",
    "customer_global",
    "global_item",
    "global_global",
]


ROUNDING_BY_CATEGORY = {
    "monument": Decimal("10"),
    "accessory": Decimal("5"),
}


def _to_decimal(value: Decimal | float | int | str | None, fallback: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return fallback
    return Decimal(str(value))


def _exp_weight(age_days: int, half_life_days: int) -> float:
    if half_life_days <= 0:
        return 1.0
    return math.exp(-max(0, age_days) / half_life_days)


def _qty_weight(quantity: Decimal, target_qty: Decimal) -> float:
    denom = max(Decimal("1"), target_qty)
    distance = abs(quantity - target_qty) / denom
    return float(Decimal("1") / (Decimal("1") + distance))


def weighted_quantile(values: list[Decimal], weights: list[float], quantile: float) -> Decimal:
    if not values:
        return Decimal("0")
    if len(values) != len(weights):
        raise ValueError("values and weights lengths must match")
    if quantile <= 0:
        return min(values)
    if quantile >= 1:
        return max(values)

    pairs = sorted(zip(values, weights), key=lambda pair: pair[0])
    total_weight = sum(max(0.0, w) for _, w in pairs)
    if total_weight <= EPSILON:
        return pairs[len(pairs) // 2][0]

    threshold = total_weight * quantile
    cumulative = 0.0
    for value, weight in pairs:
        cumulative += max(0.0, weight)
        if cumulative >= threshold:
            return value
    return pairs[-1][0]


def _sigmoid(x: float) -> float:
    if x > 35:
        return 1.0
    if x < -35:
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _round_to_increment(value: Decimal, increment: Decimal) -> Decimal:
    if increment <= 0:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rounded = (value / increment).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * increment
    return rounded.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _infer_rounding_increment(item: Item | None) -> Decimal:
    if not item:
        return Decimal("10")
    haystack = f"{(item.name or '').lower()} {(item.description or '').lower()} {(item.sku or '').lower()}"
    for token, increment in ROUNDING_BY_CATEGORY.items():
        if token in haystack:
            return increment
    return Decimal("10")


def _load_observations(db: Session, *, customer_id: int | None, item_id: int | None, cutoff_date: date) -> list[Observation]:
    query = (
        db.query(InvoiceLine, Invoice)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(
            Invoice.issue_date >= cutoff_date,
            InvoiceLine.quantity > 0,
            Invoice.status.in_(["PARTIALLY_PAID", "PAID", "SHIPPED", "SENT", "DRAFT"]),
        )
    )
    if customer_id is not None:
        query = query.filter(Invoice.customer_id == customer_id)
    if item_id is not None:
        query = query.filter(InvoiceLine.item_id == item_id)

    observations: list[Observation] = []
    for invoice_line, invoice in query.all():
        qty = _to_decimal(invoice_line.quantity, Decimal("0"))
        if qty <= 0:
            continue
        line_total = _to_decimal(invoice_line.line_total)
        unit_price = line_total / qty if line_total > 0 else _to_decimal(invoice_line.unit_price)
        if unit_price <= 0:
            continue
        observations.append(
            Observation(
                unit_price=unit_price,
                quantity=qty,
                issue_date=invoice.issue_date,
                item_id=invoice_line.item_id,
                source="invoice_line",
            )
        )
    return observations


def _build_fallback_observations(db: Session, customer_id: int, item_id: int, cutoff_date: date, min_observations: int) -> tuple[str, list[Observation], list[str]]:
    warnings: list[str] = []
    fallback_order = [
        ("customer_item", customer_id, item_id),
        ("customer_global", customer_id, None),
        ("global_item", None, item_id),
        ("global_global", None, None),
    ]
    for source_level, customer_filter, item_filter in fallback_order:
        observations = _load_observations(db, customer_id=customer_filter, item_id=item_filter, cutoff_date=cutoff_date)
        if len(observations) >= min_observations:
            if source_level != "customer_item":
                warnings.append(f"Sparse customer-item history. Used {source_level} fallback.")
            return source_level, observations, warnings

    source_level, customer_filter, item_filter = fallback_order[-1]
    observations = _load_observations(db, customer_id=customer_filter, item_id=item_filter, cutoff_date=cutoff_date)
    warnings.append("Very sparse data. Used global median fallback.")
    return source_level, observations, warnings


def _estimate_confidence(source_level: str, observation_count: int) -> str:
    if source_level == "customer_item" and observation_count >= 10:
        return "High"
    if observation_count >= 5:
        return "Medium"
    return "Low"


def _compute_floor_price(db: Session, item_id: int, min_markup: Decimal) -> Decimal | None:
    supplier_cost = (
        db.query(SupplierItem.supplier_cost + SupplierItem.freight_cost + SupplierItem.tariff_cost)
        .filter(SupplierItem.item_id == item_id)
        .order_by(SupplierItem.is_preferred.desc(), SupplierItem.id.asc())
        .scalar()
    )
    if supplier_cost is None:
        return None
    return (_to_decimal(supplier_cost) * min_markup).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _compute_quantity_discount(target_qty: Decimal, historical_quantities: Iterable[Decimal], alpha: Decimal = Decimal("0.1")) -> Decimal:
    quantities = [q for q in historical_quantities if q > 0]
    if not quantities or target_qty <= 0:
        return Decimal("1")
    sorted_quantities = sorted(quantities)
    median_qty = sorted_quantities[len(sorted_quantities) // 2]
    if target_qty <= median_qty:
        return Decimal("1")
    ratio = (median_qty / target_qty) if target_qty > 0 else Decimal("1")
    factor = Decimal(str(float(ratio) ** float(alpha)))
    return max(Decimal("0.85"), min(Decimal("1.0"), factor))


def compute_mwb_price(
    db: Session,
    *,
    customer_id: int,
    item_id: int,
    qty: Decimal,
    as_of_date: date | None = None,
    current_quoted_price: Decimal | None = None,
) -> MWBResult:
    as_of = as_of_date or datetime.utcnow().date()
    cutoff_date = as_of - timedelta(days=DEFAULT_LOOKBACK_MONTHS * 30)

    source_level, observations, warnings = _build_fallback_observations(
        db,
        customer_id=customer_id,
        item_id=item_id,
        cutoff_date=cutoff_date,
        min_observations=DEFAULT_MIN_OBSERVATIONS,
    )

    if not observations:
        fallback_price = _to_decimal(
            db.query(InvoiceLine.unit_price).filter(InvoiceLine.unit_price > 0).order_by(InvoiceLine.id.desc()).limit(1).scalar(),
            Decimal("0"),
        )
        explanation = {
            "source_level": source_level,
            "observation_count": 0,
            "time_window_months": DEFAULT_LOOKBACK_MONTHS,
            "warnings": warnings + ["No invoice history found. Returned item list price fallback."],
            "selected_mwb": str(fallback_price.quantize(Decimal("0.01"))),
            "candidates": [],
        }
        return MWBResult(mwb_unit_price=fallback_price, source_level=source_level, explanation=explanation, confidence="Low")

    effective_weights: list[float] = []
    unit_prices: list[Decimal] = []
    for obs in observations:
        age_days = (as_of - obs.issue_date).days
        eff_weight = _exp_weight(age_days, DEFAULT_HALF_LIFE_DAYS) * _qty_weight(obs.quantity, qty)
        effective_weights.append(eff_weight)
        unit_prices.append(obs.unit_price)

    quantile_points = {
        "q10": 0.10,
        "q25": 0.25,
        "q50": 0.50,
        "q60": 0.60,
        "q70": 0.70,
        "q75": 0.75,
        "q80": 0.80,
        "q85": 0.85,
        "q90": 0.90,
        "q92": 0.92,
        "q95": 0.95,
    }
    quantiles = {key: weighted_quantile(unit_prices, effective_weights, q) for key, q in quantile_points.items()}
    scale = max(Decimal(str(EPSILON)), (quantiles["q90"] - quantiles["q50"]) / Decimal("2"))
    pivot = quantiles["q75"]

    latest_same_item_row = (
        db.query(InvoiceLine.unit_price)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .filter(Invoice.customer_id == customer_id, InvoiceLine.item_id == item_id)
        .order_by(Invoice.issue_date.desc(), InvoiceLine.id.desc())
        .first()
    )
    latest_same_item = latest_same_item_row[0] if latest_same_item_row else None
    item = db.query(Item).filter(Item.id == item_id).first()
    list_price = _to_decimal(item.unit_price if item else None, Decimal("0"))

    candidates: set[Decimal] = {
        quantiles["q50"],
        quantiles["q60"],
        quantiles["q70"],
        quantiles["q75"],
        quantiles["q80"],
        quantiles["q85"],
        quantiles["q90"],
        quantiles["q92"],
        quantiles["q95"],
    }
    if latest_same_item:
        candidates.add(_to_decimal(latest_same_item))
    if list_price > 0:
        candidates.add(list_price)
    if current_quoted_price and current_quoted_price > 0:
        candidates.add(current_quoted_price)

    quantity_discount = _compute_quantity_discount(qty, (obs.quantity for obs in observations))

    candidate_rows: list[dict[str, Any]] = []
    for p in sorted(candidates):
        model_x = float((p - pivot) / scale) if scale > 0 else 0.0
        acceptance = _clamp01(1 - _sigmoid(model_x))
        acceptance *= float(quantity_discount)
        expected_rev = p * Decimal(str(acceptance))
        candidate_rows.append(
            {
                "unit_price": p.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                "acceptance_probability": round(acceptance, 4),
                "expected_revenue": expected_rev.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            }
        )

    best_row = max(candidate_rows, key=lambda row: row["expected_revenue"])
    selected = best_row["unit_price"]

    floor_price = _compute_floor_price(db, item_id, DEFAULT_MIN_MARKUP)
    if floor_price is not None and selected < floor_price:
        warnings.append("Floor price guardrail applied.")
        selected = floor_price

    q95_cap = (quantiles["q95"] * (Decimal("1") + DEFAULT_Q95_GUARDRAIL_PERCENT)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    customer_max = max((obs.unit_price for obs in observations), default=Decimal("0"))
    if selected > q95_cap and customer_max <= q95_cap:
        warnings.append("Q95 cap guardrail applied.")
        selected = q95_cap

    if list_price > 0:
        list_cap = (list_price * Decimal("1.2")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if selected > list_cap and customer_max <= list_cap:
            warnings.append("List price cap guardrail applied.")
            selected = list_cap

    increment = _infer_rounding_increment(item)
    rounded_selected = _round_to_increment(selected, increment)
    if rounded_selected != selected:
        warnings.append(f"Rounded to nearest ${increment} increment.")

    explanation: dict[str, Any] = {
        "source_level": source_level,
        "observation_count": len(observations),
        "time_window_months": DEFAULT_LOOKBACK_MONTHS,
        "quantiles": {key: str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) for key, value in quantiles.items() if key in {"q50", "q75", "q90", "q95"}},
        "acceptance_model": {
            "pivot": str(pivot.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "scale": str(scale.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "formula": "P_accept = clamp01(1 - sigmoid((p - Q75)/scale))",
            "quantity_discount_factor": str(quantity_discount.quantize(Decimal("0.0001"))),
        },
        "guardrails": {
            "floor_price": str(floor_price) if floor_price is not None else None,
            "q95_cap": str(q95_cap),
            "min_markup": str(DEFAULT_MIN_MARKUP),
            "list_price": str(list_price) if list_price > 0 else None,
            "rounding_increment": str(increment),
        },
        "candidates": [
            {
                "unit_price": str(row["unit_price"]),
                "acceptance_probability": row["acceptance_probability"],
                "expected_revenue": str(row["expected_revenue"]),
            }
            for row in sorted(candidate_rows, key=lambda row: row["expected_revenue"], reverse=True)
        ],
        "selected_mwb": str(rounded_selected),
        "warnings": warnings,
    }

    return MWBResult(
        mwb_unit_price=rounded_selected,
        source_level=source_level,
        explanation=explanation,
        confidence=_estimate_confidence(source_level, len(observations)),
    )


def serialize_explanation(explanation: dict[str, Any]) -> str:
    return json.dumps(explanation, sort_keys=True)
