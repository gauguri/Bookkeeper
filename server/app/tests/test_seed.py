from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Account, Company
from app import seed


def _make_session_local():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)
    return TestingSessionLocal, engine


def test_seed_reconciles_legacy_named_accounts(monkeypatch):
    TestingSessionLocal, engine = _make_session_local()

    with TestingSessionLocal() as db:
        company = Company(name="Demo", base_currency="USD", fiscal_year_start_month=1)
        db.add(company)
        db.flush()
        # Simulate legacy flat records that predate code-based COA seeding.
        db.add_all(
            [
                Account(company_id=company.id, name="Current Assets", code="old", type="OTHER", normal_balance="credit"),
                Account(company_id=company.id, name="Inventory", code=None, type="OTHER", normal_balance="credit"),
            ]
        )
        db.commit()

    with TestingSessionLocal() as db:
        seed._seed_chart_of_accounts(db, 1)
        db.commit()

        current_assets = db.query(Account).filter(Account.name == "Current Assets").one()
        inventory = db.query(Account).filter(Account.name == "Inventory").one()

        assert current_assets.type == "ASSET"
        assert current_assets.code is None
        assert inventory.code == "13100"
        assert inventory.parent_id == current_assets.id

    Base.metadata.drop_all(engine)


def test_seed_continues_chart_of_accounts_when_auth_fails(monkeypatch):
    TestingSessionLocal, engine = _make_session_local()

    monkeypatch.setattr(seed, "SessionLocal", TestingSessionLocal)

    def boom(*args, **kwargs):
        raise RuntimeError("auth unavailable")

    monkeypatch.setattr(seed, "_get_or_create_user", boom)

    seed.run_seed()

    with TestingSessionLocal() as db:
        count = db.query(Account).count()
        assert count > 0

    Base.metadata.drop_all(engine)
