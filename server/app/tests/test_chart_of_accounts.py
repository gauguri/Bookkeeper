import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Account, Company


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
            company = Company(name="Demo", base_currency="USD", fiscal_year_start_month=1)
            db.add(company)
            db.flush()
            db.add(
                Account(
                    company_id=company.id,
                    code="1000",
                    name="Cash",
                    type="ASSET",
                    subtype="Cash",
                    normal_balance="debit",
                )
            )
            db.commit()
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_list_chart_of_accounts(client: TestClient):
    response = client.get("/api/chart-of-accounts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Cash"


def test_create_update_delete_chart_account(client: TestClient):
    created = client.post(
        "/api/chart-of-accounts",
        json={
            "name": "Supplies Expense",
            "code": "6100",
            "type": "EXPENSE",
            "subtype": "Supplies",
            "is_active": True,
        },
    )
    assert created.status_code == 201
    account_id = created.json()["id"]

    updated = client.patch(
        f"/api/chart-of-accounts/{account_id}",
        json={"name": "Office Supplies Expense", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Office Supplies Expense"
    assert updated.json()["is_active"] is False

    deleted = client.delete(f"/api/chart-of-accounts/{account_id}")
    assert deleted.status_code == 200


def test_delete_in_use_account_returns_conflict(client: TestClient):
    create_income = client.post(
        "/api/chart-of-accounts",
        json={"name": "Sales", "code": "4000", "type": "INCOME", "is_active": True},
    )
    account_id = create_income.json()["id"]

    client.post("/api/items", json={"name": "Widget", "unit_price": 10, "income_account_id": account_id, "is_active": True})

    response = client.delete(f"/api/chart-of-accounts/{account_id}")
    assert response.status_code == 409
    assert response.json()["detail"] == "Cannot delete account that is in use."


def test_chart_of_accounts_import_format(client: TestClient):
    response = client.get("/api/chart-of-accounts/import-format")
    assert response.status_code == 200
    payload = response.json()
    assert payload["required_fields"] == ["code", "name", "type"]
    assert "parent_code" in payload["optional_fields"]
    assert payload["sample_csv"].startswith("code,name,type")


def test_chart_of_accounts_import_preview_reports_create_and_update(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/import-preview",
        json={
            "csv_data": "code,name,type,subtype,description,parent_code,is_active\n1000,Cash Control,ASSET,Cash,Updated cash account,,true\n2100,Trade Payables,LIABILITY,Current Liability,Vendor obligations,,true",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["create_count"] == 1
    assert payload["summary"]["update_count"] == 1
    assert payload["summary"]["error_rows"] == 0


def test_chart_of_accounts_import_executes_create_and_update(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/import",
        json={
            "csv_data": "code,name,type,subtype,description,parent_code,is_active\n1000,Cash Control,ASSET,Cash,Updated cash account,,true\n2000,Accounts Payable,LIABILITY,Current Liability,Payables control,,true\n2100,Trade Payables,LIABILITY,Current Liability,Vendor obligations,2000,true",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["summary"]["create_count"] == 2
    assert payload["summary"]["update_count"] == 1
    assert len(payload["imported_accounts"]) == 3

    accounts_response = client.get("/api/chart-of-accounts")
    assert accounts_response.status_code == 200
    accounts_by_code = {account["code"]: account for account in accounts_response.json()}
    assert accounts_by_code["1000"]["name"] == "Cash Control"
    assert accounts_by_code["2000"]["type"] == "LIABILITY"
    assert accounts_by_code["2100"]["parent_account"]["code"] == "2000"


def test_chart_of_accounts_import_preview_reports_missing_parent(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/import-preview",
        json={
            "csv_data": "code,name,type,subtype,description,parent_code,is_active\n2200,Deferred Revenue,LIABILITY,Current Liability,Deferred rev,9999,true",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["error_rows"] == 1
    assert "Parent account code '9999'" in payload["rows"][0]["messages"][0]


def test_chart_of_accounts_import_rejects_execution_when_preview_has_errors(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/import",
        json={
            "csv_data": "code,name,type,subtype,description,parent_code,is_active\n2200,Deferred Revenue,BALANCE,Current Liability,Deferred rev,,true",
            "has_header": True,
            "conflict_strategy": "UPSERT",
        },
    )
    assert response.status_code == 400
    assert "Resolve validation issues" in response.json()["detail"]
