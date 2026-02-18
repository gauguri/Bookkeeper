from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import ARCollectionActivity, Account, Customer, Invoice, Payment, PaymentApplication, PurchaseOrder, JournalEntry, JournalLine
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


def get_cash_forecast(
    db: Session,
    *,
    weeks: int = 8,
    default_days_to_pay: int = 30,
    default_po_lead_days: int = 14,
) -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_buckets = [
        {
            "week_start": week_start + timedelta(days=index * 7),
            "expected_inflows": ZERO,
            "expected_outflows": ZERO,
        }
        for index in range(weeks)
    ]

    customer_days_to_pay = {
        row.customer_id: float(row.avg_days)
        for row in (
            db.query(
                Invoice.customer_id.label("customer_id"),
                (
                    func.sum(
                        (func.julianday(Payment.payment_date) - func.julianday(Invoice.issue_date))
                        * PaymentApplication.applied_amount
                    )
                    / func.nullif(func.sum(PaymentApplication.applied_amount), 0)
                ).label("avg_days"),
            )
            .join(PaymentApplication, PaymentApplication.invoice_id == Invoice.id)
            .join(Payment, Payment.id == PaymentApplication.payment_id)
            .filter(Invoice.status != "VOID")
            .group_by(Invoice.customer_id)
            .all()
        )
        if row.avg_days is not None
    }

    open_invoices = (
        db.query(Invoice)
        .filter(Invoice.status.notin_(["VOID", "PAID"]))
        .filter(Invoice.amount_due > 0)
        .all()
    )

    for invoice in open_invoices:
        expected_date = None
        avg_days = customer_days_to_pay.get(invoice.customer_id)
        if avg_days is not None:
            expected_date = invoice.issue_date + timedelta(days=max(0, round(avg_days)))
        elif invoice.due_date:
            expected_date = invoice.due_date
        else:
            expected_date = invoice.issue_date + timedelta(days=default_days_to_pay)

        bucket_index = (expected_date - week_start).days // 7
        if 0 <= bucket_index < weeks:
            week_buckets[bucket_index]["expected_inflows"] += Decimal(invoice.amount_due or 0)

    open_purchase_orders = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.status != "CANCELLED")
        .filter(PurchaseOrder.posted_journal_entry_id.is_(None))
        .all()
    )
    for po in open_purchase_orders:
        expected_po_date = po.expected_date or (po.order_date + timedelta(days=default_po_lead_days))
        bucket_index = (expected_po_date - week_start).days // 7
        if 0 <= bucket_index < weeks:
            po_total = Decimal(po.freight_cost or 0) + Decimal(po.tariff_cost or 0)
            po_total += sum((Decimal(line.qty_ordered or 0) * Decimal(line.unit_cost or 0) for line in po.lines), Decimal("0"))
            week_buckets[bucket_index]["expected_outflows"] += po_total

    scheduled_expenses = (
        db.query(JournalEntry, JournalLine)
        .join(JournalLine, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, Account.id == JournalLine.account_id)
        .filter(JournalEntry.txn_date >= today)
        .filter(JournalEntry.source_type == "MANUAL")
        .filter(or_(
            (JournalLine.debit > 0) & (Account.type == "EXPENSE"),
            (JournalLine.credit > 0) & (Account.type == "EXPENSE"),
        ))
        .all()
    )
    for entry, line in scheduled_expenses:
        bucket_index = (entry.txn_date - week_start).days // 7
        if 0 <= bucket_index < weeks:
            amount = Decimal(line.debit or 0) if Decimal(line.debit or 0) > 0 else Decimal(line.credit or 0)
            week_buckets[bucket_index]["expected_outflows"] += amount

    cumulative = ZERO
    response_buckets: list[dict[str, Any]] = []
    for bucket in week_buckets:
        inflows = Decimal(bucket["expected_inflows"]).quantize(Decimal("0.01"))
        outflows = Decimal(bucket["expected_outflows"]).quantize(Decimal("0.01"))
        net = (inflows - outflows).quantize(Decimal("0.01"))
        cumulative = (cumulative + net).quantize(Decimal("0.01"))
        response_buckets.append(
            {
                "week_start": bucket["week_start"],
                "week_end": bucket["week_start"] + timedelta(days=6),
                "expected_inflows": inflows,
                "expected_outflows": outflows,
                "net": net,
                "cumulative": cumulative,
            }
        )

    return {
        "generated_at": datetime.utcnow(),
        "default_days_to_pay": default_days_to_pay,
        "default_po_lead_days": default_po_lead_days,
        "includes_scheduled_expenses": True,
        "buckets": response_buckets,
    }
