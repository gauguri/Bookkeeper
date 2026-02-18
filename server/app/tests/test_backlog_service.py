from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.backlog.service import get_backlog_customers, get_backlog_items, get_backlog_summary
from app.db import Base
from app.models import (
    Customer,
    Inventory,
    InventoryReservation,
    Invoice,
    InvoiceLine,
    Item,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesRequest,
    SalesRequestLine,
)


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_backlog_metrics_and_shortages():
    db = create_session()
    customer = Customer(name="Acme")
    item = Item(name="Widget", unit_price=Decimal("10"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()

    db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("5"), landed_unit_cost=Decimal("2"), total_value=Decimal("10")))

    sr = SalesRequest(
        request_number="SR-1001",
        customer_id=customer.id,
        customer_name=customer.name,
        status="OPEN",
        created_at=datetime.utcnow() - timedelta(days=9),
    )
    db.add(sr)
    db.flush()
    db.add(
        SalesRequestLine(
            sales_request_id=sr.id,
            item_id=item.id,
            item_name=item.name,
            quantity=Decimal("4"),
            unit_price=Decimal("12"),
            line_total=Decimal("48"),
        )
    )

    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-1001",
        status="SENT",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("40"),
        tax_total=Decimal("0"),
        total=Decimal("40"),
        amount_due=Decimal("40"),
        created_at=datetime.utcnow() - timedelta(days=3),
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("2"),
            unit_price=Decimal("20"),
            line_total=Decimal("40"),
        )
    )

    db.add_all(
        [
            InventoryReservation(item_id=item.id, source_type="sales_request", source_id=sr.id, sales_request_id=sr.id, qty_reserved=Decimal("4")),
            InventoryReservation(item_id=item.id, source_type="invoice", source_id=invoice.id, invoice_id=invoice.id, qty_reserved=Decimal("2")),
        ]
    )

    po = PurchaseOrder(po_number="PO-1", supplier_id=1, status="SENT", order_date=date.today(), expected_date=date.today() + timedelta(days=5))
    db.add(po)
    db.flush()
    db.add(
        PurchaseOrderLine(
            purchase_order_id=po.id,
            item_id=item.id,
            qty_ordered=Decimal("8"),
            qty_received=Decimal("0"),
            unit_cost=Decimal("2"),
            freight_cost=Decimal("0"),
            tariff_cost=Decimal("0"),
            landed_cost=Decimal("2"),
        )
    )

    db.commit()

    summary = get_backlog_summary(db)
    assert summary.total_backlog_value == Decimal("88")
    assert summary.open_sales_requests_count == 1
    assert summary.open_invoices_count == 1

    items = get_backlog_items(db)
    assert len(items) == 1
    assert items[0].backlog_qty == Decimal("6")
    assert items[0].shortage_qty == Decimal("1")
    assert items[0].next_inbound_eta is not None
    assert len(items[0].consumers) == 2

    customers = get_backlog_customers(db)
    assert len(customers) == 1
    assert customers[0].customer == "Acme"
    assert customers[0].risk_flag == "HIGH"


def test_backlog_excludes_shipped_and_void_sources():
    db = create_session()
    customer = Customer(name="Beta")
    item = Item(name="Gadget", unit_price=Decimal("8"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()

    shipped_sr = SalesRequest(request_number="SR-SHIPPED", customer_id=customer.id, customer_name=customer.name, status="SHIPPED")
    void_invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-VOID",
        status="VOID",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("12"),
        tax_total=Decimal("0"),
        total=Decimal("12"),
        amount_due=Decimal("0"),
    )
    db.add_all([shipped_sr, void_invoice])
    db.flush()

    db.add_all(
        [
            InventoryReservation(item_id=item.id, source_type="sales_request", source_id=shipped_sr.id, sales_request_id=shipped_sr.id, qty_reserved=Decimal("1")),
            InventoryReservation(item_id=item.id, source_type="invoice", source_id=void_invoice.id, invoice_id=void_invoice.id, qty_reserved=Decimal("1")),
        ]
    )
    db.commit()

    summary = get_backlog_summary(db)
    assert summary.total_backlog_value == Decimal("0")
    assert summary.open_sales_requests_count == 0
    assert summary.open_invoices_count == 0
    assert get_backlog_items(db) == []
    assert get_backlog_customers(db) == []
