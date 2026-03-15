from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Customer, Inventory, Item, Opportunity, Quote, QuoteLine, SalesAccount, SalesOrder, SalesOrderLine
from app.sales_management.deal_desk import approve_quote, evaluate_deal, revenue_control_summary
from app.sales_management.service import create_order, create_quote


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


def seed_deal_context(db):
    customer = Customer(name="Memorial Group", tier="GOLD")
    db.add(customer)
    db.flush()

    account = SalesAccount(name="Memorial Group", customer_id=customer.id)
    db.add(account)
    db.flush()

    opportunity = Opportunity(account_id=account.id, name="Spring Monument Deal", stage="Qualification")
    db.add(opportunity)
    db.flush()

    item = Item(name="Premium Monument", sku="PM-001", unit_price=Decimal("200.00"), is_active=True, on_hand_qty=Decimal("10.00"), reserved_qty=Decimal("0.00"))
    db.add(item)
    db.flush()

    inventory = Inventory(item_id=item.id, quantity_on_hand=Decimal("10.00"), landed_unit_cost=Decimal("120.00"), total_value=Decimal("1200.00"))
    db.add(inventory)
    db.commit()
    return customer, account, opportunity, item


def test_evaluate_deal_detects_policy_breach_and_uplift(db_session):
    _, _, opportunity, item = seed_deal_context(db_session)

    evaluation = evaluate_deal(
        db_session,
        opportunity_id=opportunity.id,
        valid_until=date.today(),
        lines_payload=[
            {
                "item_id": item.id,
                "description": item.name,
                "qty": Decimal("2"),
                "unit_price": Decimal("160.00"),
                "discount_pct": Decimal("20"),
            }
        ],
    )

    assert evaluation["summary"]["approval_required"] is True
    assert evaluation["summary"]["recommended_revenue_uplift"] > 0
    assert any("policy threshold" in reason for reason in evaluation["summary"]["approval_reasons"])
    assert any("margin floor" in reason for reason in evaluation["summary"]["approval_reasons"])
    assert evaluation["lines"][0]["discount_percent"] == Decimal("20.00")



def test_create_quote_routes_for_approval_and_blocks_order_until_approved(db_session):
    _, account, opportunity, item = seed_deal_context(db_session)

    quote = create_quote(
        db_session,
        {
            "opportunity_id": opportunity.id,
            "valid_until": date.today(),
            "notes": "Strategic deal",
            "lines": [
                {
                    "item_id": item.id,
                    "description": item.name,
                    "qty": Decimal("1"),
                    "unit_price": Decimal("170.00"),
                    "discount_pct": Decimal("15"),
                }
            ],
        },
        user_id=1,
    )

    db_session.refresh(quote)
    assert quote.approval_status == "REQUESTED"
    assert Decimal(quote.lines[0].discount_pct) == Decimal("0.1500")

    with pytest.raises(ValueError):
        create_order(
            db_session,
            {
                "account_id": account.id,
                "quote_id": quote.id,
                "order_date": date.today(),
                "requested_ship_date": None,
                "fulfillment_type": "SHIPPING",
                "shipping_address": "123 Granite Way",
            },
            user_id=1,
        )

    approve_quote(db_session, quote, approver_user_id=99)
    db_session.commit()
    order = create_order(
        db_session,
        {
            "account_id": account.id,
            "quote_id": quote.id,
            "order_date": date.today(),
            "requested_ship_date": None,
            "fulfillment_type": "SHIPPING",
            "shipping_address": "123 Granite Way",
        },
        user_id=1,
    )
    assert order.quote_id == quote.id
    assert order.total == quote.total



def test_revenue_control_summary_surfaces_pending_quote_opportunity(db_session):
    _, _, opportunity, item = seed_deal_context(db_session)
    create_quote(
        db_session,
        {
            "opportunity_id": opportunity.id,
            "valid_until": date.today(),
            "notes": "Needs review",
            "lines": [
                {
                    "item_id": item.id,
                    "description": item.name,
                    "qty": Decimal("2"),
                    "unit_price": Decimal("150.00"),
                    "discount_pct": Decimal("10"),
                }
            ],
        },
        user_id=1,
    )

    summary = revenue_control_summary(db_session)
    assert summary["quotes_reviewed"] >= 1
    assert summary["pending_approvals"] >= 1
    assert summary["revenue_uplift"] > 0
