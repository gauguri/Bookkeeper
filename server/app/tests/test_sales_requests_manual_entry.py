from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Customer, Inventory, Invoice, InvoiceLine, Item, SalesRequest
from app.sales_requests.service import create_sales_request, get_sales_request_detail


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_rep_can_create_sales_request_and_see_it_in_list():
    db = create_session()
    customer = Customer(name="Acme Stores", is_active=True)
    item = Item(name="Widget", unit_price=Decimal("12.50"), is_active=True, on_hand_qty=Decimal("10"), reserved_qty=0)
    db.add_all([customer, item])
    db.flush()
    db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("10"), landed_unit_cost=Decimal("1.00")))
    db.commit()

    sales_request = create_sales_request(
        db,
        {
            "customer_id": customer.id,
            "notes": "Phone order from branch manager",
            "status": "OPEN",
            "created_by_user_id": 1,
            "lines": [{"item_id": item.id, "quantity": Decimal("2"), "unit_price": Decimal("12.50")}],
        },
    )
    db.commit()
    db.refresh(sales_request)

    assert sales_request.request_number.startswith("SR-")
    assert sales_request.customer_name == "Acme Stores"
    assert sales_request.lines[0].line_total == Decimal("25.00")

    listed = db.query(SalesRequest).filter(SalesRequest.customer_name.ilike("%acme%")).all()
    assert len(listed) == 1
    assert listed[0].id == sales_request.id


def test_sales_request_detail_prefers_linked_invoice_values_for_closed_requests():
    db = create_session()
    customer = Customer(name="Acme Stores", is_active=True)
    item = Item(name="Widget", unit_price=Decimal("12.50"), is_active=True, on_hand_qty=Decimal("10"), reserved_qty=0)
    db.add_all([customer, item])
    db.flush()
    db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("10"), landed_unit_cost=Decimal("1.00")))
    db.commit()

    sales_request = create_sales_request(
        db,
        {
            "customer_id": customer.id,
            "status": "OPEN",
            "lines": [{"item_id": item.id, "quantity": Decimal("2"), "unit_price": Decimal("12.50")}],
        },
    )
    db.flush()
    sales_request.status = "CLOSED"

    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-000007",
        status="DRAFT",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 1, 31),
        subtotal=Decimal("30.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("30.00"),
        amount_due=Decimal("30.00"),
        sales_request_id=sales_request.id,
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("2"),
            unit_price=Decimal("15.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
            line_total=Decimal("30.00"),
        )
    )
    db.commit()

    detail = get_sales_request_detail(db, sales_request.id)

    assert detail is not None
    assert detail["linked_invoice_number"] == "INV-000007"
    assert detail["display_total_amount"] == Decimal("30.00")
    assert detail["enriched_lines"][0]["unit_price"] == Decimal("12.50")
    assert detail["enriched_lines"][0]["invoice_unit_price"] == Decimal("15.00")
    assert detail["enriched_lines"][0]["invoice_line_total"] == Decimal("30.00")
