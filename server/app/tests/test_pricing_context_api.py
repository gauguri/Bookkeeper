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
            customer = Customer(name="Acme", tier="GOLD")
            item = Item(name="Granite", unit_price=Decimal("190.00"), is_active=True)
            db.add_all([customer, item])
            db.flush()

            db.add(
                Inventory(
                    item_id=item.id,
                    quantity_on_hand=Decimal("5"),
                    landed_unit_cost=Decimal("119.50"),
                    total_value=Decimal("597.50"),
                )
            )

            invoice = Invoice(
                customer_id=customer.id,
                invoice_number="INV-100",
                status="PAID",
                issue_date=date(2024, 1, 1),
                due_date=date(2024, 1, 10),
                subtotal=Decimal("0"),
                tax_total=Decimal("0"),
                total=Decimal("0"),
                amount_due=Decimal("0"),
            )
            db.add(invoice)
            db.flush()

            db.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    item_id=item.id,
                    description="Historical line",
                    quantity=Decimal("3"),
                    unit_price=Decimal("137.42"),
                    discount=Decimal("0"),
                    tax_rate=Decimal("0"),
                    landed_unit_cost=Decimal("119.50"),
                    line_total=Decimal("412.269"),
                )
            )
            db.commit()
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_pricing_context_recommended_price_is_two_decimals(client: TestClient):
    customer_id = client.get("/api/customers").json()[0]["id"]
    item_id = client.get("/api/items").json()[0]["id"]

    response = client.get(f"/api/items/{item_id}/pricing-context?customer_id={customer_id}")

    assert response.status_code == 200
    payload = response.json()
    assert Decimal(payload["recommended_price"]) == Decimal("137.43")
    assert payload["warnings"] == []


def test_pricing_context_missing_landed_cost_returns_warning_and_200(client: TestClient):
    customer_id = client.get("/api/customers").json()[0]["id"]
    item_id = client.get("/api/items").json()[0]["id"]

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
        db.delete(inventory)
        db.commit()
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    response = client.get(f"/api/items/{item_id}/pricing-context?customer_id={customer_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["landed_unit_cost"] is None
    assert payload["recommended_price"] == "137.42"
    assert "No landed cost available; suggested sell not computed." in payload["warnings"]
