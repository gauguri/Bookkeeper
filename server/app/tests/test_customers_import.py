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
    assert payload["sample_csv"].startswith("Customer Number,Customer Name,Address,Address")


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


def test_customer_import_supports_glenrock_customer_csv_headers(client: TestClient):
    csv_data = "\n".join(
        [
            "Customer Number,Customer Name,Address,Address,City,State,Zip Code,Telephone,Fax Number,Primary Contact,Credit Limit,Shipping Method,Payment Terms,UploadtoPeach,CustomerEmail",
            '513,"1843, LLC",1000 CEDAR AVE.,,DARBY,PA,19023,610-789-5525,610-853-1719,GREG STEFEN,0.00,,Net 30,FALSE,laura@1843memorials.com',
        ]
    )

    preview = client.post(
        "/api/customers/import-preview",
        json={
            "csv_data": csv_data,
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )
    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["summary"]["error_rows"] == 0
    assert preview_payload["summary"]["create_count"] == 1

    execute = client.post(
        "/api/customers/import",
        json={
            "csv_data": csv_data,
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )

    assert execute.status_code == 201

    customers_response = client.get("/api/customers")
    assert customers_response.status_code == 200
    created = customers_response.json()[0]
    assert created["customer_number"] == "513"
    assert created["address_line_1"] == "1000 CEDAR AVE."
    assert created["city"] == "DARBY"
    assert created["state"] == "PA"
    assert created["zip_code"] == "19023"
    assert created["phone"] == "610-789-5525"
    assert created["fax_number"] == "610-853-1719"
    assert created["primary_contact"] == "GREG STEFEN"
    assert str(created["credit_limit"]) in {"0.0", "0.00", "0"}
    assert created["payment_terms"] == "Net 30"
    assert created["upload_to_peach"] is False
    assert created["email"] == "laura@1843memorials.com"


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
