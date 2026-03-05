from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Account, Customer, GLEntry, Inventory, Invoice, Item
from app.sales.schemas import PaymentApplicationCreate
from app.sales.service import apply_payment, create_invoice_payment


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


def seed_posted_ar(db, invoice: Invoice, amount: Decimal):
    ar_account = (
        db.query(Account)
        .filter(Account.company_id == 1, Account.code == "1100")
        .first()
    )
    if ar_account is None:
        ar_account = Account(
            company_id=1,
            code="1100",
            name="Accounts Receivable",
            type="ASSET",
            normal_balance="debit",
            is_active=True,
        )
        db.add(ar_account)
        db.flush()
    db.add(
        GLEntry(
            journal_batch_id=1,
            account_id=ar_account.id,
            debit_amount=amount,
            credit_amount=Decimal("0.00"),
            reference_type="shipment",
            reference_id=invoice.id,
            invoice_id=invoice.id,
            shipment_id=invoice.id,
            event_type="shipment",
            event_id=f"shipment:{invoice.id}",
            posting_date=date(2024, 1, 1),
        )
    )
    db.flush()


def test_apply_payment_rejects_if_invoice_not_shipped():
    db = create_session()
    customer = create_customer(db)
    invoice = create_invoice(db, customer.id, "DRAFT", Decimal("100.00"), Decimal("100.00"))

    with pytest.raises(ValueError, match="posted/shipped"):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("60.00"), "payment_date": date(2024, 2, 1)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("60.00")}],
        )


def test_apply_payment_partial_then_final_marks_paid():
    db = create_session()
    customer = create_customer(db, name="Two Step")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("100.00"), Decimal("100.00"))
    seed_posted_ar(db, invoice, Decimal("100.00"))

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


def test_apply_payment_blocks_over_application_on_shipped():
    db = create_session()
    customer = create_customer(db, name="Over Apply")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("100.00"), Decimal("100.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("150.00"), "payment_date": date(2024, 2, 3)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("150.00")}],
        )


def test_apply_payment_accepts_pydantic_applications():
    db = create_session()
    customer = create_customer(db, name="Pydantic Customer")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("80.00"), Decimal("80.00"))
    seed_posted_ar(db, invoice, Decimal("80.00"))

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
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("30.00"), Decimal("30.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("30.00"), "payment_date": date(2024, 2, 6)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("-5.00")}],
        )


def test_apply_payment_rejects_sum_mismatch():
    db = create_session()
    customer = create_customer(db, name="Mismatch Apps")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("50.00"), Decimal("50.00"))

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
    invoice = create_invoice(db, other_customer.id, "SHIPPED", Decimal("40.00"), Decimal("40.00"))

    with pytest.raises(ValueError):
        apply_payment(
            db,
            {"customer_id": customer.id, "amount": Decimal("40.00"), "payment_date": date(2024, 2, 9)},
            [{"invoice_id": invoice.id, "applied_amount": Decimal("40.00")}],
        )


def test_apply_payment_does_not_change_inventory_quantities():
    db = create_session()
    customer = create_customer(db, name="Inventory Safe")
    item = Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add(item)
    db.flush()
    inventory = Inventory(item_id=item.id, quantity_on_hand=Decimal("10.00"), landed_unit_cost=Decimal("2.00"))
    db.add(inventory)
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("100.00"), Decimal("100.00"))
    seed_posted_ar(db, invoice, Decimal("100.00"))
    db.commit()

    apply_payment(
        db,
        {"customer_id": customer.id, "amount": Decimal("100.00"), "payment_date": date(2024, 2, 10)},
        [{"invoice_id": invoice.id, "applied_amount": Decimal("100.00")}],
    )
    db.commit()
    db.refresh(invoice)
    db.refresh(inventory)

    assert invoice.status == "PAID"
    assert inventory.quantity_on_hand == Decimal("10.00")


def test_create_invoice_payment_sets_invoice_link_and_partial_status():
    db = create_session()
    customer = create_customer(db, name="Linked Payment")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("125.00"), Decimal("125.00"))
    seed_posted_ar(db, invoice, Decimal("125.00"))

    payment = create_invoice_payment(
        db,
        {
            "invoice_id": invoice.id,
            "amount": Decimal("25.00"),
            "payment_date": date(2024, 2, 11),
            "method": "ACH",
            "notes": "Partial payment",
        },
    )
    db.commit()
    db.refresh(invoice)

    assert payment.invoice_id == invoice.id
    assert payment.customer_id == customer.id
    assert invoice.amount_due == Decimal("100.00")
    assert invoice.status == "PARTIALLY_PAID"


def test_create_invoice_payment_rejects_amount_outside_balance():
    db = create_session()
    customer = create_customer(db, name="Validation Customer")
    invoice = create_invoice(db, customer.id, "SHIPPED", Decimal("90.00"), Decimal("90.00"))

    with pytest.raises(ValueError):
        create_invoice_payment(
            db,
            {
                "invoice_id": invoice.id,
                "amount": Decimal("0.00"),
                "payment_date": date(2024, 2, 12),
            },
        )


def test_create_invoice_payment_rejects_invoice_not_posted_shipped():
    db = create_session()
    customer = create_customer(db, name="Not Posted")
    invoice = create_invoice(db, customer.id, "SENT", Decimal("90.00"), Decimal("90.00"))

    with pytest.raises(ValueError, match="posted/shipped"):
        create_invoice_payment(
            db,
            {
                "invoice_id": invoice.id,
                "amount": Decimal("20.00"),
                "payment_date": date(2024, 2, 12),
            },
        )

    with pytest.raises(ValueError):
        create_invoice_payment(
            db,
            {
                "invoice_id": invoice.id,
                "amount": Decimal("120.00"),
                "payment_date": date(2024, 2, 12),
            },
        )
