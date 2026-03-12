import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


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


def test_customer_import_format_contract(client: TestClient):
    response = client.get("/api/customers/import-format")

    assert response.status_code == 200
    payload = response.json()
    assert payload["required_fields"] == ["name"]
    assert "tier" not in payload["optional_fields"]
    assert payload["sample_csv"].startswith("name,email,phone,billing_address")


def test_customer_import_preview_ignores_tier_values(client: TestClient):
    create_existing = client.post(
        "/api/customers",
        json={"name": "DAVYDOV MONUMENTS", "email": "old@davydov.pro", "tier": "STANDARD", "is_active": True},
    )
    assert create_existing.status_code == 201

    csv_data = "\n".join(
        [
            "name,email,phone,billing_address,shipping_address,notes,tier,is_active",
            'DAVYDOV MONUMENTS,billing@davydov.pro,+1-555-0100,"123 Granite Way","123 Granite Way","Priority buyer",VIP,true',
            'North Ridge Memorials,contact@northridge.test,+1-555-0133,"Atlanta","Savannah","Seasonal reorder account",BRONZE,false',
        ]
    )
    response = client.post(
        "/api/customers/import-preview",
        json={
            "csv_data": csv_data,
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 0
    assert payload["summary"]["create_count"] == 1
    assert payload["summary"]["update_count"] == 1
    assert payload["rows"][0]["action"] == "UPDATE"
    assert payload["rows"][1]["action"] == "CREATE"
    assert "tier" not in payload["rows"][0]


def test_customer_import_executes_create_and_update_without_overwriting_tier(client: TestClient):
    create_existing = client.post(
        "/api/customers",
        json={"name": "DAVYDOV MONUMENTS", "email": "old@davydov.pro", "tier": "GOLD", "is_active": True},
    )
    assert create_existing.status_code == 201

    csv_data = "\n".join(
        [
            "name,email,phone,billing_address,shipping_address,notes,tier,is_active",
            'DAVYDOV MONUMENTS,billing@davydov.pro,+1-555-0100,"123 Granite Way","123 Granite Way","Priority buyer",VIP,true',
            'North Ridge Memorials,contact@northridge.test,+1-555-0133,"Atlanta","Savannah","Seasonal reorder account",BRONZE,false',
        ]
    )
    response = client.post(
        "/api/customers/import",
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
    assert len(payload["imported_customers"]) == 2

    customers_response = client.get("/api/customers")
    assert customers_response.status_code == 200
    customers = customers_response.json()
    by_name = {customer["name"]: customer for customer in customers}

    updated = by_name["DAVYDOV MONUMENTS"]
    assert updated["email"] == "billing@davydov.pro"
    assert updated["tier"] == "GOLD"
    assert updated["is_active"] is True

    created = by_name["North Ridge Memorials"]
    assert created["tier"] == "STANDARD"
    assert created["is_active"] is False


def test_customer_import_rejects_execution_when_preview_has_errors(client: TestClient):
    response = client.post(
        "/api/customers/import",
        json={
            "csv_data": "name,email,is_active\nBad Customer,bad@example.com,maybe",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert response.status_code == 400
    assert "Resolve validation issues" in response.json()["detail"]
