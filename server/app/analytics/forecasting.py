"""Forecast module.

Provides simple moving average, exponential smoothing, linear trend
projection, seasonal decomposition, and cash flow forecasting.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Invoice, Payment, PurchaseOrder, PurchaseOrderLine

from .engine import (
    OPEN_STATUSES,
    _add_months,
    generate_period_range,
    get_revenue_for_period,
    get_payments_for_period,
    linear_trend,
    month_expression,
    period_label,
)


# ---------------------------------------------------------------------------
# Simple Moving Average Forecast
# ---------------------------------------------------------------------------


def simple_moving_average(
    values: Sequence[float], window: int = 3, periods_ahead: int = 3
) -> List[float]:
    if len(values) < window:
        avg = sum(values) / len(values) if values else 0.0
        return [avg] * periods_ahead

    forecast: List[float] = []
    working = list(values)
    for _ in range(periods_ahead):
        avg = sum(working[-window:]) / window
        forecast.append(round(avg, 2))
        working.append(avg)
    return forecast


# ---------------------------------------------------------------------------
# Exponential Smoothing
# ---------------------------------------------------------------------------


def exponential_smoothing(
    values: Sequence[float], alpha: float = 0.3, periods_ahead: int = 3
) -> List[float]:
    if not values:
        return [0.0] * periods_ahead

    smoothed = values[0]
    for v in values[1:]:
        smoothed = alpha * v + (1 - alpha) * smoothed

    return [round(smoothed, 2)] * periods_ahead


# ---------------------------------------------------------------------------
# Linear Trend Projection
# ---------------------------------------------------------------------------


def linear_projection(
    values: Sequence[float], periods_ahead: int = 3
) -> List[Dict[str, Any]]:
    n = len(values)
    if n < 2:
        last = values[-1] if values else 0.0
        return [{"period": i + 1, "value": last, "confidence": "low"} for i in range(periods_ahead)]

    trend = linear_trend(values)
    slope = trend["slope"]
    y_mean = sum(values) / n
    x_mean = (n - 1) / 2

    intercept = y_mean - slope * x_mean

    projections = []
    for i in range(periods_ahead):
        x = n + i
        projected = intercept + slope * x
        # Confidence band (simple: based on R²)
        confidence = "high" if trend["r_squared"] > 0.7 else ("medium" if trend["r_squared"] > 0.3 else "low")
        projections.append({
            "period": i + 1,
            "value": round(projected, 2),
            "confidence": confidence,
        })
    return projections


# ---------------------------------------------------------------------------
# Seasonal Decomposition
# ---------------------------------------------------------------------------


def seasonal_indices(values: Sequence[float], season_length: int = 12) -> List[float]:
    if len(values) < season_length:
        return [1.0] * season_length

    overall_avg = sum(values) / len(values) if values else 1.0
    if overall_avg == 0:
        return [1.0] * season_length

    indices = []
    for i in range(season_length):
        season_vals = [values[j] for j in range(i, len(values), season_length)]
        season_avg = sum(season_vals) / len(season_vals) if season_vals else overall_avg
        indices.append(round(season_avg / overall_avg, 4))
    return indices


# ---------------------------------------------------------------------------
# Cash Flow Forecast
# ---------------------------------------------------------------------------


def cash_flow_forecast(
    db: Session,
    as_of: date,
    periods: int = 3,  # months ahead
) -> Dict[str, Any]:
    # Historical monthly cash inflows (payments received)
    historical_inflows: List[float] = []
    historical_outflows: List[float] = []

    for i in range(11, -1, -1):
        m_start = _add_months(as_of, -i)
        m_end = _add_months(m_start, 1) - timedelta(days=1)
        inflow = float(get_payments_for_period(db, m_start, m_end))
        historical_inflows.append(inflow)

        # Outflows: PO costs
        outflow = float(
            db.query(func.coalesce(func.sum(PurchaseOrderLine.landed_cost * PurchaseOrderLine.qty_ordered), 0))
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.purchase_order_id)
            .filter(PurchaseOrder.order_date >= m_start, PurchaseOrder.order_date <= m_end)
            .scalar() or 0
        )
        historical_outflows.append(outflow)

    # Forecast inflows and outflows
    inflow_forecast = simple_moving_average(historical_inflows, window=3, periods_ahead=periods)
    outflow_forecast = simple_moving_average(historical_outflows, window=3, periods_ahead=periods)

    # Expected AR collections (from open invoices due within forecast period)
    forecast_end = _add_months(as_of, periods)
    expected_collections = float(
        db.query(func.coalesce(func.sum(Invoice.amount_due), 0))
        .filter(Invoice.status.in_(OPEN_STATUSES))
        .filter(Invoice.amount_due > 0)
        .filter(Invoice.due_date >= as_of, Invoice.due_date <= forecast_end)
        .scalar() or 0
    )

    # Build forecast periods
    forecast_periods = []
    cumulative = 0.0
    for i in range(periods):
        p_start = _add_months(as_of, i)
        inflow = inflow_forecast[i]
        outflow = outflow_forecast[i]
        net = inflow - outflow
        cumulative += net
        forecast_periods.append({
            "period": p_start.strftime("%Y-%m"),
            "projected_inflows": round(inflow, 2),
            "projected_outflows": round(outflow, 2),
            "net_cash_flow": round(net, 2),
            "cumulative": round(cumulative, 2),
        })

    # Cash burn rate (avg monthly outflow - avg monthly inflow for last 3 months)
    recent_inflows = historical_inflows[-3:]
    recent_outflows = historical_outflows[-3:]
    avg_inflow = sum(recent_inflows) / 3 if recent_inflows else 0
    avg_outflow = sum(recent_outflows) / 3 if recent_outflows else 0
    burn_rate = avg_outflow - avg_inflow

    return {
        "historical_inflows": [round(v, 2) for v in historical_inflows],
        "historical_outflows": [round(v, 2) for v in historical_outflows],
        "forecast_periods": forecast_periods,
        "expected_collections": round(expected_collections, 2),
        "burn_rate_monthly": round(burn_rate, 2),
        "trend": linear_trend(historical_inflows),
    }


# ---------------------------------------------------------------------------
# Generic metric forecast
# ---------------------------------------------------------------------------


def forecast_metric(
    historical_values: Sequence[float],
    method: str = "sma",
    periods_ahead: int = 3,
) -> Dict[str, Any]:
    if method == "sma":
        forecast = simple_moving_average(historical_values, periods_ahead=periods_ahead)
    elif method == "ema":
        forecast = exponential_smoothing(historical_values, periods_ahead=periods_ahead)
    elif method == "linear":
        projections = linear_projection(historical_values, periods_ahead=periods_ahead)
        forecast = [p["value"] for p in projections]
    else:
        forecast = simple_moving_average(historical_values, periods_ahead=periods_ahead)

    return {
        "method": method,
        "historical": [round(v, 2) for v in historical_values],
        "forecast": forecast,
        "trend": linear_trend(list(historical_values)),
    }
