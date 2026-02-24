from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Opportunity, Quote, QuoteLine, SalesAccount, SalesOrder, SalesOrderLine
from app.sales_management.service import create_order


def _db_session():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    for table in [
        SalesAccount.__table__,
        Opportunity.__table__,
        Quote.__table__,
        QuoteLine.__table__,
        SalesOrder.__table__,
        SalesOrderLine.__table__,
    ]:
        table.create(bind=engine)
    return engine, TestingSessionLocal()


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
        db.close()
        for table in [
            SalesOrderLine.__table__,
            SalesOrder.__table__,
            QuoteLine.__table__,
            Quote.__table__,
            Opportunity.__table__,
            SalesAccount.__table__,
        ]:
            table.drop(bind=engine)


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
        db.close()
        for table in [
            SalesOrderLine.__table__,
            SalesOrder.__table__,
            QuoteLine.__table__,
            Quote.__table__,
            Opportunity.__table__,
            SalesAccount.__table__,
        ]:
            table.drop(bind=engine)
