from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Customer, Invoice
from app.sales.schemas import PaymentApplicationCreate
from app.sales.service import apply_payment


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def create_customer(db, name="Draft Customer"):
    customer = Customer(name=name)
    db.add(customer)
    db.flush()
    return customer


def create_invoice(db, customer_id: int, status: str, total: Decimal, amount_due: Decimal):
    invoice = Invoice(
        customer_id=customer_id,
        invoice_number=f"INV-{customer_id}-{status}",
        status=status,
        issue_date=date(2024, 1, 1),
        due_date=date(2024, 1, 31),
        subtotal=total,
        tax_total=Decimal("0.00"),
        total=total,
        amount_due=amount_due,
    )
    db.add(invoice)
    db.flush()
    return invoice


def test_apply_payment_transitions_draft_to_sent_and_partial():
    db = create_session()
    customer = create_customer(db)
    invoice = create_invoice(db, customer.id, "DRAFT", Decimal("100.00"), Decimal("100.00"))

    apply_payment(
        db,
        {"customer_id": customer.id, "amount": Decimal("60.00"), "payment_date": date(2024, 2, 1)},
        [{"invoice_id": invoice.id, "applied_amount": Decimal("60.00")}],
    )
    db.commit()
    db.refresh(invoice)

    assert invoice.status == "PARTIALLY_PAID"
    assert invoice.amount_due == Decimal("40.00")


def test_apply_payment_partial_then_final_marks_paid():
    db = create_session()
    customer = create_customer(db, name="Two Step")
    invoice = create_invoice(db, customer.id, "DRAFT", Decimal("100.00"), Decimal("100.00"))

    apply_payment(
        db,
        {"customer_id": customer.id, "amount": Decimal("25.00"), "payment_date": date(2024, 2, 1)},
        [{"invoice_id": invoice.id, "applied_amount": Decimal("25.00")}],
    )
    db.commit()
    db.refresh(invoice)
    assert invoice.status == "PARTIALLY_PAID"
    assert invoice.amount_due == Decimal("75.00")

    apply_payment(
        db,
        {"customer_id": customer.id, "amount": Decimal("75.00"), "payment_date": date(2024, 2, 2)},
        [{"invoice_id": invoice.id, "applied_amount": Decimal("75.00")}],
    )
    db.commit()
    db.refresh(invoice)
    assert invoice.status == "PAID"
    assert invoice.amount_due == Decimal("0.00")


def test_apply_payment_blocks_over_application_on_draft():
    db = create_session()
    customer = create_customer(db, name="Over Apply")
    invoice = create_invoice(db, customer.id, "DRAFT", Decimal("100.00"), Decimal("100.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("150.00"), "payment_date": date(2024, 2, 3)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("150.00")}],
        )


def test_apply_payment_accepts_pydantic_applications():
    db = create_session()
    customer = create_customer(db, name="Pydantic Customer")
    invoice = create_invoice(db, customer.id, "SENT", Decimal("80.00"), Decimal("80.00"))

    apply_payment(
        db,
        {"customer_id": customer.id, "amount": Decimal("80.00"), "payment_date": date(2024, 2, 4)},
        [PaymentApplicationCreate(invoice_id=invoice.id, applied_amount=Decimal("80.00"))],
    )
    db.commit()
    db.refresh(invoice)
    assert invoice.status == "PAID"
    assert invoice.amount_due == Decimal("0.00")


def test_apply_payment_rejects_empty_applications():
    db = create_session()
    customer = create_customer(db, name="Empty Apps")

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("10.00"), "payment_date": date(2024, 2, 5)},
            [],
        )


def test_apply_payment_rejects_negative_application_amount():
    db = create_session()
    customer = create_customer(db, name="Negative Apps")
    invoice = create_invoice(db, customer.id, "SENT", Decimal("30.00"), Decimal("30.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("30.00"), "payment_date": date(2024, 2, 6)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("-5.00")}],
        )


def test_apply_payment_rejects_sum_mismatch():
    db = create_session()
    customer = create_customer(db, name="Mismatch Apps")
    invoice = create_invoice(db, customer.id, "SENT", Decimal("50.00"), Decimal("50.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("50.00"), "payment_date": date(2024, 2, 7)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("40.00")}],
        )


def test_apply_payment_rejects_missing_invoice():
    db = create_session()
    customer = create_customer(db, name="Missing Invoice")

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("25.00"), "payment_date": date(2024, 2, 8)},
            [{"invoice_id": 999, "applied_amount": Decimal("25.00")}],
        )


def test_apply_payment_rejects_customer_mismatch():
    db = create_session()
    customer = create_customer(db, name="First Customer")
    other_customer = create_customer(db, name="Second Customer")
    invoice = create_invoice(db, other_customer.id, "SENT", Decimal("40.00"), Decimal("40.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("40.00"), "payment_date": date(2024, 2, 9)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("40.00")}],
        )
