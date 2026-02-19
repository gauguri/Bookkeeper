from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.dashboard.service import get_owner_cockpit_metrics, get_revenue_dashboard_metrics
from app.db import Base
from app.models import Customer, Inventory, InventoryReservation, Invoice, InvoiceLine, Item, SalesRequest, SalesRequestLine


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def create_customer(db, name="Dashboard Customer"):
    customer = Customer(name=name)
    db.add(customer)
    db.flush()
    return customer


def create_item(db, name: str, unit_price: Decimal = Decimal("100.00")):
    item = Item(name=name, unit_price=unit_price, on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add(item)
    db.flush()
    return item


def create_invoice(
    db,
    customer_id: int,
    status: str,
    issue_date: date,
    total: Decimal,
    amount_due: Decimal,
    due_date: date | None = None,
):
    invoice = Invoice(
        customer_id=customer_id,
        invoice_number=f"INV-{customer_id}-{status}-{issue_date}-{total}",
        status=status,
        issue_date=issue_date,
        due_date=due_date or issue_date,
        subtotal=total,
        tax_total=Decimal("0.00"),
        total=total,
        amount_due=amount_due,
    )
    db.add(invoice)
    db.flush()
    return invoice


def test_revenue_dashboard_cash_basis_metrics():
    db = create_session()
    customer = create_customer(db)
    as_of = date(2024, 7, 15)

    create_invoice(db, customer.id, "SENT", date(2024, 2, 1), Decimal("100.00"), Decimal("100.00"))
    create_invoice(db, customer.id, "PAID", date(2024, 3, 1), Decimal("200.00"), Decimal("0.00"))
    create_invoice(db, customer.id, "DRAFT", date(2024, 4, 1), Decimal("300.00"), Decimal("300.00"))
    create_invoice(db, customer.id, "VOID", date(2024, 5, 1), Decimal("400.00"), Decimal("0.00"))
    create_invoice(
        db, customer.id, "PARTIALLY_PAID", date(2024, 6, 1), Decimal("150.00"), Decimal("50.00")
    )
    create_invoice(db, customer.id, "SENT", date(2024, 6, 15), Decimal("20.00"), Decimal("-5.00"))

    from app.models import Payment

    db.add_all(
        [
            Payment(customer_id=customer.id, amount=Decimal("50.00"), payment_date=date(2024, 5, 15)),
            Payment(customer_id=customer.id, amount=Decimal("70.00"), payment_date=date(2024, 6, 10)),
            Payment(customer_id=customer.id, amount=Decimal("500.00"), payment_date=date(2024, 7, 5)),
        ]
    )

    db.commit()

    metrics = get_revenue_dashboard_metrics(db, months=3, basis="cash", as_of=as_of)

    assert metrics["total_revenue_ytd"] == Decimal("320.00")
    assert metrics["outstanding_ar"] == Decimal("150.00")
    assert metrics["paid_this_month"] == Decimal("500.00")
    assert metrics["open_invoices_count"] == 3

    assert metrics["revenue_trend"] == [
        {"month": "2024-05", "value": Decimal("50.00")},
        {"month": "2024-06", "value": Decimal("70.00")},
        {"month": "2024-07", "value": Decimal("500.00")},
    ]


def test_revenue_dashboard_accrual_basis_trend():
    db = create_session()
    customer = create_customer(db, name="Accrual Customer")
    as_of = date(2024, 4, 20)

    create_invoice(db, customer.id, "PAID", date(2024, 2, 5), Decimal("120.00"), Decimal("0.00"))
    create_invoice(db, customer.id, "PAID", date(2024, 3, 12), Decimal("80.00"), Decimal("0.00"))
    create_invoice(db, customer.id, "SENT", date(2024, 4, 2), Decimal("90.00"), Decimal("90.00"))

    db.commit()

    metrics = get_revenue_dashboard_metrics(db, months=3, basis="accrual", as_of=as_of)

    assert metrics["revenue_trend"] == [
        {"month": "2024-02", "value": Decimal("120.00")},
        {"month": "2024-03", "value": Decimal("80.00")},
        {"month": "2024-04", "value": Decimal("0.00")},
    ]


def test_owner_cockpit_metrics_use_real_modules():
    db = create_session()
    as_of = date.today()
    customer = create_customer(db)
    item = create_item(db, "Widget")

    db.add(Inventory(item_id=item.id, quantity_on_hand=Decimal("12"), landed_unit_cost=Decimal("5"), total_value=Decimal("60")))

    sent_invoice = create_invoice(
        db,
        customer.id,
        "SENT",
        as_of.replace(day=1),
        Decimal("100.00"),
        Decimal("100.00"),
        due_date=as_of - timedelta(days=100),
    )
    create_invoice(db, customer.id, "PAID", date(as_of.year, 1, 15), Decimal("300.00"), Decimal("0.00"), due_date=date(as_of.year, 2, 15))
    create_invoice(
        db,
        customer.id,
        "SENT",
        as_of.replace(day=1),
        Decimal("40.00"),
        Decimal("40.00"),
        due_date=as_of + timedelta(days=10),
    )

    db.add_all(
        [
            InvoiceLine(invoice_id=sent_invoice.id, item_id=item.id, quantity=Decimal("10"), unit_price=Decimal("10"), landed_unit_cost=Decimal("4"), line_total=Decimal("100"), discount=Decimal("0"), tax_rate=Decimal("0")),
        ]
    )

    sales_request = SalesRequest(request_number="SR-1", customer_id=customer.id, status="NEW")
    db.add(sales_request)
    db.flush()
    db.add(SalesRequestLine(sales_request_id=sales_request.id, item_id=item.id, item_name=item.name, quantity=Decimal("5"), unit_price=Decimal("10"), line_total=Decimal("50")))
    db.add(InventoryReservation(item_id=item.id, source_type="sales_request", source_id=sales_request.id, sales_request_id=sales_request.id, qty_reserved=Decimal("15")))

    db.commit()

    metrics = get_owner_cockpit_metrics(db, as_of=as_of)

    assert metrics["revenue_mtd"] == Decimal("140.00")
    assert metrics["revenue_ytd"] == Decimal("440.00")
    assert metrics["gross_margin_pct"] == Decimal("60.00")
    assert metrics["inventory_value"] == Decimal("60.00")
    assert metrics["ar_total"] == Decimal("140.00")
    assert metrics["ar_90_plus"] == Decimal("100.00")
    assert metrics["cash_forecast_30d"] == Decimal("40.00")
    assert metrics["backlog_value"] == Decimal("150.00")
    assert len(metrics["top_shortages"]) == 1
    assert metrics["top_shortages"][0]["item_name"] == "Widget"
    assert metrics["top_shortages"][0]["shortage_qty"] == Decimal("3.00")
