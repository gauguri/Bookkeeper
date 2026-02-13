from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Item


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

    with TestingSessionLocal() as db:
        customer = Customer(name="Acme", is_active=True)
        db.add(customer)
        db.flush()
        db.add_all(
            [
                Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("12"), reserved_qty=Decimal("2")),
                Item(name="Bolt", unit_price=Decimal("3.00"), on_hand_qty=Decimal("3"), reserved_qty=Decimal("0")),
            ]
        )
        db.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_get_available_inventory_for_single_item(client: TestClient):
    response = client.get("/api/inventory/available?item_id=1")

    assert response.status_code == 200
    assert response.json() == {"item_id": 1, "available_qty": "10.00"}


def test_get_available_inventory_for_multiple_items(client: TestClient):
    response = client.get("/api/inventory/available?item_ids=1,2")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {"item_id": 1, "available_qty": "10.00"},
            {"item_id": 2, "available_qty": "3.00"},
        ]
    }


def test_create_sales_request_rejects_quantity_above_available(client: TestClient):
    response = client.post(
        "/api/sales-requests",
        json={
            "customer_id": 1,
            "status": "OPEN",
            "lines": [{"item_id": 2, "quantity": 5, "unit_price": 3}],
        },
    )

    assert response.status_code == 400
    payload = response.json()["detail"]
    assert payload["code"] == "INSUFFICIENT_INVENTORY"
    assert "Quantity exceeds available inventory for Bolt" in payload["message"]
    assert payload["violations"] == [
        {
            "item_id": 2,
            "item_name": "Bolt",
            "requested_qty": "5",
            "available_qty": "3.00",
        }
    ]
