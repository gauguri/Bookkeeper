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


def test_bulk_import_chart_of_accounts(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/bulk-import",
        json={
            "csv_data": "2000,Accounts Payable,Liability,Current Liability,null\n2100,Trade Payables,Liability,null,2000"
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["created_count"] == 2

    accounts_response = client.get("/api/chart-of-accounts")
    assert accounts_response.status_code == 200
    accounts_by_code = {account["code"]: account for account in accounts_response.json()}
    assert "2000" in accounts_by_code
    assert "2100" in accounts_by_code
    assert accounts_by_code["2000"]["type"] == "LIABILITY"
    assert accounts_by_code["2000"]["subtype"] == "Current Liability"
    assert accounts_by_code["2100"]["parent_account"] is not None


def test_bulk_import_with_missing_parent_returns_bad_request(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/bulk-import",
        json={"csv_data": "2200,Deferred Revenue,Liability,null,9999"},
    )
    assert response.status_code == 400
    assert "Unable to resolve parent account codes" in response.json()["detail"]


def test_bulk_import_with_invalid_type_returns_bad_request(client: TestClient):
    response = client.post(
        "/api/chart-of-accounts/bulk-import",
        json={"csv_data": "2200,Deferred Revenue,Balance,null,null"},
    )
    assert response.status_code == 400
    assert "Invalid account type" in response.json()["detail"]
