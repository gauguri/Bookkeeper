from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.accounting.gl_engine import GLPostingError, postJournalEntries
from app.db import Base
from app.models import Customer, GLEntry, Invoice, InvoiceLine, Item


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def seed_invoice(db):
    customer = Customer(name="Accrual Co")
    item = Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()

    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-GL-0001",
        status="SENT",
        issue_date=date(2024, 1, 1),
        due_date=date(2024, 1, 31),
        subtotal=Decimal("100.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_due=Decimal("100.00"),
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("10.00"),
            unit_price=Decimal("10.00"),
            landed_unit_cost=Decimal("4.00"),
            line_total=Decimal("100.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
        )
    )
    db.flush()
    return invoice


def _batch_totals(db, batch_id: int):
    rows = db.query(GLEntry).filter(GLEntry.journal_batch_id == batch_id).all()
    debits = sum((Decimal(row.debit_amount or 0) for row in rows), Decimal("0.00"))
    credits = sum((Decimal(row.credit_amount or 0) for row in rows), Decimal("0.00"))
    return rows, debits, credits


def test_shipment_posting_recognizes_revenue_and_cogs():
    db = create_session()
    invoice = seed_invoice(db)

    batch_id = postJournalEntries(
        "shipment",
        {
            "event_id": f"shipment:{invoice.id}",
            "company_id": 1,
            "invoice_id": invoice.id,
            "shipment_id": invoice.id,
            "reference_id": invoice.id,
            "posting_date": date(2024, 1, 2),
            "shipped_ratio": Decimal("1.00"),
        },
        db,
    )
    rows, debits, credits = _batch_totals(db, batch_id)

    assert debits == credits == Decimal("140.00")
    assert len(rows) == 4


def test_partial_shipment_posts_proportionally_and_is_balanced():
    db = create_session()
    invoice = seed_invoice(db)

    batch_id = postJournalEntries(
        "shipment",
        {
            "event_id": f"shipment:{invoice.id}:partial1",
            "company_id": 1,
            "invoice_id": invoice.id,
            "shipment_id": 101,
            "reference_id": 101,
            "posting_date": date(2024, 1, 3),
            "shipped_ratio": Decimal("0.50"),
        },
        db,
    )
    rows, debits, credits = _batch_totals(db, batch_id)

    assert debits == credits == Decimal("70.00")
    assert sum((Decimal(r.credit_amount or 0) for r in rows)) == Decimal("70.00")


def test_payment_posting_reduces_ar_for_shipped_invoice():
    db = create_session()
    invoice = seed_invoice(db)
    postJournalEntries(
        "shipment",
        {
            "event_id": f"shipment:{invoice.id}",
            "company_id": 1,
            "invoice_id": invoice.id,
            "shipment_id": invoice.id,
            "reference_id": invoice.id,
            "posting_date": date(2024, 1, 2),
            "shipped_ratio": Decimal("1.00"),
        },
        db,
    )

    batch_id = postJournalEntries(
        "payment",
        {
            "event_id": "payment:1:invoice:1",
            "company_id": 1,
            "invoice_id": invoice.id,
            "payment_id": 1,
            "amount": Decimal("30.00"),
            "invoice_status": "SHIPPED",
            "reference_id": 1,
            "posting_date": date(2024, 1, 5),
        },
        db,
    )
    _, debits, credits = _batch_totals(db, batch_id)
    assert debits == credits == Decimal("30.00")


def test_prepayment_then_shipment_recognizes_unearned_then_revenue():
    db = create_session()
    invoice = seed_invoice(db)

    postJournalEntries(
        "payment",
        {
            "event_id": "payment:pre:1",
            "company_id": 1,
            "invoice_id": invoice.id,
            "payment_id": 1,
            "amount": Decimal("100.00"),
            "invoice_status": "SENT",
            "reference_id": 1,
            "posting_date": date(2024, 1, 1),
        },
        db,
    )

    batch_id = postJournalEntries(
        "shipment",
        {
            "event_id": f"shipment:{invoice.id}",
            "company_id": 1,
            "invoice_id": invoice.id,
            "shipment_id": invoice.id,
            "reference_id": invoice.id,
            "posting_date": date(2024, 1, 2),
            "shipped_ratio": Decimal("1.00"),
        },
        db,
    )
    rows, debits, credits = _batch_totals(db, batch_id)
    assert debits == credits
    revenue_credits = sum((Decimal(r.credit_amount or 0) for r in rows if r.account_id), Decimal("0.00"))
    assert revenue_credits >= Decimal("100.00")


def test_payment_rejects_if_ar_would_go_negative():
    db = create_session()
    invoice = seed_invoice(db)

    with pytest.raises(GLPostingError):
        postJournalEntries(
            "payment",
            {
                "event_id": "payment:negative:1",
                "company_id": 1,
                "invoice_id": invoice.id,
                "payment_id": 99,
                "amount": Decimal("10.00"),
                "invoice_status": "SHIPPED",
                "reference_id": 99,
                "posting_date": date(2024, 1, 3),
            },
            db,
        )
