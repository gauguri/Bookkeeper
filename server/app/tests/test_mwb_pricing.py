from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Invoice, InvoiceLine, Item, SalesRequest, SalesRequestLine
from app.pricing.mwb import compute_mwb_price, weighted_quantile


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def seed_history(db, customer_id: int, item_id: int):
    today = date.today()
    for idx, price in enumerate([100, 105, 110, 115, 120, 125]):
        invoice = Invoice(
            customer_id=customer_id,
            invoice_number=f"INV-MWB-{idx}",
            status="PAID",
            issue_date=today - timedelta(days=idx * 20),
            due_date=today,
            subtotal=Decimal(price),
            tax_total=Decimal("0"),
            total=Decimal(price),
            amount_due=Decimal("0"),
        )
        db.add(invoice)
        db.flush()
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                item_id=item_id,
                quantity=Decimal("1"),
                unit_price=Decimal(price),
                line_total=Decimal(price),
                discount=Decimal("0"),
                tax_rate=Decimal("0"),
            )
        )


def test_weighted_quantile_behaviour():
    values = [Decimal("10"), Decimal("20"), Decimal("30")]
    weights = [0.1, 0.7, 0.2]
    assert weighted_quantile(values, weights, 0.5) == Decimal("20")


def test_compute_mwb_with_guardrails_and_rounding():
    db = create_session()
    customer = Customer(name="Acme")
    item = Item(name="Monument Alpha", unit_price=Decimal("140"), is_active=True)
    db.add_all([customer, item])
    db.flush()
    seed_history(db, customer.id, item.id)
    db.commit()

    result = compute_mwb_price(db, customer_id=customer.id, item_id=item.id, qty=Decimal("1"))
    assert result.mwb_unit_price % Decimal("10") == 0
    assert result.source_level == "customer_item"
    assert "candidates" in result.explanation


def test_compute_mwb_fallback_level_for_sparse_data():
    db = create_session()
    customer = Customer(name="Sparse")
    item = Item(name="Accessory", unit_price=Decimal("45"), is_active=True)
    db.add_all([customer, item])
    db.flush()

    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-SPARSE",
        status="PAID",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("60"),
        tax_total=Decimal("0"),
        total=Decimal("60"),
        amount_due=Decimal("0"),
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("1"),
            unit_price=Decimal("60"),
            line_total=Decimal("60"),
            discount=Decimal("0"),
            tax_rate=Decimal("0"),
        )
    )
    db.commit()

    result = compute_mwb_price(db, customer_id=customer.id, item_id=item.id, qty=Decimal("2"))
    assert result.source_level in {"customer_global", "global_item", "global_global", "customer_item"}
    assert result.confidence in {"Low", "Medium", "High"}


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
            customer = Customer(name="API Customer")
            item = Item(name="Monument Bravo", unit_price=Decimal("160"), is_active=True)
            db.add_all([customer, item])
            db.flush()
            seed_history(db, customer.id, item.id)
            sr = SalesRequest(request_number="SR-TEST-0001", customer_id=customer.id, customer_name=customer.name, status="NEW")
            db.add(sr)
            db.flush()
            db.add(SalesRequestLine(sales_request_id=sr.id, item_id=item.id, item_name=item.name, quantity=Decimal("2"), unit_price=Decimal("100"), line_total=Decimal("200")))
            db.commit()
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_mwb_endpoint_returns_schema(client: TestClient):
    response = client.get("/api/customers")
    customer_id = response.json()[0]["id"]
    item_id = client.get("/api/items").json()[0]["id"]

    mwb = client.get(f"/api/pricing/mwb?customer_id={customer_id}&item_id={item_id}&qty=2")
    assert mwb.status_code == 200
    payload = mwb.json()
    assert "unit_price" in payload
    assert "explanation" in payload


def test_apply_mwb_updates_sales_request_line(client: TestClient):
    sr = client.get("/api/sales-requests").json()[0]
    line_id = sr["lines"][0]["id"]

    applied = client.post(f"/api/sales-requests/{sr['id']}/line-items/{line_id}/apply-mwb", json={"qty": 2})
    assert applied.status_code == 200
    body = applied.json()
    assert Decimal(body["quoted_unit_price"]) == Decimal(body["mwb_unit_price"])
    assert body["source_level"]
