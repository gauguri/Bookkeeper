from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analytics.kpis import calc_balance_sheet
from app.db import Base
from app.models import Account, GLEntry


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_balance_sheet_reconciliation_difference_is_reported():
    db = create_session()

    cash = Account(company_id=1, code="10100", name="Cash", type="ASSET", normal_balance="debit", is_active=True)
    equity = Account(company_id=1, code="31000", name="Owner Equity", type="EQUITY", normal_balance="credit", is_active=True)
    db.add_all([cash, equity])
    db.flush()

    db.add_all(
        [
            GLEntry(journal_batch_id=1, account_id=cash.id, debit_amount=Decimal("500.00"), credit_amount=Decimal("0.00"), reference_type="seed", reference_id=1, event_type="SEED", event_id="1", posting_date=date(2025, 1, 1)),
            GLEntry(journal_batch_id=1, account_id=equity.id, debit_amount=Decimal("0.00"), credit_amount=Decimal("500.00"), reference_type="seed", reference_id=1, event_type="SEED", event_id="1", posting_date=date(2025, 1, 1)),
        ]
    )
    db.commit()

    result = calc_balance_sheet(db, date(2025, 1, 1))

    assert result["total_assets"] == 500.0
    assert result["total_equity"] == 500.0
    assert result["inventory_value"] == 0.0
    assert result["reconciliation_difference"] == 0.0
