from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Invoice, InvoiceLine


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
            customer = Customer(name="Acme Corp", email="billing@acme.test")
            db.add(customer)
            db.flush()
            invoice = Invoice(
                customer_id=customer.id,
                invoice_number="INV-000007",
                status="SENT",
                issue_date=date(2024, 6, 1),
                due_date=date(2024, 6, 30),
                subtotal=Decimal("200.00"),
                tax_total=Decimal("10.00"),
                total=Decimal("210.00"),
                amount_due=Decimal("210.00"),
            )
            db.add(invoice)
            db.flush()
            db.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    description="Consulting",
                    quantity=Decimal("2.00"),
                    unit_price=Decimal("100.00"),
                    discount=Decimal("0.00"),
                    tax_rate=Decimal("0.05"),
                    line_total=Decimal("200.00"),
                )
            )
            db.commit()
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_invoice_list_returns_numeric_id(client: TestClient):
    response = client.get("/api/invoices")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert isinstance(data[0]["id"], int)


def test_get_invoice_detail_by_numeric_id(client: TestClient):
    list_response = client.get("/api/invoices")
    invoice_id = list_response.json()[0]["id"]

    response = client.get(f"/api/invoices/{invoice_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["invoice_number"] == "INV-000007"
    assert data["customer"]["name"] == "Acme Corp"
    assert data["lines"][0]["line_total"] == "200.00"


def test_get_invoice_detail_by_invoice_number(client: TestClient):
    response = client.get("/api/invoices/INV-000007")
    assert response.status_code == 200
    data = response.json()
    assert data["invoice_number"] == "INV-000007"
    assert data["customer"]["email"] == "billing@acme.test"
    assert data["lines"][0]["description"] == "Consulting"
