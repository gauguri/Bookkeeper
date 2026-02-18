from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Invoice, Payment, PaymentApplication


def build_client() -> TestClient:
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
        alpha = Customer(name="Alpha Manufacturing", email="ar@alpha.test")
        beta = Customer(name="Beta Retail", email="billing@beta.test")
        db.add_all([alpha, beta])
        db.flush()

        inv1 = Invoice(
            customer_id=alpha.id,
            invoice_number="INV-AR-001",
            status="SENT",
            issue_date=date(2025, 1, 1),
            due_date=date(2025, 1, 31),
            subtotal=Decimal("1000.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("1000.00"),
            amount_due=Decimal("1000.00"),
        )
        inv2 = Invoice(
            customer_id=alpha.id,
            invoice_number="INV-AR-002",
            status="PARTIALLY_PAID",
            issue_date=date(2025, 2, 1),
            due_date=date(2025, 3, 1),
            subtotal=Decimal("500.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("500.00"),
            amount_due=Decimal("300.00"),
        )
        inv3 = Invoice(
            customer_id=beta.id,
            invoice_number="INV-AR-003",
            status="SENT",
            issue_date=date(2025, 3, 1),
            due_date=date(2025, 3, 25),
            subtotal=Decimal("250.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("250.00"),
            amount_due=Decimal("250.00"),
        )
        db.add_all([inv1, inv2, inv3])
        db.flush()

        payment = Payment(
            customer_id=alpha.id,
            invoice_id=inv2.id,
            amount=Decimal("200.00"),
            payment_date=date(2025, 3, 20),
            method="ACH",
        )
        db.add(payment)
        db.flush()
        db.add(
            PaymentApplication(
                payment_id=payment.id,
                invoice_id=inv2.id,
                applied_amount=Decimal("200.00"),
            )
        )
        db.commit()

    return TestClient(app)


def test_ar_aging_groups_balances_and_days_to_pay():
    with build_client() as client:
        response = client.get("/api/ar/aging?as_of=2025-04-30")
        assert response.status_code == 200

        rows = response.json()
        assert len(rows) == 2

        alpha = next(row for row in rows if row["customer_name"] == "Alpha Manufacturing")
        assert alpha["31_60"] == "300.00"
        assert alpha["61_90"] == "1000.00"
        assert alpha["total"] == "1300.00"
        assert float(alpha["avg_days_to_pay"]) == 47.0


def test_ar_notes_and_reminders_log_activity():
    with build_client() as client:
        aging = client.get("/api/ar/aging?as_of=2025-04-30").json()
        customer_id = aging[0]["customer_id"]

        note_response = client.post(
            "/api/ar/notes",
            json={
                "customer_id": customer_id,
                "note": "Customer requested extension",
                "follow_up_date": "2025-05-05",
            },
        )
        assert note_response.status_code == 201
        assert note_response.json()["activity_type"] == "NOTE"

        reminder_response = client.post(
            "/api/ar/reminders",
            json={
                "customer_id": customer_id,
                "note": "Sent first notice",
                "follow_up_date": "2025-05-08",
                "channel": "email",
            },
        )
        assert reminder_response.status_code == 201
        reminder = reminder_response.json()
        assert reminder["activity_type"] == "REMINDER"
        assert reminder["reminder_channel"] == "EMAIL"

        refreshed = client.get("/api/ar/aging?as_of=2025-04-30").json()
        refreshed_customer = next(row for row in refreshed if row["customer_id"] == customer_id)
        assert refreshed_customer["last_action_type"] == "REMINDER"
        assert refreshed_customer["follow_up_date"] == "2025-05-08"
