from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Inventory, InventoryReservation, Invoice, InvoiceLine, Item, SalesRequest, SalesRequestLine


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
            customer = Customer(name="Acme Corp", email="billing@acme.test")
            item = Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("10.00"), reserved_qty=Decimal("0.00"))
            db.add_all([customer, item])
            db.flush()

            sr = SalesRequest(
                request_number="SR-2026-0001",
                customer_id=customer.id,
                customer_name=customer.name,
                status="INVOICED",
            )
            db.add(sr)
            db.flush()
            db.add(
                SalesRequestLine(
                    sales_request_id=sr.id,
                    item_id=item.id,
                    item_name=item.name,
                    quantity=Decimal("3.00"),
                    unit_price=Decimal("10.00"),
                    line_total=Decimal("30.00"),
                )
            )
            db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("10.00"), landed_unit_cost=Decimal("4.00")))
            db.add(InventoryReservation(item_id=item.id, source_type="sales_request", source_id=sr.id, sales_request_id=sr.id, qty_reserved=Decimal("3.00")))

            invoice = Invoice(
                customer_id=customer.id,
                invoice_number="INV-000099",
                status="SENT",
                issue_date=date(2026, 1, 1),
                due_date=date(2026, 1, 31),
                subtotal=Decimal("30.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("30.00"),
                amount_due=Decimal("30.00"),
                sales_request_id=sr.id,
            )
            db.add(invoice)
            db.flush()
            db.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    item_id=item.id,
                    description="Widget",
                    quantity=Decimal("3.00"),
                    unit_price=Decimal("10.00"),
                    discount=Decimal("0.00"),
                    tax_rate=Decimal("0.00"),
                    line_total=Decimal("30.00"),
                )
            )
            db.commit()
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_ship_invoice_marks_shipped_and_sets_timestamp(client: TestClient):
    response = client.post("/api/invoices/1/ship")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SHIPPED"
    assert data["shipped_at"] is not None

    sr_detail = client.get("/api/sales-requests/1/detail")
    assert sr_detail.status_code == 200
    sr_data = sr_detail.json()
    assert sr_data["status"] == "SHIPPED"
    assert sr_data["linked_invoice_status"] == "SHIPPED"
    assert sr_data["linked_invoice_shipped_at"] is not None


def test_ship_invoice_rejects_invalid_status(client: TestClient):
    send_response = client.post("/api/invoices/1/ship")
    assert send_response.status_code == 200

    second_response = client.post("/api/invoices/1/ship")
    assert second_response.status_code == 400
    assert "Only sent invoices" in second_response.json()["detail"]


def test_shipping_deducts_inventory_once(client: TestClient):
    first = client.post("/api/invoices/1/ship")
    assert first.status_code == 200

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        inventory = db.query(Inventory).filter(Inventory.item_id == 1).first()
        reservation = db.query(InventoryReservation).filter(InventoryReservation.sales_request_id == 1).first()
        assert inventory is not None
        assert inventory.quantity_on_hand == Decimal("7.00")
        assert reservation.released_at is not None
    finally:
        db_gen.close()

    second = client.post("/api/invoices/1/ship")
    assert second.status_code == 400

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        inventory = db.query(Inventory).filter(Inventory.item_id == 1).first()
        reservation = db.query(InventoryReservation).filter(InventoryReservation.sales_request_id == 1).first()
        assert inventory is not None
        assert inventory.quantity_on_hand == Decimal("7.00")
        assert reservation.released_at is not None
    finally:
        db_gen.close()


def test_void_invoice_releases_reservation_without_on_hand_change(client: TestClient):
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        invoice = db.query(Invoice).filter(Invoice.id == 1).first()
        invoice.status = "SENT"
        db.commit()
        before = db.query(Inventory).filter(Inventory.item_id == 1).first().quantity_on_hand
    finally:
        db_gen.close()

    response = client.post("/api/invoices/1/void")
    assert response.status_code == 200

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        inventory = db.query(Inventory).filter(Inventory.item_id == 1).first()
        reservation = db.query(InventoryReservation).filter(InventoryReservation.sales_request_id == 1).first()
        assert inventory.quantity_on_hand == before
        assert reservation.released_at is not None
    finally:
        db_gen.close()


def test_ship_invoice_rejects_when_on_hand_is_insufficient(client: TestClient):
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        inventory = db.query(Inventory).filter(Inventory.item_id == 1).first()
        inventory.quantity_on_hand = Decimal("2.00")
        db.commit()
    finally:
        db_gen.close()

    response = client.post("/api/invoices/1/ship")
    assert response.status_code == 409

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        reservation = db.query(InventoryReservation).filter(InventoryReservation.sales_request_id == 1).first()
        assert reservation.released_at is None
    finally:
        db_gen.close()
