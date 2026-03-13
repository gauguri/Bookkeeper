from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.accounting.gl_engine import postJournalEntries
from app.accounting.service import create_journal_entry
from app.analytics.kpis import calc_ar_total, calc_balance_sheet, calc_pnl, calc_revenue_reconciliation
from app.db import Base
from app.models import Account, Company, Customer, Invoice, InvoiceLine, Item


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
    assert pnl["revenue_gl"] == 500.0
    assert pnl["revenue_operational"] == 500.0
    assert pnl["reconciliation"]["within_threshold"] is True
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
    assert pnl["cogs"] == 600.0
    assert pnl["gross_profit"] == 400.0
    assert pnl["operating_expenses"] == 0.0
    assert pnl["net_income"] == 400.0
    assert bs["current_period_net_income"] == 400.0


def test_revenue_reconciliation_flags_operational_gl_mismatch():
    db = create_session()
    seed_invoice(db, Decimal("300.00"), Decimal("0.00"))

    reconciliation = calc_revenue_reconciliation(db, date(2025, 1, 1), date(2025, 1, 31))

    assert reconciliation["gl_revenue"] == 0.0
    assert reconciliation["operational_revenue"] == 300.0
    assert reconciliation["difference"] == -300.0
    assert reconciliation["within_threshold"] is False


def test_pnl_reconciliation_banner_disappears_after_invoice_posting():
    db = create_session()
    invoice = seed_invoice(db, Decimal("300.00"), Decimal("0.00"))

    pre = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))
    assert pre["reconciliation"]["show_banner"] is True

    postJournalEntries("INVOICE_POSTED", {"event_id": "inv-recon-1", "company_id": 1, "invoice_id": invoice.id, "reference_id": invoice.id, "posting_date": date(2025, 1, 1)}, db)
    post = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))

    assert post["revenue"] == 300.0
    assert post["revenue_operational"] == 300.0
    assert post["reconciliation"]["within_threshold"] is True
    assert post["reconciliation"]["show_banner"] is False


def test_draft_invoice_does_not_impact_gl_or_pnl_revenue():
    db = create_session()
    customer = Customer(name="Draft Co")
    item = Item(name="Draft Widget", unit_price=Decimal("100.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([customer, item])
    db.flush()
    draft = Invoice(
        customer_id=customer.id,
        invoice_number="INV-DRAFT-1",
        status="DRAFT",
        issue_date=date(2025, 1, 10),
        due_date=date(2025, 1, 30),
        subtotal=Decimal("100.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_due=Decimal("100.00"),
    )
    db.add(draft)
    db.commit()

    pnl = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))
    assert pnl["revenue"] == 0.0
    assert pnl["revenue_operational"] == 0.0


def test_pnl_no_invoices_returns_zeroed_debug_metrics():
    db = create_session()

    pnl = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))

    assert pnl["revenue"] == 0.0
    assert pnl["revenue_operational"] == 0.0
    assert pnl["reconciliation"]["show_banner"] is False
    assert pnl["debug"]["invoices_finalized"] == 0
    assert pnl["debug"]["invoices_posted_to_gl"] == 0



def test_posted_ar_matches_balance_sheet_assets():
    db = create_session()
    invoice = seed_invoice(db, Decimal("2250.00"), Decimal("0.00"))

    postJournalEntries("INVOICE_POSTED", {"event_id": "inv-ar-1", "company_id": 1, "invoice_id": invoice.id, "reference_id": invoice.id, "posting_date": date(2025, 1, 2)}, db)
    db.commit()

    ar_total = calc_ar_total(db, date(2025, 1, 31))
    bs = calc_balance_sheet(db, date(2025, 1, 31))

    assert ar_total["current_value"] == 2250.0
    assert bs["total_assets"] == 2250.0
    assert bs["net_assets"] == 2250.0
def test_pnl_includes_spend_entries_from_expenses_workbench_sources():
    db = create_session()
    company = Company(name="Recon Spend Co", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()

    cash = Account(company_id=company.id, code="1000", name="Cash", type="ASSET", normal_balance="DEBIT", is_active=True)
    office_supplies = Account(company_id=company.id, code="6100", name="Office Supplies", type="EXPENSE", normal_balance="DEBIT", is_active=True)
    inventory_adjustments = Account(company_id=company.id, code="1312", name="Inventory Adjustments", type="ASSET", normal_balance="DEBIT", is_active=True)
    db.add_all([cash, office_supplies, inventory_adjustments])
    db.flush()

    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 10),
        memo="Office supplies",
        source_type="MANUAL",
        source_id=None,
        debit_account_id=office_supplies.id,
        credit_account_id=cash.id,
        amount=Decimal("125.00"),
    )
    create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date(2025, 1, 12),
        memo="PO landed cost",
        source_type="PURCHASE_ORDER",
        source_id=1,
        debit_account_id=inventory_adjustments.id,
        credit_account_id=cash.id,
        amount=Decimal("4200.00"),
    )
    db.commit()

    pnl = calc_pnl(db, date(2025, 1, 1), date(2025, 1, 31))

    assert pnl["operating_expenses"] == 125.0
    assert pnl["operating_income"] == -125.0
    assert pnl["net_income"] == -125.0



