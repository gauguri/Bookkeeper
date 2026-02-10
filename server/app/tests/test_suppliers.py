from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Customer, Item, Supplier, SupplierItem, Invoice
from app.sales.service import build_invoice_lines
from app.suppliers.service import set_preferred_supplier


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def create_item(db, name="Widget", unit_price=Decimal("10.00")):
    item = Item(name=name, unit_price=unit_price, is_active=True)
    db.add(item)
    db.flush()
    return item


def create_supplier(db, name="Supply Co"):
    supplier = Supplier(name=name)
    db.add(supplier)
    db.flush()
    return supplier


def create_customer(db, name="Cost Customer"):
    customer = Customer(name=name)
    db.add(customer)
    db.flush()
    return customer


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
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def test_create_supplier():
    db = create_session()
    supplier = Supplier(name="Northwind")
    db.add(supplier)
    db.commit()

    assert supplier.id is not None
    assert supplier.name == "Northwind"


def test_create_supplier_item_link_with_costs():
    db = create_session()
    item = create_item(db)
    supplier = create_supplier(db)

    link = SupplierItem(
        item_id=item.id,
        supplier_id=supplier.id,
        supplier_cost=Decimal("4.00"),
        freight_cost=Decimal("1.00"),
        tariff_cost=Decimal("0.50"),
        is_preferred=True,
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    assert link.landed_cost == Decimal("5.50")
    assert link.is_preferred is True


def test_supplier_item_uniqueness():
    db = create_session()
    item = create_item(db)
    supplier = create_supplier(db)

    db.add(SupplierItem(item_id=item.id, supplier_id=supplier.id, supplier_cost=Decimal("3.00")))
    db.commit()

    db.add(SupplierItem(item_id=item.id, supplier_id=supplier.id, supplier_cost=Decimal("3.00")))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_preferred_supplier_only_one():
    db = create_session()
    item = create_item(db)
    supplier_one = create_supplier(db, "Primary Supply")
    supplier_two = create_supplier(db, "Backup Supply")

    first = SupplierItem(item_id=item.id, supplier_id=supplier_one.id, supplier_cost=Decimal("2.00"))
    second = SupplierItem(item_id=item.id, supplier_id=supplier_two.id, supplier_cost=Decimal("2.25"))
    db.add_all([first, second])
    db.flush()

    set_preferred_supplier(db, item, supplier_one.id)
    db.flush()
    assert first.is_preferred is True
    assert second.is_preferred is False

    set_preferred_supplier(db, item, supplier_two.id)
    db.flush()
    assert first.is_preferred is False
    assert second.is_preferred is True


def test_invoice_line_unit_cost_snapshot():
    db = create_session()
    item = create_item(db)
    supplier = create_supplier(db)
    link = SupplierItem(
        item_id=item.id,
        supplier_id=supplier.id,
        supplier_cost=Decimal("4.00"),
        freight_cost=Decimal("1.00"),
        tariff_cost=Decimal("0.50"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()

    customer = create_customer(db)
    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-TEST",
        status="DRAFT",
        issue_date=date(2024, 1, 1),
        due_date=date(2024, 1, 31),
        subtotal=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("0.00"),
        amount_due=Decimal("0.00"),
    )
    lines = build_invoice_lines(
        db,
        invoice,
        [
            {
                "item_id": item.id,
                "quantity": Decimal("1"),
                "unit_price": Decimal("10.00"),
            }
        ],
    )
    invoice.lines = lines
    db.add(invoice)
    db.commit()

    assert invoice.lines[0].unit_cost == Decimal("5.50")

    link.supplier_cost = Decimal("9.00")
    db.commit()
    assert invoice.lines[0].unit_cost == Decimal("5.50")


def test_api_create_supplier_item_link(client):
    supplier = client.post("/api/suppliers", json={"name": "Supply Co"}).json()
    item = client.post("/api/items", json={"name": "Widget", "unit_price": 10.0, "is_active": True}).json()

    response = client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier["id"], "supplier_cost": 4.0, "freight_cost": 1.0, "tariff_cost": 0.5},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["supplier_id"] == supplier["id"]
    assert payload["item_id"] == item["id"]
    assert payload["landed_cost"] == 5.5


def test_api_prevent_duplicate_supplier_item_link(client):
    supplier = client.post("/api/suppliers", json={"name": "Supply Co"}).json()
    item = client.post("/api/items", json={"name": "Widget", "unit_price": 10.0, "is_active": True}).json()

    client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier["id"], "supplier_cost": 4.0, "freight_cost": 1.0, "tariff_cost": 0.5},
    )
    response = client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier["id"], "supplier_cost": 4.0, "freight_cost": 1.0, "tariff_cost": 0.5},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Supplier already linked to item."


def test_api_preferred_supplier_uniqueness(client):
    supplier_one = client.post("/api/suppliers", json={"name": "Primary Supply"}).json()
    supplier_two = client.post("/api/suppliers", json={"name": "Backup Supply"}).json()
    item = client.post("/api/items", json={"name": "Widget", "unit_price": 10.0, "is_active": True}).json()

    client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier_one["id"], "supplier_cost": 2.0, "is_preferred": True},
    )
    client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier_two["id"], "supplier_cost": 2.25, "is_preferred": True},
    )
    list_response = client.get(f"/api/items/{item['id']}/suppliers")

    assert list_response.status_code == 200
    payload = list_response.json()
    preferred = [link for link in payload if link["is_preferred"]]
    assert len(preferred) == 1
    assert preferred[0]["supplier_id"] == supplier_two["id"]


def test_api_update_costs_recomputes_landed_cost(client):
    supplier = client.post("/api/suppliers", json={"name": "Supply Co"}).json()
    item = client.post("/api/items", json={"name": "Widget", "unit_price": 10.0, "is_active": True}).json()

    client.post(
        f"/api/items/{item['id']}/suppliers",
        json={"supplier_id": supplier["id"], "supplier_cost": 4.0, "freight_cost": 1.0, "tariff_cost": 0.5},
    )
    response = client.patch(
        f"/api/items/{item['id']}/suppliers/{supplier['id']}",
        json={"supplier_cost": 6.0, "freight_cost": 2.0, "tariff_cost": 1.0},
    )

    assert response.status_code == 200
    assert response.json()["landed_cost"] == 9.0
