from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.banking.service import get_dashboard_metrics
from app.db import Base
from app.models import BankAccount



def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()



def test_banking_dashboard_returns_zero_state_without_bank_accounts():
    db = create_session()

    metrics = get_dashboard_metrics(db)

    assert metrics["kpis"]["cash_balance"] == Decimal("0.00")
    assert metrics["kpis"]["unreconciled_transactions"] == 0
    assert metrics["cash_trend"] == []
    assert metrics["reconciliation_progress"] == []
    assert db.query(BankAccount).count() == 0



def test_banking_dashboard_removes_legacy_placeholder_account_without_activity():
    db = create_session()
    db.add(
        BankAccount(
            name="Operating Account",
            institution="Bedrock Bank",
            account_type="checking",
            last4="1209",
            currency="USD",
            opening_balance=Decimal("250000.00"),
            current_balance=Decimal("287450.12"),
            status="active",
        )
    )
    db.commit()

    metrics = get_dashboard_metrics(db)

    assert metrics["kpis"]["cash_balance"] == Decimal("0.00")
    assert metrics["cash_trend"] == []
    assert db.query(BankAccount).count() == 0



def test_banking_dashboard_uses_real_bank_account_balances():
    db = create_session()
    db.add_all(
        [
            BankAccount(
                name="Operating",
                institution="First Bank",
                account_type="checking",
                last4="1209",
                currency="USD",
                opening_balance=Decimal("250000.00"),
                current_balance=Decimal("287450.12"),
                status="active",
            ),
            BankAccount(
                name="Payroll",
                institution="First Bank",
                account_type="checking",
                last4="4401",
                currency="USD",
                opening_balance=Decimal("10000.00"),
                current_balance=None,
                status="active",
            ),
        ]
    )
    db.commit()

    metrics = get_dashboard_metrics(db)

    assert metrics["kpis"]["cash_balance"] == Decimal("297450.12")
    assert len(metrics["cash_trend"]) == 12
    assert len(metrics["reconciliation_progress"]) == 2
