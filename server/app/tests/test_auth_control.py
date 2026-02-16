from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password, seed_modules, verify_password
from app.db import Base, get_db
from app.main import app
from app.models import Company, Customer, Inventory, Item, Module, User, UserModuleAccess


@pytest.fixture()
def client():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
        company = Company(name="Demo", base_currency="USD", fiscal_year_start_month=1)
        db.add(company)
        db.flush()
        seed_modules(db)
        admin = User(company_id=company.id, email="admin@bookkeeper.local", full_name="Admin", password_hash=hash_password("password123"), is_admin=True, is_active=True, role="admin")
        staff = User(company_id=company.id, email="staff@bookkeeper.local", full_name="Staff", password_hash=hash_password("password123"), is_admin=False, is_active=True, role="user")
        limited_staff = User(company_id=company.id, email="limited@bookkeeper.local", full_name="Limited", password_hash=hash_password("password123"), is_admin=False, is_active=True, role="user")
        db.add_all([admin, staff, limited_staff])
        db.flush()
        invoices_module = db.query(Module).filter(Module.key == "INVOICES").first()
        sales_requests_module = db.query(Module).filter(Module.key == "SALES_REQUESTS").first()
        db.add(UserModuleAccess(user_id=staff.id, module_id=invoices_module.id))
        db.add(UserModuleAccess(user_id=limited_staff.id, module_id=sales_requests_module.id))
        customer = Customer(name="Acme")
        item = Item(name="Widget", unit_price=10, on_hand_qty=20, reserved_qty=0)
        db.add_all([customer, item])
        db.flush()
        db.add(Inventory(item_id=item.id, quantity_on_hand=20, landed_unit_cost=1))
        db.commit()

    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _login(client: TestClient, email: str):
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.real_auth
def test_login_and_me_allowed_modules(client):
    test_client, _ = client
    token = _login(test_client, "staff@bookkeeper.local")
    me = test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["allowed_modules"] == ["INVOICES"]


@pytest.mark.real_auth
def test_non_admin_cannot_call_control(client):
    test_client, _ = client
    token = _login(test_client, "staff@bookkeeper.local")
    response = test_client.get("/api/control/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    create_response = test_client.post(
        "/api/control/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "new@bookkeeper.local",
            "full_name": "New User",
            "password": "password123",
            "role": "EMPLOYEE",
            "permissions": ["INVOICES"],
        },
    )
    assert create_response.status_code == 403

    update_response = test_client.put(
        "/api/control/users/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Nope", "role": "EMPLOYEE", "is_active": True, "permissions": ["INVOICES"]},
    )
    assert update_response.status_code == 403


@pytest.mark.real_auth
def test_module_permission_denies_for_missing_access(client):
    test_client, _ = client
    token = _login(test_client, "staff@bookkeeper.local")
    response = test_client.get("/api/sales-requests", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403




@pytest.mark.real_auth
def test_invoice_api_requires_invoices_module(client):
    test_client, _ = client

    invoices_token = _login(test_client, "staff@bookkeeper.local")
    invoices_response = test_client.get("/api/invoices", headers={"Authorization": f"Bearer {invoices_token}"})
    assert invoices_response.status_code == 200

    no_invoices_token = _login(test_client, "limited@bookkeeper.local")
    no_invoices_response = test_client.get("/api/invoices", headers={"Authorization": f"Bearer {no_invoices_token}"})
    assert no_invoices_response.status_code == 403
    assert no_invoices_response.json()["detail"] == "Not authorized for module 'INVOICES'"



@pytest.mark.real_auth
def test_payments_api_requires_payments_module(client):
    test_client, _ = client

    invoices_only = _login(test_client, "staff@bookkeeper.local")
    denied = test_client.get("/api/payments", headers={"Authorization": f"Bearer {invoices_only}"})
    assert denied.status_code == 403
    assert denied.json()["detail"] == "Not authorized for module 'PAYMENTS'"

    sales_requests_only = _login(test_client, "limited@bookkeeper.local")
    denied_again = test_client.get("/api/payments", headers={"Authorization": f"Bearer {sales_requests_only}"})
    assert denied_again.status_code == 403

@pytest.mark.real_auth
def test_login_returns_allowed_modules_in_profile(client):
    test_client, _ = client
    response = test_client.post("/api/auth/login", json={"email": "limited@bookkeeper.local", "password": "password123"})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["allowed_modules"] == ["SALES_REQUESTS"]
    assert body["user"]["role"] == "EMPLOYEE"

@pytest.mark.real_auth
def test_admin_can_manage_user_permissions_and_deactivate(client):
    test_client, _ = client
    token = _login(test_client, "admin@bookkeeper.local")

    create_response = test_client.post(
        "/api/control/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "operator@bookkeeper.local",
            "full_name": "Operator",
            "password": "password123",
            "role": "EMPLOYEE",
            "permissions": ["INVOICES", "PAYMENTS"],
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["permissions"] == ["INVOICES", "PAYMENTS"]

    update_response = test_client.put(
        f"/api/control/users/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"full_name": "Operator Updated", "role": "EMPLOYEE", "is_active": False, "permissions": ["PAYMENTS"]},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["full_name"] == "Operator Updated"
    assert updated["is_active"] is False
    assert updated["permissions"] == ["PAYMENTS"]


@pytest.mark.real_auth
def test_control_rejects_invalid_permission(client):
    test_client, _ = client
    token = _login(test_client, "admin@bookkeeper.local")

    response = test_client.post(
        "/api/control/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "badperm@bookkeeper.local",
            "full_name": "Bad Permission",
            "password": "password123",
            "role": "EMPLOYEE",
            "permissions": ["NOT_A_REAL_MODULE"],
        },
    )
    assert response.status_code == 400


@pytest.mark.real_auth
def test_control_reset_password_updates_hash(client):
    test_client, session_local = client
    token = _login(test_client, "admin@bookkeeper.local")
    with session_local() as db:
        staff_id = db.query(User.id).filter(User.email == "staff@bookkeeper.local").scalar()

    response = test_client.post(
        f"/api/control/users/{staff_id}/reset-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "new-password-123"},
    )
    assert response.status_code == 204

    with session_local() as db:
        refreshed_staff = db.query(User).filter(User.id == staff_id).first()
        assert verify_password("new-password-123", refreshed_staff.password_hash)


@pytest.mark.real_auth
def test_create_sales_request_uses_authenticated_user_id(client):
    test_client, session_local = client
    token = _login(test_client, "admin@bookkeeper.local")
    with session_local() as db:
        customer_id = db.query(Customer.id).first()[0]
        item_id = db.query(Item.id).first()[0]
        admin_user_id = db.query(User.id).filter(User.email == "admin@bookkeeper.local").first()[0]

    payload = {
        "customer_id": customer_id,
        "notes": "test",
        "requested_fulfillment_date": str(date.today()),
        "lines": [{"item_id": item_id, "quantity": "1", "unit_price": "10"}],
    }
    response = test_client.post("/api/sales-requests", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 201
    assert response.json()["created_by_user_id"] == admin_user_id
