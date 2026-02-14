from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Inventory, Item


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
                Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0")),
                Item(name="Bolt", unit_price=Decimal("3.00"), on_hand_qty=Decimal("100"), reserved_qty=Decimal("0")),
            ]
        )
        db.flush()
        db.add_all(
            [
                Inventory(item_id=1, quantity_on_hand=Decimal("10.00"), landed_unit_cost=Decimal("2.00")),
                Inventory(item_id=2, quantity_on_hand=Decimal("3.00"), landed_unit_cost=Decimal("1.00")),
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


def test_create_sales_request_ignores_nonexistent_created_by_user(client: TestClient):
    response = client.post(
        "/api/sales-requests",
        json={
            "customer_id": 1,
            "status": "OPEN",
            "created_by_user_id": 1,
            "lines": [{"item_id": 1, "quantity": 2, "unit_price": 10}],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created_by_user_id"] is None

    detail = client.get(f"/api/sales-requests/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["created_by_user_id"] is None


def _create_sales_request(client: TestClient, *, item_id: int, quantity: int):
    response = client.post(
        "/api/sales-requests",
        json={
            "customer_id": 1,
            "status": "OPEN",
            "lines": [{"item_id": item_id, "quantity": quantity, "unit_price": 10}],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_closing_sales_request_reduces_inventory(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=5)

    close_response = client.patch(
        f"/api/sales-requests/{sales_request_id}",
        json={"status": "CLOSED"},
    )

    assert close_response.status_code == 200
    availability = client.get("/api/inventory/available?item_id=1")
    assert availability.status_code == 200
    assert availability.json() == {"item_id": 1, "available_qty": "5.00"}


def test_closing_sales_request_twice_does_not_double_deduct(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=4)

    first_close = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "CLOSED"})
    second_close = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "CLOSED"})

    assert first_close.status_code == 200
    assert second_close.status_code == 200

    availability = client.get("/api/inventory/available?item_id=1")
    assert availability.status_code == 200
    assert availability.json() == {"item_id": 1, "available_qty": "6.00"}


def test_closing_sales_request_with_insufficient_inventory_is_atomic(client: TestClient):
    response = client.post(
        "/api/sales-requests",
        json={
            "customer_id": 1,
            "status": "OPEN",
            "lines": [
                {"item_id": 1, "quantity": 2, "unit_price": 10},
                {"item_id": 2, "quantity": 3, "unit_price": 3},
            ],
        },
    )
    assert response.status_code == 201
    sales_request_id = response.json()["id"]

    inventory_rows = client.get("/api/inventory").json()
    item_2_inventory_id = next(row["id"] for row in inventory_rows if row["item_id"] == 2)
    update_response = client.put(
        f"/api/inventory/{item_2_inventory_id}",
        json={"quantity_on_hand": 1, "landed_unit_cost": 1},
    )
    assert update_response.status_code == 200

    close_response = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "CLOSED"})
    assert close_response.status_code == 409
    assert "Insufficient inventory" in close_response.json()["detail"]

    item_1_inventory = client.get("/api/inventory/available?item_id=1")
    item_2_inventory = client.get("/api/inventory/available?item_id=2")
    assert item_1_inventory.json()["available_qty"] == "10.00"
    assert item_2_inventory.json()["available_qty"] == "1.00"
