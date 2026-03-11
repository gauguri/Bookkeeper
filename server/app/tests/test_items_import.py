import re
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
    assert payload["required_fields"] == ["name", "unit_price"]
    assert "sku" in payload["optional_fields"]
    assert payload["sample_csv"].startswith("name,sku,description,unit_price")


def test_item_import_preview_generates_sku_from_name_prefix(client: TestClient):
    response = client.post(
        "/api/items/import-preview",
        json={
            "csv_data": "name,unit_price\n6 x 2 x 2 Monument,200.00",
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
    assert row["sku"].startswith("6X2X")
    assert re.match(r"^[A-Z0-9]+$", row["sku"]) is not None


def test_item_import_executes_create_and_update(client: TestClient):
    create_existing = client.post(
        "/api/items",
        json={"name": "Garden Bench Monument", "sku": "GBM0001", "unit_price": 450.00, "is_active": True},
    )
    assert create_existing.status_code == 201

    csv_data = "\n".join(
        [
            "name,sku,description,unit_price,is_active",
            "6 x 2 x 2 Monument,,Premium granite monument,200.00,true",
            "Garden Bench Monument,GBM0001,Updated description,475.00,true",
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
    by_name = {item["name"]: item for item in items}

    created = by_name["6 x 2 x 2 Monument"]
    assert re.match(r"^[A-Z0-9]+$", created["sku"]) is not None
    assert created["sku"].startswith("6X2X")

    updated = by_name["Garden Bench Monument"]
    assert Decimal(str(updated["unit_price"])) == Decimal("475.00")


def test_item_import_rejects_execution_when_preview_has_errors(client: TestClient):
    response = client.post(
        "/api/items/import",
        json={
            "csv_data": "name,unit_price\nBad Item,abc",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 400
    assert "Resolve validation issues" in response.json()["detail"]

