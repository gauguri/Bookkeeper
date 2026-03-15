from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Customer, InventoryReservation, Invoice, InvoiceLine, Opportunity, Quote, QuoteLine, SalesAccount, SalesActivity, SalesOrder, SalesOrderLine
from app.sales_management.order_execution import generate_invoice_from_sales_order, get_sales_order_360
from app.sales_management.service import create_order, update_order_status


TABLES = [
    Customer.__table__,
    SalesAccount.__table__,
    Opportunity.__table__,
    Quote.__table__,
    QuoteLine.__table__,
    Invoice.__table__,
    InvoiceLine.__table__,
    InventoryReservation.__table__,
    SalesOrder.__table__,
    SalesOrderLine.__table__,
    SalesActivity.__table__,
]


def _db_session():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    for table in TABLES:
        table.create(bind=engine)
    return engine, TestingSessionLocal()


def _teardown(engine, db):
    db.close()
    for table in reversed(TABLES):
        table.drop(bind=engine)


def test_create_order_with_lines_calculates_totals_and_line_values():
    engine, db = _db_session()
    try:
        account = SalesAccount(name="Acme")
        db.add(account)
        db.commit()

        order = create_order(
            db,
            {
                "account_id": account.id,
                "order_date": date.today(),
                "requested_ship_date": None,
                "fulfillment_type": "SHIPPING",
                "shipping_address": "123 Test St",
                "lines": [
                    {"description": "Line 1", "qty": "2", "unit_price": "20", "discount_pct": "0.1"},
                    {"description": "Line 2", "qty": "1", "unit_price": "10", "discount_pct": "0"},
                ],
            },
            user_id=1,
        )

        assert Decimal(order.subtotal) == Decimal("50.00")
        assert Decimal(order.tax_total) == Decimal("0.00")
        assert Decimal(order.total) == Decimal("46.00")
        assert len(order.lines) == 2
        assert Decimal(order.lines[0].discount) == Decimal("4.00")
        assert Decimal(order.lines[0].line_total) == Decimal("36.00")
    finally:
        _teardown(engine, db)


def test_create_order_with_quote_uses_quote_totals_and_lines():
    engine, db = _db_session()
    try:
        account = SalesAccount(name="Globex")
        db.add(account)
        db.flush()

        opportunity = Opportunity(account_id=account.id, name="Big deal", stage="Prospecting")
        db.add(opportunity)
        db.flush()

        quote = Quote(
            opportunity_id=opportunity.id,
            quote_number="QT-00001",
            version=1,
            status="DRAFT",
            subtotal=Decimal("120.00"),
            discount_total=Decimal("20.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("100.00"),
            approval_status="NOT_REQUIRED",
        )
        quote.lines = [
            QuoteLine(
                description="Quoted item",
                qty=Decimal("3"),
                unit_price=Decimal("40.00"),
                discount_pct=Decimal("0.1667"),
                discount_amount=Decimal("20.00"),
                line_total=Decimal("100.00"),
            )
        ]
        db.add(quote)
        db.commit()

        order = create_order(
            db,
            {
                "account_id": account.id,
                "opportunity_id": opportunity.id,
                "quote_id": quote.id,
                "order_date": date.today(),
                "requested_ship_date": None,
                "fulfillment_type": "SHIPPING",
                "shipping_address": "456 Quote Ln",
            },
            user_id=1,
        )

        assert Decimal(order.subtotal) == Decimal("120.00")
        assert Decimal(order.total) == Decimal("100.00")
        assert len(order.lines) == 1
        assert Decimal(order.lines[0].line_total) == Decimal("100.00")
    finally:
        _teardown(engine, db)


def test_update_order_status_blocks_invalid_transition():
    engine, db = _db_session()
    try:
        account = SalesAccount(name="Transition Co")
        db.add(account)
        db.commit()

        order = create_order(
            db,
            {
                "account_id": account.id,
                "order_date": date.today(),
                "requested_ship_date": None,
                "fulfillment_type": "SHIPPING",
                "shipping_address": "789 Route St",
                "lines": [{"description": "Monument", "qty": "1", "unit_price": "1000", "discount_pct": "0"}],
            },
            user_id=1,
        )

        with pytest.raises(ValueError, match="Cannot move sales order"):
            update_order_status(db, order, "ALLOCATED", user_id=1)
    finally:
        _teardown(engine, db)


def test_generate_invoice_from_sales_order_updates_execution_view(monkeypatch):
    engine, db = _db_session()
    try:
        account = SalesAccount(name="Execution Stone")
        db.add(account)
        db.commit()

        order = create_order(
            db,
            {
                "account_id": account.id,
                "order_date": date.today(),
                "requested_ship_date": date.today(),
                "fulfillment_type": "SHIPPING",
                "shipping_address": "11 Granite Ave",
                "lines": [{"description": "Headstone", "qty": "2", "unit_price": "750", "discount_pct": "0"}],
            },
            user_id=1,
        )
        order.status = "CONFIRMED"
        db.commit()
        db.refresh(order)

        def _fake_create_invoice(db_session, payload, reserve_stock=True):
            invoice = Invoice(
                customer_id=payload["customer_id"],
                invoice_number="INV-000123",
                status="DRAFT",
                issue_date=payload["issue_date"],
                due_date=payload["due_date"],
                notes=payload.get("notes"),
                terms=payload.get("terms"),
                subtotal=Decimal("1500.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("1500.00"),
                amount_due=Decimal("1500.00"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db_session.add(invoice)
            db_session.flush()
            return invoice

        monkeypatch.setattr("app.sales_management.order_execution.create_invoice", _fake_create_invoice)

        invoice = generate_invoice_from_sales_order(db, order)
        db.commit()
        db.refresh(order)

        execution = get_sales_order_360(db, order.id)
        assert invoice.invoice_number == "INV-000123"
        assert order.status == "INVOICED"
        assert order.invoice_id == invoice.id
        assert execution is not None
        assert execution["linked_invoice_number"] == "INV-000123"
        assert execution["status"] == "INVOICED"
        assert execution["allowed_transitions"] == []
    finally:
        _teardown(engine, db)



