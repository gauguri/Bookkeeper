from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db import Base
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
