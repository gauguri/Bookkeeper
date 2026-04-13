from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Inventory, Invoice, InvoiceLine, Item


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
            item_by_id = Item(
                name="Item Chosen By Numeric Id",
                item_code="3689",
                sku="3689",
                unit_price=Decimal("280.00"),
                is_active=True,
            )
            db.add(item_by_id)
            db.flush()

            item_by_code = Item(
                name="Item Chosen By Glenrock Code",
                item_code="3103",
                sku="3103",
                unit_price=Decimal("320.00"),
                is_active=True,
            )
            db.add(item_by_code)
            db.flush()

            db.add_all([
                Inventory(item_id=item_by_id.id, quantity_on_hand=Decimal("1"), landed_unit_cost=Decimal("100.00"), total_value=Decimal("100.00")),
                Inventory(item_id=item_by_code.id, quantity_on_hand=Decimal("1"), landed_unit_cost=Decimal("120.00"), total_value=Decimal("120.00")),
            ])
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
                    item_id=item_by_code.id,
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


def test_numeric_item_code_prefers_item_code_over_internal_id(client: TestClient):
    response = client.get("/api/items/3103/360")
    assert response.status_code == 200
    data = response.json()
    assert data["item"]["item_code"] == "3103"
    assert data["item"]["name"] == "Item Chosen By Glenrock Code"
