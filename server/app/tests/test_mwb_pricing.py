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
from app.pricing.mwb import (
    _compute_quantity_discount,
    _estimate_confidence,
    _price_trend_adjustment,
    compute_mwb_price,
    weighted_quantile,
    Observation,
)


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def seed_history(db, customer_id: int, item_id: int, prices=None, base_date=None):
    today = base_date or date.today()
    if prices is None:
        prices = [100, 105, 110, 115, 120, 125]
    for idx, price in enumerate(prices):
        invoice = Invoice(
            customer_id=customer_id,
            invoice_number=f"INV-MWB-{customer_id}-{item_id}-{idx}",
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


# ---- Original tests ----

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


# ---- NEW tests for algorithm improvements ----

def test_tier_multiplier_increases_price():
    """PLATINUM customer should get a higher MWB than STANDARD with identical history."""
    db = create_session()
    standard_customer = Customer(name="Standard Corp", tier="STANDARD")
    platinum_customer = Customer(name="Platinum Corp", tier="PLATINUM")
    item = Item(name="Monument Delta", unit_price=Decimal("200"), is_active=True)
    db.add_all([standard_customer, platinum_customer, item])
    db.flush()

    # Seed identical history for both customers
    seed_history(db, standard_customer.id, item.id, prices=[100, 110, 120, 130, 140, 150])
    seed_history(db, platinum_customer.id, item.id, prices=[100, 110, 120, 130, 140, 150])
    db.commit()

    standard_result = compute_mwb_price(db, customer_id=standard_customer.id, item_id=item.id, qty=Decimal("1"))
    platinum_result = compute_mwb_price(db, customer_id=platinum_customer.id, item_id=item.id, qty=Decimal("1"))

    assert platinum_result.mwb_unit_price >= standard_result.mwb_unit_price, (
        f"PLATINUM ({platinum_result.mwb_unit_price}) should be >= STANDARD ({standard_result.mwb_unit_price})"
    )
    assert platinum_result.explanation.get("customer_tier") == "PLATINUM"
    assert standard_result.explanation.get("customer_tier") == "STANDARD"


def test_price_trend_pushes_pivot_up():
    """Monotonically increasing prices should produce positive trend adjustment."""
    today = date.today()
    # Most recent price is highest (idx=0 is most recent in seed_history)
    observations = [
        Observation(unit_price=Decimal("100"), quantity=Decimal("1"), issue_date=today - timedelta(days=100), item_id=1, source="test"),
        Observation(unit_price=Decimal("110"), quantity=Decimal("1"), issue_date=today - timedelta(days=80), item_id=1, source="test"),
        Observation(unit_price=Decimal("120"), quantity=Decimal("1"), issue_date=today - timedelta(days=60), item_id=1, source="test"),
        Observation(unit_price=Decimal("130"), quantity=Decimal("1"), issue_date=today - timedelta(days=40), item_id=1, source="test"),
        Observation(unit_price=Decimal("140"), quantity=Decimal("1"), issue_date=today - timedelta(days=20), item_id=1, source="test"),
        Observation(unit_price=Decimal("150"), quantity=Decimal("1"), issue_date=today, item_id=1, source="test"),
    ]
    weights = [1.0] * len(observations)

    adjustment = _price_trend_adjustment(observations, weights, today)
    assert adjustment > Decimal("0"), f"Trend adjustment should be positive, got {adjustment}"
    # Should be capped at 10% of mean (~$125)
    assert adjustment <= Decimal("13"), f"Trend adjustment {adjustment} exceeds 10% cap"


def test_market_blending_with_sparse_data():
    """When customer has fewer than 15 observations, market data should be blended."""
    db = create_session()
    customer = Customer(name="Thin History")
    other_customer = Customer(name="Market Contributor")
    item = Item(name="Monument Echo", unit_price=Decimal("200"), is_active=True)
    db.add_all([customer, other_customer, item])
    db.flush()

    # Customer: 6 observations (above min 5, below blend threshold 15)
    seed_history(db, customer.id, item.id, prices=[100, 105, 110, 115, 120, 125])
    # Other customer: 10 observations (market data)
    seed_history(db, other_customer.id, item.id, prices=[130, 135, 140, 145, 150, 155, 160, 165, 170, 175])
    db.commit()

    result = compute_mwb_price(db, customer_id=customer.id, item_id=item.id, qty=Decimal("1"))
    assert result.source_level == "customer_item"
    # Market blending should be mentioned in warnings
    blending_warnings = [w for w in result.explanation.get("warnings", []) if "market" in w.lower() or "blend" in w.lower()]
    assert len(blending_warnings) > 0, "Expected a market blending warning"
    assert result.explanation.get("market_observations_blended", 0) > 0


def test_quantity_discount_log_curve():
    """Verify the new log-elasticity curve produces expected discounts."""
    quantities = [Decimal("1"), Decimal("2"), Decimal("3")]

    # At 10x the median (median=2, target=20), STANDARD beta=0.06
    discount_10x = _compute_quantity_discount(Decimal("20"), quantities, tier="STANDARD")
    assert discount_10x < Decimal("1.0"), f"Expected discount at 10x, got {discount_10x}"
    assert discount_10x > Decimal("0.75"), f"Expected within floor, got {discount_10x}"

    # PLATINUM should get smaller discount at same volume
    discount_platinum = _compute_quantity_discount(Decimal("20"), quantities, tier="PLATINUM")
    assert discount_platinum > discount_10x, (
        f"PLATINUM discount ({discount_platinum}) should be less aggressive than STANDARD ({discount_10x})"
    )

    # At 1x median, no discount
    no_discount = _compute_quantity_discount(Decimal("2"), quantities, tier="STANDARD")
    assert no_discount == Decimal("1"), f"Expected no discount at median qty, got {no_discount}"


def test_confidence_scoring_factors():
    """Recent + consistent data = High; old + variable data = Low."""
    today = date.today()

    # Recent, consistent prices
    recent_consistent = [
        Observation(unit_price=Decimal("100"), quantity=Decimal("1"), issue_date=today - timedelta(days=i * 5), item_id=1, source="test")
        for i in range(20)
    ]
    label_high, score_high = _estimate_confidence("customer_item", recent_consistent, today)

    # Old, highly variable prices
    old_variable = [
        Observation(
            unit_price=Decimal(str(50 + i * 30)),  # 50, 80, 110, 140, 170 — huge variance
            quantity=Decimal("1"),
            issue_date=today - timedelta(days=200 + i * 30),
            item_id=1,
            source="test",
        )
        for i in range(5)
    ]
    label_low, score_low = _estimate_confidence("global_global", old_variable, today)

    assert score_high > score_low, f"Recent+consistent score ({score_high}) should beat old+variable ({score_low})"
    assert label_high == "High", f"Expected High confidence, got {label_high}"
    assert label_low == "Low", f"Expected Low confidence, got {label_low}"


def test_mwb_result_has_confidence_score():
    """MWBResult should include a numeric confidence_score between 0 and 1."""
    db = create_session()
    customer = Customer(name="Score Test")
    item = Item(name="Monument Foxtrot", unit_price=Decimal("150"), is_active=True)
    db.add_all([customer, item])
    db.flush()
    seed_history(db, customer.id, item.id)
    db.commit()

    result = compute_mwb_price(db, customer_id=customer.id, item_id=item.id, qty=Decimal("1"))

    assert hasattr(result, "confidence_score"), "MWBResult should have confidence_score"
    assert 0.0 <= result.confidence_score <= 1.0, f"confidence_score {result.confidence_score} out of range"
    assert result.confidence in {"High", "Medium", "Low"}
    assert "confidence_score" in result.explanation
