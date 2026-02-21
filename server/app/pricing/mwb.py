from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models import Customer, Invoice, InvoiceLine, Item, SalesRequestLine, SupplierItem
from app.utils import quantize_money


EPSILON = 0.0001
DEFAULT_LOOKBACK_MONTHS = 24
DEFAULT_HALF_LIFE_DAYS = 180
DEFAULT_MIN_OBSERVATIONS = 5
DEFAULT_MIN_MARKUP = Decimal("1.05")
DEFAULT_Q95_GUARDRAIL_PERCENT = Decimal("0.10")
MIN_CUSTOMER_FOR_FULL_WEIGHT = 15  # below this, blend in market data

# ---------------------------------------------------------------------------
# Customer tier elasticity — higher tiers tolerate higher prices
# ---------------------------------------------------------------------------
TIER_ELASTICITY: dict[str, dict[str, Decimal]] = {
    "STANDARD":  {"pivot_shift": Decimal("0.00"), "scale_factor": Decimal("1.00")},
    "BRONZE":    {"pivot_shift": Decimal("0.02"), "scale_factor": Decimal("1.05")},
    "SILVER":    {"pivot_shift": Decimal("0.04"), "scale_factor": Decimal("1.10")},
    "GOLD":      {"pivot_shift": Decimal("0.07"), "scale_factor": Decimal("1.20")},
    "PLATINUM":  {"pivot_shift": Decimal("0.10"), "scale_factor": Decimal("1.35")},
}

# Tier-based volume discount beta (log-elasticity curve)
TIER_VOLUME_BETA: dict[str, Decimal] = {
    "STANDARD":  Decimal("0.06"),
    "BRONZE":    Decimal("0.055"),
    "SILVER":    Decimal("0.05"),
    "GOLD":      Decimal("0.04"),
    "PLATINUM":  Decimal("0.03"),
}
VOLUME_DISCOUNT_FLOOR = Decimal("0.75")  # max 25% volume discount


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
    confidence_score: float = 0.0


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
        return quantize_money(value) or Decimal("0.00")
    rounded = (value / increment).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * increment
    return quantize_money(rounded) or Decimal("0.00")


def _infer_rounding_increment(item: Item | None) -> Decimal:
    """Infer rounding increment from category keywords, then price magnitude."""
    if not item:
        return Decimal("10")
    haystack = f"{(item.name or '').lower()} {(item.description or '').lower()} {(item.sku or '').lower()}"
    for token, increment in ROUNDING_BY_CATEGORY.items():
        if token in haystack:
            return increment
    # Magnitude-based fallback
    list_price = _to_decimal(item.unit_price, Decimal("0"))
    if list_price >= Decimal("500"):
        return Decimal("25")
    if list_price >= Decimal("100"):
        return Decimal("10")
    if list_price >= Decimal("20"):
        return Decimal("5")
    return Decimal("1")


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


# ---------------------------------------------------------------------------
# NEW: Multi-factor confidence scoring
# ---------------------------------------------------------------------------
def _estimate_confidence(
    source_level: str,
    observations: list[Observation],
    as_of: date,
) -> tuple[str, float]:
    """Return (label, numeric_score) where score is 0.0–1.0."""
    if not observations:
        return "Low", 0.0

    n = len(observations)

    # Factor 1: Observation count (0–0.4), saturates at 20
    count_score = min(1.0, n / 20.0) * 0.4

    # Factor 2: Data freshness (0–0.3) — fraction from last 90 days
    recent_cutoff = as_of - timedelta(days=90)
    recent_count = sum(1 for obs in observations if obs.issue_date >= recent_cutoff)
    freshness_score = (recent_count / n) * 0.3

    # Factor 3: Price consistency (0–0.3) — low CV = high confidence
    prices = [float(obs.unit_price) for obs in observations]
    mean_price = sum(prices) / len(prices)
    if mean_price > 0:
        variance = sum((p - mean_price) ** 2 for p in prices) / len(prices)
        cv = (variance ** 0.5) / mean_price
        consistency_score = max(0.0, 1.0 - cv * 2) * 0.3
    else:
        consistency_score = 0.0

    # Source level penalty
    source_penalty = {
        "customer_item": 0.0,
        "customer_global": 0.15,
        "global_item": 0.20,
        "global_global": 0.35,
    }.get(source_level, 0.30)

    raw_score = count_score + freshness_score + consistency_score
    final_score = max(0.0, min(1.0, raw_score - source_penalty))

    if final_score >= 0.65:
        label = "High"
    elif final_score >= 0.35:
        label = "Medium"
    else:
        label = "Low"

    return label, round(final_score, 3)


def _compute_floor_price(db: Session, item_id: int, min_markup: Decimal) -> Decimal | None:
    supplier_cost = (
        db.query(SupplierItem.supplier_cost + SupplierItem.freight_cost + SupplierItem.tariff_cost)
        .filter(SupplierItem.item_id == item_id)
        .order_by(SupplierItem.is_preferred.desc(), SupplierItem.id.asc())
        .scalar()
    )
    if supplier_cost is None:
        return None
    return quantize_money(_to_decimal(supplier_cost) * min_markup) or Decimal("0.00")


# ---------------------------------------------------------------------------
# NEW: Log-elasticity quantity discount, tier-aware
# ---------------------------------------------------------------------------
def _compute_quantity_discount(
    target_qty: Decimal,
    historical_quantities: Iterable[Decimal],
    tier: str = "STANDARD",
) -> Decimal:
    """Volume discount using log-elasticity: 1 - beta * ln(target/median).
    Beta varies by tier — premium tiers get smaller discounts.
    """
    quantities = [q for q in historical_quantities if q > 0]
    if not quantities or target_qty <= 0:
        return Decimal("1")
    sorted_quantities = sorted(quantities)
    median_qty = sorted_quantities[len(sorted_quantities) // 2]
    if target_qty <= median_qty:
        return Decimal("1")

    beta = TIER_VOLUME_BETA.get(tier.upper(), TIER_VOLUME_BETA["STANDARD"])
    ratio = float(target_qty / median_qty)
    if ratio <= 1.0:
        return Decimal("1")
    discount = Decimal("1") - beta * Decimal(str(math.log(ratio)))
    return max(VOLUME_DISCOUNT_FLOOR, min(Decimal("1.0"), discount))


# ---------------------------------------------------------------------------
# NEW: Price trend detection via weighted linear regression
# ---------------------------------------------------------------------------
def _price_trend_adjustment(
    observations: list[Observation],
    weights: list[float],
    as_of: date,
    projection_days: int = 30,
    max_adjustment_fraction: Decimal = Decimal("0.10"),
) -> Decimal:
    """Compute upward pivot adjustment from weighted linear price trend.

    Returns a non-negative Decimal. Capped at max_adjustment_fraction of the
    weighted-mean price to prevent runaway escalation.
    """
    if len(observations) < 3:
        return Decimal("0")

    max_age = max((as_of - obs.issue_date).days for obs in observations)
    # recency: more recent → higher x value
    xs = [float(max_age - (as_of - obs.issue_date).days) for obs in observations]
    ys = [float(obs.unit_price) for obs in observations]

    w_sum = sum(weights)
    if w_sum < EPSILON:
        return Decimal("0")

    w_x = sum(w * x for w, x in zip(weights, xs)) / w_sum
    w_y = sum(w * y for w, y in zip(weights, ys)) / w_sum

    numerator = sum(w * (x - w_x) * (y - w_y) for w, x, y in zip(weights, xs, ys))
    denominator = sum(w * (x - w_x) ** 2 for w, x in zip(weights, xs))

    if abs(denominator) < EPSILON:
        return Decimal("0")

    slope = numerator / denominator  # price increase per day of recency

    if slope <= 0:
        return Decimal("0")  # Only adjust upward

    adjustment = Decimal(str(slope * projection_days))
    median_price = Decimal(str(w_y))
    cap = abs(median_price) * max_adjustment_fraction if median_price > 0 else Decimal("0")

    return min(adjustment, cap)


# ---------------------------------------------------------------------------
# NEW: Market rate blending for sparse customer data
# ---------------------------------------------------------------------------
def _blend_market_observations(
    customer_obs: list[Observation],
    market_obs: list[Observation],
    min_customer_for_full_weight: int = MIN_CUSTOMER_FOR_FULL_WEIGHT,
) -> tuple[list[Observation], list[float]]:
    """Blend customer-specific with market (global-item) observations.

    Returns (combined_observations, blend_weight_multipliers).
    When customer has >= threshold, market weight is 0.
    """
    customer_weight = min(1.0, len(customer_obs) / min_customer_for_full_weight)
    market_weight = 1.0 - customer_weight

    blend_factors = [customer_weight] * len(customer_obs) + [market_weight * 0.5] * len(market_obs)
    combined = list(customer_obs) + list(market_obs)
    return combined, blend_factors


# ---------------------------------------------------------------------------
# Main computation
# ---------------------------------------------------------------------------
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

    # Load customer tier
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    tier = (customer.tier if customer and customer.tier else "STANDARD").upper()
    tier_config = TIER_ELASTICITY.get(tier, TIER_ELASTICITY["STANDARD"])

    if not observations:
        fallback_price = _to_decimal(
            db.query(InvoiceLine.unit_price).filter(InvoiceLine.unit_price > 0).order_by(InvoiceLine.id.desc()).limit(1).scalar(),
            Decimal("0"),
        )
        explanation = {
            "source_level": source_level,
            "observation_count": 0,
            "time_window_months": DEFAULT_LOOKBACK_MONTHS,
            "customer_tier": tier,
            "warnings": warnings + ["No invoice history found. Returned item list price fallback."],
            "selected_mwb": str(quantize_money(fallback_price) or Decimal("0.00")),
            "candidates": [],
        }
        return MWBResult(mwb_unit_price=fallback_price, source_level=source_level, explanation=explanation, confidence="Low", confidence_score=0.0)

    # Blend in market data for sparse customer-item history
    blend_factors: list[float] | None = None
    original_customer_count = len(observations)
    if source_level == "customer_item" and len(observations) < MIN_CUSTOMER_FOR_FULL_WEIGHT:
        market_obs = _load_observations(db, customer_id=None, item_id=item_id, cutoff_date=cutoff_date)
        # Exclude duplicate observations (same invoice lines) already in customer set
        customer_dates_prices = {(o.issue_date, o.unit_price) for o in observations}
        unique_market = [o for o in market_obs if (o.issue_date, o.unit_price) not in customer_dates_prices]
        if unique_market:
            observations, blend_factors = _blend_market_observations(observations, unique_market)
            warnings.append(f"Blended {len(unique_market)} market observations (customer weight: {original_customer_count}/{MIN_CUSTOMER_FOR_FULL_WEIGHT}).")

    effective_weights: list[float] = []
    unit_prices: list[Decimal] = []
    for i, obs in enumerate(observations):
        age_days = (as_of - obs.issue_date).days
        eff_weight = _exp_weight(age_days, DEFAULT_HALF_LIFE_DAYS) * _qty_weight(obs.quantity, qty)
        if blend_factors is not None:
            eff_weight *= blend_factors[i]
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

    # --- Tier elasticity: shift pivot up for premium tiers, widen scale ---
    pivot = pivot * (Decimal("1") + tier_config["pivot_shift"])
    scale = scale * tier_config["scale_factor"]

    # --- Price trend: if prices trending up, nudge pivot higher ---
    trend_adj = _price_trend_adjustment(observations, effective_weights, as_of)
    pivot = pivot + trend_adj

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

    # Tier-aware quantity discount
    quantity_discount = _compute_quantity_discount(qty, (obs.quantity for obs in observations), tier=tier)

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

    # Confidence scoring
    confidence_label, confidence_score = _estimate_confidence(source_level, observations, as_of)

    explanation: dict[str, Any] = {
        "source_level": source_level,
        "observation_count": original_customer_count,
        "market_observations_blended": len(observations) - original_customer_count if blend_factors else 0,
        "time_window_months": DEFAULT_LOOKBACK_MONTHS,
        "customer_tier": tier,
        "quantiles": {key: str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) for key, value in quantiles.items() if key in {"q50", "q75", "q90", "q95"}},
        "acceptance_model": {
            "pivot": str(pivot.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "scale": str(scale.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "formula": "P_accept = clamp01(1 - sigmoid((p - pivot)/scale))",
            "tier_pivot_shift": str(tier_config["pivot_shift"]),
            "tier_scale_factor": str(tier_config["scale_factor"]),
            "trend_adjustment": str(trend_adj.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
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
        "confidence_score": confidence_score,
        "warnings": warnings,
    }

    return MWBResult(
        mwb_unit_price=rounded_selected,
        source_level=source_level,
        explanation=explanation,
        confidence=confidence_label,
        confidence_score=confidence_score,
    )


def serialize_explanation(explanation: dict[str, Any]) -> str:
    return json.dumps(explanation, sort_keys=True)
