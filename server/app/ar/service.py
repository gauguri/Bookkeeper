from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ARCollectionActivity, Customer, Invoice, Payment, PaymentApplication
from app.sales.service import recalculate_invoice_balance


ZERO = Decimal("0.00")


def _bucket_for_days(days_past_due: int) -> str:
    if days_past_due <= 30:
        return "current"
    if days_past_due <= 60:
        return "31_60"
    if days_past_due <= 90:
        return "61_90"
    return "90_plus"


def get_ar_aging_by_customer(db: Session, as_of: date) -> list[dict[str, Any]]:
    invoices = (
        db.query(Invoice)
        .join(Customer, Customer.id == Invoice.customer_id)
        .filter(Invoice.status != "VOID")
        .filter(Invoice.due_date <= as_of)
        .order_by(Customer.name.asc(), Invoice.due_date.asc())
        .all()
    )

    rows_by_customer: dict[int, dict[str, Any]] = {}
    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        amount_due = Decimal(invoice.amount_due or 0)
        if amount_due <= 0:
            continue

        customer = invoice.customer
        if not customer:
            continue

        if customer.id not in rows_by_customer:
            rows_by_customer[customer.id] = {
                "customer_id": customer.id,
                "customer_name": customer.name,
                "current": ZERO,
                "31_60": ZERO,
                "61_90": ZERO,
                "90_plus": ZERO,
                "total": ZERO,
                "avg_days_to_pay": None,
                "last_action_at": None,
                "last_action_type": None,
                "follow_up_date": None,
            }

        days_past_due = (as_of - invoice.due_date).days
        bucket = _bucket_for_days(days_past_due)
        rows_by_customer[customer.id][bucket] += amount_due
        rows_by_customer[customer.id]["total"] += amount_due

    if not rows_by_customer:
        return []

    customer_ids = list(rows_by_customer.keys())

    payment_stats = (
        db.query(
            Invoice.customer_id.label("customer_id"),
            func.coalesce(func.sum(PaymentApplication.applied_amount), 0).label("applied_total"),
            func.coalesce(
                func.sum(
                    (func.julianday(Payment.payment_date) - func.julianday(Invoice.issue_date))
                    * PaymentApplication.applied_amount
                ),
                0,
            ).label("weighted_days"),
        )
        .join(Invoice, Invoice.id == PaymentApplication.invoice_id)
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(Invoice.customer_id.in_(customer_ids), Invoice.status != "VOID")
        .group_by(Invoice.customer_id)
        .all()
    )

    for stat in payment_stats:
        applied_total = Decimal(stat.applied_total or 0)
        if applied_total > 0:
            weighted_days = Decimal(stat.weighted_days or 0)
            rows_by_customer[stat.customer_id]["avg_days_to_pay"] = weighted_days / applied_total

    latest_actions = (
        db.query(ARCollectionActivity)
        .filter(ARCollectionActivity.customer_id.in_(customer_ids))
        .order_by(ARCollectionActivity.created_at.desc(), ARCollectionActivity.id.desc())
        .all()
    )
    seen_customers: set[int] = set()
    for action in latest_actions:
        if action.customer_id in seen_customers:
            continue
        seen_customers.add(action.customer_id)
        row = rows_by_customer.get(action.customer_id)
        if row is None:
            continue
        row["last_action_at"] = action.created_at
        row["last_action_type"] = action.activity_type
        row["follow_up_date"] = action.follow_up_date

    return sorted(rows_by_customer.values(), key=lambda row: (row["customer_name"].lower(), row["customer_id"]))


def create_ar_activity(
    db: Session,
    *,
    customer_id: int,
    activity_type: str,
    note: str | None = None,
    follow_up_date: date | None = None,
    reminder_channel: str | None = None,
) -> ARCollectionActivity:
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise ValueError("Customer not found.")

    activity = ARCollectionActivity(
        customer_id=customer_id,
        activity_type=activity_type,
        note=note,
        follow_up_date=follow_up_date,
        reminder_channel=reminder_channel,
        created_at=datetime.utcnow(),
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity
