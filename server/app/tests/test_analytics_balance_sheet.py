from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analytics.kpis import calc_balance_sheet
from app.db import Base
from app.models import Account, Inventory, Item, JournalEntry, JournalLine


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_balance_sheet_uses_gl_inventory_balance_for_asset_breakdown():
    db = create_session()

    cash = Account(company_id=1, code="10100", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    inventory_account = Account(company_id=1, code="13100", name="Inventory", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=1, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, inventory_account, equity])
    db.flush()

    je = JournalEntry(company_id=1, txn_date=date(2025, 1, 1), source_type="manual")
    db.add(je)
    db.flush()
    db.add_all(
        [
            JournalLine(journal_entry_id=je.id, account_id=cash.id, debit=Decimal("500.00"), credit=Decimal("0.00")),
            JournalLine(journal_entry_id=je.id, account_id=inventory_account.id, debit=Decimal("100.00"), credit=Decimal("0.00")),
            JournalLine(journal_entry_id=je.id, account_id=equity.id, debit=Decimal("0.00"), credit=Decimal("600.00")),
        ]
    )

    item = Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("999"), reserved_qty=Decimal("0"))
    db.add(item)
    db.flush()
    db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("999"), landed_unit_cost=Decimal("50.00"), total_value=Decimal("49950.00")))
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 1))

    assert result["total_assets"] == 600.0
    assert result["sections"]["assets"]["items"] == [
        {"label": "Current Assets", "value": 500.0},
        {"label": "Inventory", "value": 100.0},
    ]


def test_current_assets_formula_components_sum_matches_total():
    db = create_session()

    cash = Account(company_id=1, code="10100", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    ar = Account(company_id=1, code="12000", name="Accounts Receivable", type="ASSET", normal_balance="debit", is_active=True)
    inventory_account = Account(company_id=1, code="13100", name="Inventory", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=1, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, ar, inventory_account, equity])
    db.flush()

    je = JournalEntry(company_id=1, txn_date=date(2025, 1, 1), source_type="manual")
    db.add(je)
    db.flush()
    db.add_all(
        [
            JournalLine(journal_entry_id=je.id, account_id=cash.id, debit=Decimal("500.00"), credit=Decimal("0.00")),
            JournalLine(journal_entry_id=je.id, account_id=ar.id, debit=Decimal("200.00"), credit=Decimal("0.00")),
            JournalLine(journal_entry_id=je.id, account_id=inventory_account.id, debit=Decimal("100.00"), credit=Decimal("0.00")),
            JournalLine(journal_entry_id=je.id, account_id=equity.id, debit=Decimal("0.00"), credit=Decimal("800.00")),
        ]
    )
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 1))

    components_sum = round(sum(component["net"] for component in result["current_assets_components"]), 2)
    assert components_sum == result["current_assets_total"]
    assert result["current_assets_total"] == 700.0
