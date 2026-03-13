from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.analytics.kpis import calc_pnl
from app.db import Base
from app.models import Customer, GLEntry, GLJournalHeader, Invoice, InvoiceLine, Item
from app.services.gl_posting_service import post_invoice_to_gl


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def seed_draft_invoice(db):
    customer = Customer(name="Posting Co")
    item = Item(name="Consulting", unit_price=Decimal("100.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()

    invoice = Invoice(
        customer_id=customer.id,
        invoice_number="INV-POST-1",
        status="DRAFT",
        issue_date=date(2025, 2, 1),
        due_date=date(2025, 2, 28),
        subtotal=Decimal("100.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_due=Decimal("100.00"),
    )
    db.add(invoice)
    db.flush()

    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("1.00"),
            unit_price=Decimal("100.00"),
            line_total=Decimal("100.00"),
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
        )
    )
    db.commit()
    return invoice.id


def test_invoice_posting_creates_legacy_and_modern_gl_entries():
    db = create_session()
    invoice_id = seed_draft_invoice(db)

    batch_id = post_invoice_to_gl(db, invoice_id)
    db.commit()

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    entries = db.query(GLEntry).filter(GLEntry.journal_batch_id == batch_id).all()
    gl_header = db.query(GLJournalHeader).filter(GLJournalHeader.reference == invoice.invoice_number).first()

    assert invoice.posted_to_gl is True
    assert invoice.gl_journal_entry_id == batch_id
    assert invoice.gl_posted_at is not None
    assert len(entries) == 2
    assert gl_header is not None
    assert gl_header.status == "POSTED"
    assert len(gl_header.lines) == 2

    debit_total = sum(Decimal(entry.debit_amount or 0) for entry in entries)
    credit_total = sum(Decimal(entry.credit_amount or 0) for entry in entries)
    assert debit_total == credit_total == Decimal("100.00")
    assert sum(Decimal(line.debit_amount or 0) for line in gl_header.lines) == Decimal("100.00")
    assert sum(Decimal(line.credit_amount or 0) for line in gl_header.lines) == Decimal("100.00")


def test_invoice_posting_is_idempotent():
    db = create_session()
    invoice_id = seed_draft_invoice(db)

    first_batch = post_invoice_to_gl(db, invoice_id)
    db.commit()
    second_batch = post_invoice_to_gl(db, invoice_id)
    db.commit()

    all_entries = db.query(GLEntry).filter(GLEntry.invoice_id == invoice_id).all()
    assert first_batch == second_batch
    assert len(all_entries) == 2


def test_profit_loss_matches_gl():
    db = create_session()
    invoice_id = seed_draft_invoice(db)

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    invoice.status = "SENT"
    post_invoice_to_gl(db, invoice_id)
    db.commit()

    pnl = calc_pnl(db, date(2025, 2, 1), date(2025, 2, 28))

    assert pnl["revenue"] == 100.0
    assert pnl["revenue_gl"] == 100.0
    assert pnl["reconciliation"]["within_threshold"] is True
    assert pnl["debug"]["invoices_finalized"] == 1
    assert pnl["debug"]["invoices_posted_to_gl"] == 1
    assert pnl["debug"]["gl_entries_count_for_revenue"] == 1
