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

    app.state.testing_session_local = TestingSessionLocal
    with TestClient(app) as test_client:
        yield test_client
    app.state.testing_session_local = None

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
            "status": "NEW",
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
            "status": "NEW",
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
            "status": "NEW",
            "lines": [{"item_id": item_id, "quantity": quantity, "unit_price": 10}],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_create_sales_request_does_not_reserve_inventory_until_confirmed(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=5)

    assert sales_request_id is not None
    availability = client.get("/api/inventory/available?item_id=1")
    assert availability.status_code == 200
    assert availability.json() == {"item_id": 1, "available_qty": "10.00"}


def test_confirming_sales_request_creates_reservation(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=4)

    response = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "QUOTED"})
    assert response.status_code == 200

    response = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "CONFIRMED"})
    assert response.status_code == 200

    availability = client.get("/api/inventory/available?item_id=1")
    assert availability.status_code == 200
    assert availability.json() == {"item_id": 1, "available_qty": "6.00"}


def test_closing_sales_request_with_insufficient_inventory_is_atomic(client: TestClient):
    response = client.post(
        "/api/sales-requests",
        json={
            "customer_id": 1,
            "status": "NEW",
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
    assert close_response.status_code == 200

    item_1_inventory = client.get("/api/inventory/available?item_id=1")
    item_2_inventory = client.get("/api/inventory/available?item_id=2")
    assert item_1_inventory.json()["available_qty"] == "10.00"
    assert item_2_inventory.json()["available_qty"] == "1.00"


def _default_update_payload(**overrides):
    payload = {
        "customer_id": 1,
        "customer_name": None,
        "notes": "Updated notes",
        "requested_fulfillment_date": "2025-01-15",
        "line_items": [{"item_id": 1, "quantity": 2, "requested_price": 11}],
    }
    payload.update(overrides)
    return payload


def test_update_open_sales_request_fields_and_lines(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=1)

    response = client.put(f"/api/sales-requests/{sales_request_id}", json=_default_update_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["notes"] == "Updated notes"
    assert body["requested_fulfillment_date"] == "2025-01-15"
    assert len(body["lines"]) == 1
    assert body["lines"][0]["item_id"] == 1
    assert body["lines"][0]["quantity"] == "2.00"
    assert body["lines"][0]["unit_price"] == "11.00"


def test_update_closed_sales_request_returns_conflict(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=1)
    close_response = client.patch(f"/api/sales-requests/{sales_request_id}", json={"status": "CLOSED"})
    assert close_response.status_code == 200

    update_response = client.put(f"/api/sales-requests/{sales_request_id}", json=_default_update_payload())

    assert update_response.status_code == 409
    assert "Only NEW or QUOTED sales requests can be edited" in update_response.json()["detail"]


def test_update_sales_request_with_invoice_returns_conflict(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=1)
    with app.state.testing_session_local() as db:
        invoice = Invoice(
            customer_id=1,
            invoice_number="INV-TEST-0001",
            issue_date=date(2025, 1, 1),
            due_date=date(2025, 1, 31),
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("10.00"),
            amount_due=Decimal("10.00"),
            sales_request_id=sales_request_id,
        )
        db.add(invoice)
        db.commit()

    response = client.put(f"/api/sales-requests/{sales_request_id}", json=_default_update_payload())

    assert response.status_code == 409
    assert "cannot be edited after an invoice is generated" in response.json()["detail"]


def test_update_sales_request_rejects_quantity_above_available_inventory(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=1)

    response = client.put(
        f"/api/sales-requests/{sales_request_id}",
        json=_default_update_payload(line_items=[{"item_id": 2, "quantity": 4, "requested_price": 9}]),
    )

    assert response.status_code == 400
    payload = response.json()["detail"]
    assert payload["code"] == "INSUFFICIENT_INVENTORY"
    assert payload["violations"] == [
        {
            "item_id": 2,
            "item_name": "Bolt",
            "requested_qty": "4",
            "available_qty": "3.00",
        }
    ]


def test_sales_request_detail_includes_invoice_identifiers(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=2)

    with app.state.testing_session_local() as db:
        invoice = Invoice(
            customer_id=1,
            invoice_number="INV-000009",
            status="DRAFT",
            issue_date=date(2026, 1, 1),
            due_date=date(2026, 1, 31),
            subtotal=Decimal("20.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("20.00"),
            amount_due=Decimal("20.00"),
            sales_request_id=sales_request_id,
        )
        db.add(invoice)
        db.flush()
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                item_id=1,
                quantity=Decimal("2.00"),
                unit_price=Decimal("10.00"),
                discount=Decimal("0.00"),
                tax_rate=Decimal("0.00"),
                line_total=Decimal("20.00"),
            )
        )
        db.commit()
        invoice_id = invoice.id

    response = client.get(f"/api/sales-requests/{sales_request_id}/detail")

    assert response.status_code == 200
    payload = response.json()
    assert payload["invoice_id"] == invoice_id
    assert payload["invoice_number"] == "INV-000009"


def test_delete_sales_request_releases_reservation(client: TestClient):
    sales_request_id = _create_sales_request(client, item_id=1, quantity=3)

    delete_response = client.delete(f"/api/sales-requests/{sales_request_id}")
    assert delete_response.status_code == 204

    availability = client.get("/api/inventory/available?item_id=1")
    assert availability.status_code == 200
    assert availability.json() == {"item_id": 1, "available_qty": "10.00"}
