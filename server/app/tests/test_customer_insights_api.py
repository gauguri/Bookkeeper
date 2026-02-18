from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Invoice, InvoiceLine, Payment, PaymentApplication


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        with TestingSessionLocal() as db:
            customer = Customer(name="Glen Rock Retail")
            db.add(customer)
            db.flush()

            today = date.today()
            invoice_recent = Invoice(
                customer_id=customer.id,
                invoice_number="INV-RECENT",
                status="PARTIALLY_PAID",
                issue_date=today - timedelta(days=30),
                due_date=today + timedelta(days=15),
                subtotal=Decimal("100.00"),
                tax_total=Decimal("0"),
                total=Decimal("100.00"),
                amount_due=Decimal("20.00"),
            )
            invoice_ltm = Invoice(
                customer_id=customer.id,
                invoice_number="INV-LTM",
                status="PAID",
                issue_date=today - timedelta(days=200),
                due_date=today - timedelta(days=170),
                subtotal=Decimal("200.00"),
                tax_total=Decimal("0"),
                total=Decimal("200.00"),
                amount_due=Decimal("0"),
            )
            invoice_old = Invoice(
                customer_id=customer.id,
                invoice_number="INV-OLD",
                status="PAID",
                issue_date=today - timedelta(days=500),
                due_date=today - timedelta(days=470),
                subtotal=Decimal("90.00"),
                tax_total=Decimal("0"),
                total=Decimal("90.00"),
                amount_due=Decimal("0"),
            )
            db.add_all([invoice_recent, invoice_ltm, invoice_old])
            db.flush()

            db.add_all(
                [
                    InvoiceLine(
                        invoice_id=invoice_recent.id,
                        description="Recent",
                        quantity=Decimal("1"),
                        unit_price=Decimal("100.00"),
                        landed_unit_cost=Decimal("60.00"),
                        discount=Decimal("0"),
                        tax_rate=Decimal("0"),
                        line_total=Decimal("100.00"),
                    ),
                    InvoiceLine(
                        invoice_id=invoice_ltm.id,
                        description="LTM",
                        quantity=Decimal("1"),
                        unit_price=Decimal("200.00"),
                        landed_unit_cost=Decimal("100.00"),
                        discount=Decimal("0"),
                        tax_rate=Decimal("0"),
                        line_total=Decimal("200.00"),
                    ),
                ]
            )

            payment_ltm = Payment(
                customer_id=customer.id,
                invoice_id=invoice_ltm.id,
                amount=Decimal("200.00"),
                payment_date=invoice_ltm.issue_date + timedelta(days=20),
            )
            payment_recent = Payment(
                customer_id=customer.id,
                invoice_id=invoice_recent.id,
                amount=Decimal("80.00"),
                payment_date=invoice_recent.issue_date + timedelta(days=10),
            )
            db.add_all([payment_ltm, payment_recent])
            db.flush()

            db.add_all(
                [
                    PaymentApplication(
                        payment_id=payment_ltm.id,
                        invoice_id=invoice_ltm.id,
                        applied_amount=Decimal("200.00"),
                    ),
                    PaymentApplication(
                        payment_id=payment_recent.id,
                        invoice_id=invoice_recent.id,
                        applied_amount=Decimal("80.00"),
                    ),
                ]
            )
            db.commit()
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_customer_insights_returns_expected_aggregates(client: TestClient):
    customers = client.get("/api/customers")
    customer_id = customers.json()[0]["id"]

    response = client.get(f"/api/customers/{customer_id}/insights")
    assert response.status_code == 200
    data = response.json()

    expected_ytd = Decimal("300.00") if (date.today() - timedelta(days=200)).year == date.today().year else Decimal("100.00")

    assert Decimal(data["ytd_revenue"]) == expected_ytd
    assert data["ltm_revenue"] == "300.00"
    assert data["outstanding_ar"] == "20.00"
    assert float(data["gross_margin_percent"]) == pytest.approx(46.6666, abs=0.01)
    assert float(data["average_days_to_pay"]) == pytest.approx(17.1428, abs=0.01)
    assert [invoice["invoice_number"] for invoice in data["last_invoices"][:2]] == ["INV-RECENT", "INV-LTM"]


def test_customer_insights_404_for_unknown_customer(client: TestClient):
    response = client.get("/api/customers/9999/insights")
    assert response.status_code == 404
    assert response.json()["detail"] == "Customer not found."
