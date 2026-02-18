from decimal import Decimal
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Customer, Inventory, Invoice, Item
from app.sales.service import build_invoice_lines, get_item_pricing_context


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_pricing_context_returns_landed_cost_recommended_price_and_available_qty():
    db = create_session()
    customer = Customer(name="Tier Customer", tier="GOLD")
    item = Item(name="Widget", unit_price=Decimal("100.00"), is_active=True)
    db.add_all([customer, item])
    db.flush()
    db.add(
        Inventory(
            item_id=item.id,
            quantity_on_hand=Decimal("12"),
            landed_unit_cost=Decimal("50.00"),
            total_value=Decimal("600.00"),
        )
    )
    db.commit()

    context = get_item_pricing_context(db, item_id=item.id, customer_id=customer.id)

    assert context["landed_unit_cost"] == Decimal("50.00")
    assert context["available_qty"] == Decimal("12")
    assert context["recommended_price"] == Decimal("57.50")


def test_invoice_line_sets_non_null_landed_cost_snapshot_and_keeps_it_stable():
    db = create_session()
    item = Item(name="Widget", unit_price=Decimal("100.00"), is_active=True)
    invoice = Invoice(
        customer_id=1,
        invoice_number="INV-000001",
        status="DRAFT",
        issue_date=date(2024, 1, 1),
        due_date=date(2024, 1, 10),
        subtotal=Decimal("0"),
        tax_total=Decimal("0"),
        total=Decimal("0"),
        amount_due=Decimal("0"),
    )
    db.add_all([item, invoice])
    db.flush()
    inventory = Inventory(
        item_id=item.id,
        quantity_on_hand=Decimal("10"),
        landed_unit_cost=Decimal("42.25"),
        total_value=Decimal("422.50"),
    )
    db.add(inventory)
    db.flush()

    lines = build_invoice_lines(
        db,
        invoice,
        [
            {
                "item_id": item.id,
                "quantity": Decimal("2"),
                "unit_price": Decimal("80.00"),
            }
        ],
    )
    invoice.lines = lines
    db.commit()

    assert invoice.lines[0].landed_unit_cost == Decimal("42.25")

    inventory.landed_unit_cost = Decimal("70.00")
    inventory.total_value = Decimal("700.00")
    db.commit()
    db.refresh(invoice)

    assert invoice.lines[0].landed_unit_cost == Decimal("42.25")
