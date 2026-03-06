from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.analytics.operational_backlog import OperationalBacklogFilters, get_operational_backlog
from app.db import Base, get_db
from app.main import app
from app.models import Customer, Inventory, InventoryReservation, Invoice, Item, PurchaseOrder, PurchaseOrderLine, SalesRequest, SalesRequestLine


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def seed_core_data(db_session):
    customer = Customer(name="Acme")
    item = Item(name="Widget", sku="W-1", unit_price=Decimal("50"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db_session.add_all([customer, item])
    db_session.flush()

    sr = SalesRequest(
        request_number="SR-1001",
        customer_id=customer.id,
        customer_name=customer.name,
        status="CONFIRMED",
        created_at=datetime.utcnow() - timedelta(days=12),
    )
    db_session.add(sr)
    db_session.flush()

    db_session.add(
        SalesRequestLine(
            sales_request_id=sr.id,
            item_id=item.id,
            item_name=item.name,
            quantity=Decimal("5"),
            unit_price=Decimal("50"),
            line_total=Decimal("250"),
        )
    )
    return customer, item, sr


def test_operational_backlog_empty_shape(db_session):
    payload = get_operational_backlog(db_session, date.today() - timedelta(days=30), date.today(), "YTD", OperationalBacklogFilters())
    assert payload["kpis"]["total_backlog_value"] == 0
    assert payload["item_shortages"] == []
    assert payload["customer_backlog"] == []


def test_operational_backlog_shortage_and_eta(db_session):
    customer, item, sr = seed_core_data(db_session)
    db_session.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("2"), landed_unit_cost=Decimal("5"), total_value=Decimal("10")))
    db_session.add(InventoryReservation(item_id=item.id, source_type="sales_request", source_id=sr.id, sales_request_id=sr.id, qty_reserved=Decimal("1")))

    po = PurchaseOrder(po_number="PO-1", supplier_id=1, status="SENT", order_date=date.today(), expected_date=date.today() + timedelta(days=3))
    db_session.add(po)
    db_session.flush()
    db_session.add(PurchaseOrderLine(purchase_order_id=po.id, item_id=item.id, qty_ordered=Decimal("8"), qty_received=Decimal("0"), unit_cost=Decimal("5"), freight_cost=Decimal("0"), tariff_cost=Decimal("0"), landed_cost=Decimal("5")))

    invoice = Invoice(customer_id=customer.id, invoice_number="INV-1", status="SENT", issue_date=date.today(), due_date=date.today() - timedelta(days=20), subtotal=Decimal("100"), tax_total=Decimal("0"), total=Decimal("100"), amount_due=Decimal("100"))
    db_session.add(invoice)
    db_session.commit()

    payload = get_operational_backlog(db_session, date.today() - timedelta(days=30), date.today(), "YTD", OperationalBacklogFilters())
    assert payload["kpis"]["open_sales_requests"] == 1
    assert payload["kpis"]["open_invoices"] == 1
    assert payload["item_shortages"][0]["shortage_qty"] == Decimal("4")
    assert payload["item_shortages"][0]["next_inbound_eta"] is not None
    assert payload["customer_backlog"][0]["risk_flag"] in {"yellow", "red"}


def test_operational_backlog_api_shape(client: TestClient, db_session):
    customer, item, sr = seed_core_data(db_session)
    db_session.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("10"), landed_unit_cost=Decimal("5"), total_value=Decimal("50")))
    db_session.commit()

    response = client.get("/api/analytics/operational-backlog?range=YTD")
    assert response.status_code == 200
    body = response.json()

    assert body["range"] == "YTD"
    assert set(body.keys()) == {"range", "filters", "kpis", "item_shortages", "customer_backlog", "debug"}
    assert set(body["kpis"].keys()) >= {"total_backlog_value", "open_sales_requests", "open_invoices"}


def test_operational_backlog_api_no_inventory_all_shortage(client: TestClient, db_session):
    seed_core_data(db_session)
    db_session.commit()
    response = client.get("/api/analytics/operational-backlog?range=YTD")
    assert response.status_code == 200
    first = response.json()["item_shortages"][0]
    assert Decimal(first["shortage_qty"]) > 0
