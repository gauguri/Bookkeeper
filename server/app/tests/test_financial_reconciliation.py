from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.accounting.gl_engine import postJournalEntries
from app.analytics.kpis import calc_balance_sheet, calc_pnl
from app.db import Base
from app.models import Customer, Invoice, InvoiceLine, Item


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def seed_invoice(db, total: Decimal, cost: Decimal):
    customer = Customer(name="Recon Co")
    item = Item(name="Widget", unit_price=total, on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()
    invoice = Invoice(
        customer_id=customer.id,
        invoice_number=f"INV-{total}",
        status="SHIPPED",
        issue_date=date(2025, 1, 1),
        due_date=date(2025, 1, 31),
        subtotal=total,
        tax_total=Decimal("0.00"),
        total=total,
        amount_due=total,
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            item_id=item.id,
            quantity=Decimal("1.00"),
            unit_price=total,
            landed_unit_cost=cost,
            line_total=total,
            discount=Decimal("0.00"),
            tax_rate=Decimal("0.00"),
        )
    )
    db.commit()
    return invoice


def test_invoice_and_payment_reconcile_statements():
    db = create_session()
    invoice = seed_invoice(db, Decimal("500.00"), Decimal("0.00"))

    postJournalEntries("INVOICE_POSTED", {"event_id": "inv-1", "company_id": 1, "invoice_id": invoice.id, "reference_id": invoice.id, "posting_date": date(2025, 1, 2)}, db)
    postJournalEntries("PAYMENT_POSTED", {"event_id": "pay-1", "company_id": 1, "invoice_id": invoice.id, "payment_id": 1, "amount": Decimal("500.00"), "reference_id": 1, "posting_date": date(2025, 1, 3)}, db)

    pnl = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))
    bs = calc_balance_sheet(db, date(2025, 1, 31))

    assert pnl["revenue"] == 500.0
    assert pnl["net_income"] == 500.0
    assert bs["current_period_net_income"] == 500.0
    assert bs["reconciliation_difference"] == 0.0


def test_inventory_sale_net_income_flows_to_equity():
    db = create_session()
    invoice = seed_invoice(db, Decimal("1000.00"), Decimal("600.00"))

    postJournalEntries("SHIPMENT_POSTED", {"event_id": "ship-1", "company_id": 1, "invoice_id": invoice.id, "shipment_id": 1, "reference_id": 1, "posting_date": date(2025, 1, 2), "shipped_ratio": Decimal("1.00")}, db)

    pnl = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))
    bs = calc_balance_sheet(db, date(2025, 1, 31))

    assert pnl["revenue"] == 1000.0
    assert pnl["operating_expenses"] == 600.0
    assert pnl["net_income"] == 400.0
    assert bs["current_period_net_income"] == 400.0
