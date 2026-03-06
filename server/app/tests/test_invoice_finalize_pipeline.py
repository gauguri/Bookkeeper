from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.accounting.gl_engine import GLPostingError
from app.db import Base, get_db
from app.main import app
from app.models import Account, Customer, GLEntry, Invoice, InvoiceLine, Item, JournalBatch, JournalBatchLine


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestingSessionLocal() as db:
        customer = Customer(name="Finalize Co", email="ar@finalize.test")
        item = Item(name="Consulting", unit_price=Decimal("125.00"), on_hand_qty=Decimal("0.00"), reserved_qty=Decimal("0.00"))
        db.add_all([customer, item])
        db.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _create_invoice(client: TestClient) -> dict:
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        invoice = Invoice(
            customer_id=1,
            invoice_number=f"INV-TEST-{int(date.today().strftime('%Y%m%d'))}-{db.query(func.count(Invoice.id)).scalar() + 1}",
            status="DRAFT",
            issue_date=date.today(),
            due_date=date.today(),
            notes="Finalize pipeline test",
            terms="Due on receipt",
            subtotal=Decimal("250.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("250.00"),
            amount_due=Decimal("250.00"),
        )
        db.add(invoice)
        db.flush()
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                item_id=1,
                description="Consulting",
                quantity=Decimal("2.00"),
                unit_price=Decimal("125.00"),
                discount=Decimal("0.00"),
                tax_rate=Decimal("0.00"),
                line_total=Decimal("250.00"),
            )
        )
        db.commit()
        db.refresh(invoice)
        return {"id": invoice.id, "invoice_number": invoice.invoice_number}
    finally:
        db_gen.close()


def test_finalize_invoice_posts_to_gl_and_updates_profit_loss(client: TestClient):
    created = _create_invoice(client)

    finalize = client.post(f"/api/invoices/{created['id']}/send")
    assert finalize.status_code == 200
    finalized = finalize.json()
    assert finalized["status"] == "SENT"
    assert finalized["posted_to_gl"] is True
    assert finalized["gl_journal_entry_id"] is not None

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        invoice = db.query(Invoice).filter(Invoice.id == created["id"]).first()
        assert invoice is not None
        assert invoice.posted_to_gl is True
        assert invoice.gl_journal_entry_id is not None

        journal = db.query(JournalBatch).filter(JournalBatch.id == invoice.gl_journal_entry_id).first()
        assert journal is not None

        lines = db.query(JournalBatchLine).filter(JournalBatchLine.batch_id == journal.id).all()
        assert len(lines) >= 2
        debit_total = sum(Decimal(line.debit_amount or 0) for line in lines)
        credit_total = sum(Decimal(line.credit_amount or 0) for line in lines)
        assert debit_total == credit_total

        income_account_ids = {
            account.id for account in db.query(Account.id).filter(func.upper(Account.type).in_(("REVENUE", "INCOME"))).all()
        }
        income_credits = [line for line in lines if line.account_id in income_account_ids and Decimal(line.credit_amount or 0) > 0]
        assert income_credits
    finally:
        db_gen.close()

    pnl = client.get(
        "/api/analytics/pnl",
        params={"start_date": date.today().isoformat(), "end_date": date.today().isoformat()},
    )
    assert pnl.status_code == 200
    pnl_payload = pnl.json()
    assert pnl_payload["revenue"] > 0
    assert pnl_payload["reconciliation"]["show_banner"] is False


def test_missing_account_mapping_throws_explicit_error(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    created = _create_invoice(client)

    from app.accounting import gl_engine

    original_resolve_account = gl_engine._resolve_account

    def fail_on_revenue_mapping(db, company_id, *, codes, names, preferred_types=None):
        if "revenue" in [name.lower() for name in names]:
            raise GLPostingError(
                f"Cannot post invoice {created['invoice_number']} to GL: missing revenue account mapping for line item 1"
            )
        return original_resolve_account(db, company_id, codes=codes, names=names, preferred_types=preferred_types)

    monkeypatch.setattr("app.accounting.gl_engine._resolve_account", fail_on_revenue_mapping)

    finalize = client.post(f"/api/invoices/{created['id']}/send")
    assert finalize.status_code == 400
    assert "Cannot post invoice" in finalize.json()["detail"]
    assert "missing revenue account mapping" in finalize.json()["detail"]


def test_finalize_invoice_does_not_double_post(client: TestClient):
    created = _create_invoice(client)

    first = client.post(f"/api/invoices/{created['id']}/send")
    assert first.status_code == 200
    first_payload = first.json()

    second = client.post(f"/api/invoices/{created['id']}/send")
    assert second.status_code == 200
    second_payload = second.json()

    assert first_payload["gl_journal_entry_id"] == second_payload["gl_journal_entry_id"]

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        entries = db.query(GLEntry).filter(GLEntry.invoice_id == created["id"]).all()
        assert len(entries) == 2
    finally:
        db_gen.close()
