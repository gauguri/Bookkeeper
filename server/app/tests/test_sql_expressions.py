from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Column, Date, MetaData, Table, create_engine, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Customer, Invoice, Payment, PaymentApplication
from app.sales.service import get_customer_insights
from app.sql_expressions import days_between


def test_days_between_compiles_to_postgres_epoch_expression():
    metadata = MetaData()
    payments = Table("payments", metadata, Column("payment_date", Date))
    invoices = Table("invoices", metadata, Column("issue_date", Date))

    expression = days_between(
        payments.c.payment_date,
        invoices.c.issue_date,
        dialect_name="postgresql",
    )
    compiled = str(select(expression).compile(dialect=postgresql.dialect()))

    assert "EXTRACT(epoch FROM" in compiled
    assert "/ CAST(" in compiled
    assert "julianday" not in compiled.lower()


def test_customer_insights_average_days_to_pay_weighted_is_10_days():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        customer = Customer(name="Postgres Avg Days")
        db.add(customer)
        db.flush()

        issue_date = date.today() - timedelta(days=20)
        invoice = Invoice(
            customer_id=customer.id,
            invoice_number="INV-AVG-10",
            status="PAID",
            issue_date=issue_date,
            due_date=issue_date + timedelta(days=30),
            subtotal=Decimal("100.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("100.00"),
            amount_due=Decimal("0.00"),
        )
        db.add(invoice)
        db.flush()

        payment = Payment(
            customer_id=customer.id,
            invoice_id=invoice.id,
            amount=Decimal("100.00"),
            payment_date=issue_date + timedelta(days=10),
        )
        db.add(payment)
        db.flush()

        db.add(
            PaymentApplication(
                payment_id=payment.id,
                invoice_id=invoice.id,
                applied_amount=Decimal("100.00"),
            )
        )
        db.commit()

        insights = get_customer_insights(db, customer.id)
        assert float(insights["average_days_to_pay"]) == 10.0
