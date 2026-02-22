"""Anomaly detection module.

Z-score based outlier detection on transactions, amounts, and timing.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Customer, Invoice, InvoiceLine, Item, Payment

from .engine import detect_anomalies


def detect_transaction_anomalies(
    db: Session,
    as_of: date,
    lookback_days: int = 90,
    threshold: float = 2.5,
) -> List[Dict[str, Any]]:
    start_date = as_of - timedelta(days=lookback_days)

    # Analyze invoice amounts
    invoices = (
        db.query(
            Invoice.id,
            Invoice.invoice_number,
            Invoice.total,
            Invoice.issue_date,
            Customer.name.label("customer_name"),
        )
        .join(Customer, Customer.id == Invoice.customer_id)
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= as_of)
        .order_by(Invoice.issue_date)
        .all()
    )

    if len(invoices) < 5:
        return []

    amounts = [float(inv.total) for inv in invoices]
    labels = [inv.invoice_number for inv in invoices]
    raw_anomalies = detect_anomalies(amounts, labels, threshold)

    results = []
    for anomaly in raw_anomalies:
        inv = invoices[anomaly["index"]]
        results.append({
            "id": f"inv-{inv.id}",
            "type": "invoice_amount",
            "entity_type": "invoice",
            "entity_id": inv.id,
            "reference": inv.invoice_number,
            "description": f"Invoice {inv.invoice_number} to {inv.customer_name}",
            "value": anomaly["value"],
            "z_score": anomaly["z_score"],
            "severity": anomaly["severity"],
            "reason": f"Amount ${anomaly['value']:,.2f} is {anomaly['direction']} average (${anomaly['mean']:,.2f} ± ${anomaly['std_dev']:,.2f})",
            "date": inv.issue_date.isoformat(),
            "customer_name": inv.customer_name,
        })

    # Analyze payment amounts
    payments = (
        db.query(
            Payment.id,
            Payment.amount,
            Payment.payment_date,
            Payment.reference,
            Customer.name.label("customer_name"),
        )
        .join(Customer, Customer.id == Payment.customer_id)
        .filter(Payment.payment_date >= start_date, Payment.payment_date <= as_of)
        .order_by(Payment.payment_date)
        .all()
    )

    if len(payments) >= 5:
        pay_amounts = [float(p.amount) for p in payments]
        pay_labels = [p.reference or f"PMT-{p.id}" for p in payments]
        pay_anomalies = detect_anomalies(pay_amounts, pay_labels, threshold)

        for anomaly in pay_anomalies:
            pmt = payments[anomaly["index"]]
            results.append({
                "id": f"pmt-{pmt.id}",
                "type": "payment_amount",
                "entity_type": "payment",
                "entity_id": pmt.id,
                "reference": pmt.reference or f"PMT-{pmt.id}",
                "description": f"Payment from {pmt.customer_name}",
                "value": anomaly["value"],
                "z_score": anomaly["z_score"],
                "severity": anomaly["severity"],
                "reason": f"Amount ${anomaly['value']:,.2f} is {anomaly['direction']} average (${anomaly['mean']:,.2f} ± ${anomaly['std_dev']:,.2f})",
                "date": pmt.payment_date.isoformat(),
                "customer_name": pmt.customer_name,
            })

    results.sort(key=lambda x: x["z_score"], reverse=True)
    return results[:20]
