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

