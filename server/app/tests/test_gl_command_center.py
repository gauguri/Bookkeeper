from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import CompanyCode, FiscalYearVariant, GLAccount, GLBalance, GLLedger
from app.routers.gl import command_center_summary


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_command_center_summary_cash_balance_includes_cash_equivalents():
    db = create_session()
    now = datetime.utcnow()

    variant = FiscalYearVariant(name="Calendar Year", periods_per_year=12, special_periods=0)
    db.add(variant)
    db.flush()

    company_code = CompanyCode(code="1000", name="Demo Company", base_currency="USD")
    db.add(company_code)
    db.flush()

    ledger = GLLedger(
        company_code_id=company_code.id,
        name="Leading Ledger",
        currency="USD",
        fiscal_year_variant_id=variant.id,
        is_leading=True,
    )
    db.add(ledger)
    db.flush()

    cash = GLAccount(
        company_code_id=company_code.id,
        account_number="1000",
        name="Cash",
        account_type="ASSET",
        normal_balance="DEBIT",
        is_active=True,
    )
    cash_equiv = GLAccount(
        company_code_id=company_code.id,
        account_number="11000",
        name="Cash and Cash Equivalents",
        account_type="ASSET",
        normal_balance="DEBIT",
        is_active=True,
    )
    inventory = GLAccount(
        company_code_id=company_code.id,
        account_number="13000",
        name="Inventory",
        account_type="ASSET",
        normal_balance="DEBIT",
        is_active=True,
    )
    db.add_all([cash, cash_equiv, inventory])
    db.flush()

    db.add_all(
        [
            GLBalance(
                ledger_id=ledger.id,
                fiscal_year=now.year,
                period_number=now.month,
                gl_account_id=cash.id,
                opening_balance=Decimal("0.00"),
                period_debits=Decimal("100000.00"),
                period_credits=Decimal("0.00"),
                closing_balance=Decimal("100000.00"),
            ),
            GLBalance(
                ledger_id=ledger.id,
                fiscal_year=now.year,
                period_number=now.month,
                gl_account_id=cash_equiv.id,
                opening_balance=Decimal("0.00"),
                period_debits=Decimal("0.00"),
                period_credits=Decimal("4000.00"),
                closing_balance=Decimal("-4000.00"),
            ),
            GLBalance(
                ledger_id=ledger.id,
                fiscal_year=now.year,
                period_number=now.month,
                gl_account_id=inventory.id,
                opening_balance=Decimal("0.00"),
                period_debits=Decimal("4000.00"),
                period_credits=Decimal("0.00"),
                closing_balance=Decimal("4000.00"),
            ),
        ]
    )
    db.commit()

    summary = command_center_summary(db=db)

    assert summary["cash_balance"] == 96000.0
