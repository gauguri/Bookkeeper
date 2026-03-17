from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Opportunity, Quote, QuoteLine, SalesAccount


def _client_with_db():
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
        account = SalesAccount(name="Acme Memorials")
        db.add(account)
        db.flush()

        opportunity = Opportunity(
            account_id=account.id,
            name="Spring rollout",
            stage="Qualification",
            amount_estimate=Decimal("12000.00"),
            expected_close_date=date.today() - timedelta(days=1),
            updated_at=datetime.utcnow() - timedelta(days=9),
        )
        db.add(opportunity)
        db.flush()

        quote = Quote(
            opportunity_id=opportunity.id,
            quote_number="QT-00001",
            version=1,
            status="DRAFT",
            subtotal=Decimal("1000.00"),
            discount_total=Decimal("0"),
            tax_total=Decimal("0"),
            total=Decimal("1000.00"),
            updated_at=datetime.utcnow() - timedelta(days=5),
        )
        quote.lines = [QuoteLine(description="Granite set", qty=Decimal("1"), unit_price=Decimal("1000.00"), discount_pct=Decimal("0"), discount_amount=Decimal("0"), line_total=Decimal("1000.00"))]
        db.add(quote)
        db.commit()

    return engine, TestingSessionLocal


class _StartupDisabledClient:
    def __init__(self):
        self._startup = list(app.router.on_startup)
        self._shutdown = list(app.router.on_shutdown)
        app.router.on_startup = []
        app.router.on_shutdown = []
        self._client = TestClient(app)

    def __enter__(self):
        return self._client.__enter__()

    def __exit__(self, exc_type, exc, tb):
        try:
            return self._client.__exit__(exc_type, exc, tb)
        finally:
            app.router.on_startup = self._startup
            app.router.on_shutdown = self._shutdown


def test_create_and_complete_follow_up():
    engine, TestingSessionLocal = _client_with_db()
    try:
        with _StartupDisabledClient() as client:
            response = client.post(
                "/api/sales/follow-ups",
                json={
                    "entity_type": "opportunity",
                    "entity_id": 1,
                    "subject": "Call buyer back",
                    "body": "Review quote feedback",
                    "due_date": str(date.today()),
                    "priority": "HIGH",
                },
            )

            assert response.status_code == 201
            created = response.json()
            assert created["type"] == "follow_up"
            assert created["status"] == "OPEN"
            assert created["priority"] == "HIGH"
            assert created["owner_user_id"] == 1

            complete = client.post(f"/api/sales/follow-ups/{created['id']}/complete")
            assert complete.status_code == 200
            assert complete.json()["status"] == "DONE"
            assert complete.json()["completed_at"] is not None
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def test_follow_up_listing_filters_completed_by_default():
    engine, TestingSessionLocal = _client_with_db()
    try:
        with _StartupDisabledClient() as client:
            open_response = client.post(
                "/api/sales/follow-ups",
                json={"entity_type": "opportunity", "entity_id": 1, "subject": "Open follow-up"},
            )
            done_response = client.post(
                "/api/sales/follow-ups",
                json={"entity_type": "quote", "entity_id": 1, "subject": "Completed follow-up"},
            )
            done_id = done_response.json()["id"]
            client.post(f"/api/sales/follow-ups/{done_id}/complete")

            listing = client.get("/api/sales/follow-ups")
            assert listing.status_code == 200
            payload = listing.json()
            assert payload["total_count"] == 1
            assert payload["items"][0]["subject"] == "Open follow-up"

            listing_all = client.get("/api/sales/follow-ups?include_completed=true")
            assert listing_all.status_code == 200
            assert listing_all.json()["total_count"] == 2
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


def test_follow_up_summary_includes_due_and_stale_work():
    engine, TestingSessionLocal = _client_with_db()
    try:
        with _StartupDisabledClient() as client:
            overdue = client.post(
                "/api/sales/follow-ups",
                json={
                    "entity_type": "opportunity",
                    "entity_id": 1,
                    "subject": "Overdue follow-up",
                    "due_date": str(date.today() - timedelta(days=2)),
                },
            )
            assert overdue.status_code == 201

            due_today = client.post(
                "/api/sales/follow-ups",
                json={
                    "entity_type": "account",
                    "entity_id": 1,
                    "subject": "Due today follow-up",
                    "due_date": str(date.today()),
                },
            )
            assert due_today.status_code == 201

            summary = client.get("/api/sales/reports/follow-up-summary")
            assert summary.status_code == 200
            payload = summary.json()
            assert payload["open_count"] == 2
            assert payload["due_today_count"] == 1
            assert payload["overdue_count"] == 1
            assert payload["stale_opportunities_count"] >= 1
            assert payload["stale_quotes_count"] >= 1
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
