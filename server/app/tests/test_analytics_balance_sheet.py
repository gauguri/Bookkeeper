from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.accounting.service import create_journal_entry
from app.analytics.kpis import calc_balance_sheet
from app.db import Base
from app.models import Account, Company


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_balance_sheet_reconciliation_difference_is_reported():
    db = create_session()

    company = Company(name="Balance Sheet Co", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()

    cash = Account(company_id=company.id, code="10100", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=company.id, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, equity])
    db.flush()

    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 1),
        memo="Owner contribution",
        source_type="MANUAL",
        source_id=None,
        debit_account_id=cash.id,
        credit_account_id=equity.id,
        amount=Decimal("500.00"),
    )
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 1))

    assert result["total_assets"] == 500.0
    assert result["total_equity"] == 500.0
    assert result["inventory_value"] == 0.0
    assert result["reconciliation_difference"] == 0.0


def test_balance_sheet_uses_gl_accounts_when_chart_account_row_is_missing():
    db = create_session()

    company = Company(name="GL Source Co", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()

    cash = Account(company_id=company.id, code="1000", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=company.id, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, equity])
    db.flush()

    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 1),
        memo="Owner contribution",
        source_type="MANUAL",
        source_id=None,
        debit_account_id=cash.id,
        credit_account_id=equity.id,
        amount=Decimal("100000.00"),
    )
    cash.code = "9999"
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 1))

    assert result["total_assets"] == 100000.0
    assert result["total_equity"] == 100000.0
    assert result["reconciliation_difference"] == 0.0
    assert result["sections"]["assets"]["items"] == [
        {
            "label": "Cash and Cash Equivalents",
            "value": 100000.0,
            "account_id": None,
            "account_code": "1000",
            "normal_balance": "DEBIT",
            "total_debits": 100000.0,
            "total_credits": 0.0,
        }
    ]


def test_balance_sheet_rolls_cash_accounts_into_net_cash_bucket():
    db = create_session()

    company = Company(name="Cash Rollup Co", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()

    cash = Account(company_id=company.id, code="1000", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    cash_equiv = Account(company_id=company.id, code="11000", name="Cash and Cash Equivalents", type="ASSET", normal_balance="debit", is_active=True)
    inventory = Account(company_id=company.id, code="13000", name="Inventory", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=company.id, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, cash_equiv, inventory, equity])
    db.flush()

    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 1),
        memo="Initial capital",
        source_type="MANUAL",
        source_id=None,
        debit_account_id=cash.id,
        credit_account_id=equity.id,
        amount=Decimal("100000.00"),
    )
    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 2),
        memo="Inventory purchase from cash equivalents",
        source_type="MANUAL",
        source_id=None,
        debit_account_id=inventory.id,
        credit_account_id=cash_equiv.id,
        amount=Decimal("4000.00"),
    )
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 2))

    assert result["total_assets"] == 100000.0
    assert result["sections"]["assets"]["items"] == [
        {
            "label": "Cash and Cash Equivalents",
            "value": 96000.0,
            "account_id": None,
            "account_code": "1000,11000",
            "normal_balance": "DEBIT",
            "total_debits": 100000.0,
            "total_credits": 4000.0,
        },
        {
            "label": "Inventory",
            "value": 4000.0,
            "account_id": inventory.id,
            "account_code": "13000",
            "normal_balance": "DEBIT",
            "total_debits": 4000.0,
            "total_credits": 0.0,
        },
    ]

