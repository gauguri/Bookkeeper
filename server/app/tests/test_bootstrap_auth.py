import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import User


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
    with TestClient(app) as test_client:
        yield test_client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


@pytest.mark.real_auth
def test_bootstrap_status_true_when_users_empty(client):
    test_client, _ = client
    response = test_client.get("/api/auth/bootstrap/status")
    assert response.status_code == 200
    assert response.json() == {"needs_bootstrap": True}


@pytest.mark.real_auth
def test_bootstrap_admin_can_only_be_created_once(client):
    test_client, _ = client

    first = test_client.post(
        "/api/auth/bootstrap/admin",
        json={"email": "admin@bookkeeper.local", "password": "password123!", "full_name": "Admin User"},
    )
    assert first.status_code == 201
    assert first.json()["user"]["email"] == "admin@bookkeeper.local"

    second = test_client.post(
        "/api/auth/bootstrap/admin",
        json={"email": "other-admin@bookkeeper.local", "password": "anotherpass123!"},
    )
    assert second.status_code == 409


@pytest.mark.real_auth
def test_bootstrap_status_false_after_admin_created(client):
    test_client, _ = client

    test_client.post(
        "/api/auth/bootstrap/admin",
        json={"email": "admin@bookkeeper.local", "password": "password123!", "full_name": "Admin User"},
    )

    status_response = test_client.get("/api/auth/bootstrap/status")
    assert status_response.status_code == 200
    assert status_response.json() == {"needs_bootstrap": False}


@pytest.mark.real_auth
def test_dev_reset_admin_is_flag_gated(client, monkeypatch):
    test_client, session_local = client

    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("ALLOW_DEV_RESET", raising=False)
    blocked = test_client.post("/api/auth/dev/reset-admin", json={"password": "password123!"})
    assert blocked.status_code == 404

    monkeypatch.setenv("ALLOW_DEV_RESET", "true")
    allowed = test_client.post("/api/auth/dev/reset-admin", json={"password": "password123!"})
    assert allowed.status_code == 204

    with session_local() as db:
        user = db.query(User).filter(User.email == "admin@bookkeeper.local").first()
        assert user is not None
        assert user.is_admin is True
