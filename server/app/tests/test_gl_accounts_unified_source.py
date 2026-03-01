import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Account, Company, CompanyCode


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
            db.add(CompanyCode(code="1000", name="Main Company", base_currency="USD"))
            db.add_all(
                [
                    Account(company_id=company.id, code="10100", name="Cash - Regular Checking", type="ASSET", normal_balance="debit", is_active=True),
                    Account(company_id=company.id, code="13100", name="Inventory", type="ASSET", normal_balance="debit", is_active=True),
                    Account(company_id=company.id, code="—", name="Assets Header", type="ASSET", normal_balance="debit", is_active=True),
                    Account(company_id=company.id, code="21000", name="Accounts Payable", type="LIABILITY", normal_balance="credit", is_active=False),
                ]
            )
            db.commit()
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_gl_accounts_uses_coa_source_for_postable_accounts(client: TestClient):
    response = client.get("/api/gl/accounts?active_only=true&postable_only=true&company_code_id=1")

    assert response.status_code == 200
    data = response.json()
    assert [row["account_number"] for row in data] == ["10100", "13100"]
    assert all(row["is_postable"] is True for row in data)
