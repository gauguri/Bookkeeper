from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Item


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
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_item_import_format_contract(client: TestClient):
    response = client.get("/api/items/import-format")

    assert response.status_code == 200
    payload = response.json()
    assert payload["required_fields"] == ["item_code", "quantity"]
    assert "cost_price" in payload["optional_fields"]
    assert payload["sample_csv"].startswith("Item Code,Color,Type")


def test_item_import_preview_uses_item_code_and_quantity(client: TestClient):
    response = client.post(
        "/api/items/import-preview",
        json={
            "csv_data": "\n".join(
                [
                    "Item Code,Quantity,Sell Price,Item Description,Sales Description,Cost Price",
                    "12480,35,83.00,SELECT GREY MARKER,SELECT GREY MARKER,23.00",
                ]
            ),
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 0
    assert payload["summary"]["create_count"] == 1
    row = payload["rows"][0]
    assert row["status"] == "VALID"
    assert row["item_code"] == "12480"
    assert row["sku"] == "12480"
    assert Decimal(str(row["quantity"])) == Decimal("35")


def test_item_import_executes_create_and_update(client: TestClient):
    create_existing = client.post(
        "/api/items",
        json={"name": "Garden Bench Monument", "item_code": "2035", "sku": "2035", "unit_price": 25.00, "is_active": True},
    )
    assert create_existing.status_code == 201

    csv_data = "\n".join(
        [
            "Item Code,Color,Type,Quantity,Sell Price,Item Description,Sales Description,Cost Price,ReOrder Qty,InventoryCheck",
            "12480,GREY,MARKER,35,83.00,SELECT GREY MARKER,SELECT GREY MARKER,23.00,5,FALSE",
            "2035,BLACK,DIE,30,25.00,REPLICA,REPLICA,5.00,3,TRUE",
        ]
    )

    response = client.post(
        "/api/items/import",
        json={
            "csv_data": csv_data,
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["summary"]["create_count"] == 1
    assert payload["summary"]["update_count"] == 1
    assert len(payload["imported_items"]) == 2

    items_response = client.get("/api/items")
    assert items_response.status_code == 200
    items = items_response.json()
    by_code = {item["item_code"]: item for item in items}

    created = by_code["12480"]
    assert created["sku"] == "12480"
    assert created["name"] == "SELECT GREY MARKER"
    assert Decimal(str(created["unit_price"])) == Decimal("83.00")
    assert Decimal(str(created["cost_price"])) == Decimal("23.00")

    updated = by_code["2035"]
    assert Decimal(str(updated["unit_price"])) == Decimal("25.00")
    assert updated["inventory_check"] is True


def test_item_import_rejects_execution_when_preview_has_errors(client: TestClient):
    response = client.post(
        "/api/items/import",
        json={
            "csv_data": "Item Code,Quantity,Sell Price\nBAD-1,abc,12.00",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 400
    assert "Resolve validation issues" in response.json()["detail"]

