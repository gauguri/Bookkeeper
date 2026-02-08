from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Sequence

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import Customer, Invoice, InvoiceLine, Item, Payment, PaymentApplication
from app.sales.calculations import (
    InvoiceLineInput,
    PaymentApplicationInput,
    calculate_invoice_totals,
    calculate_line_totals,
    validate_payment_applications,
)


def get_next_invoice_number(db: Session) -> str:
    result = db.execute(text("SELECT nextval('invoice_number_seq')")).scalar_one()
    return f"INV-{int(result):06d}"


def recalculate_invoice_totals(invoice: Invoice) -> None:
    line_inputs = [
        InvoiceLineInput(
            quantity=Decimal(line.quantity),
            unit_price=Decimal(line.unit_price),
            discount=Decimal(line.discount),
            tax_rate=Decimal(line.tax_rate),
        )
        for line in invoice.lines
    ]
    totals = calculate_invoice_totals(line_inputs)
    invoice.subtotal = totals.subtotal
    invoice.tax_total = totals.tax_total
    invoice.total = totals.total


def recalculate_invoice_balance(db: Session, invoice: Invoice) -> None:
    applied_total = (
        db.query(func.coalesce(func.sum(PaymentApplication.applied_amount), 0))
        .filter(PaymentApplication.invoice_id == invoice.id)
        .scalar()
    )
    invoice.amount_due = invoice.total - Decimal(applied_total)


def update_invoice_status(invoice: Invoice) -> None:
    if invoice.status == "VOID":
        return
    if invoice.amount_due <= 0:
        invoice.status = "PAID"
    elif invoice.amount_due < invoice.total:
        invoice.status = "PARTIALLY_PAID"
    elif invoice.status == "SENT":
        invoice.status = "SENT"


def build_invoice_lines(
    db: Session, invoice: Invoice, lines_data: Iterable[dict]
) -> List[InvoiceLine]:
    lines: List[InvoiceLine] = []
    for line in lines_data:
        item: Optional[Item] = None
        description = line.get("description")
        unit_price = line.get("unit_price")
        if line.get("item_id"):
            item = db.query(Item).filter(Item.id == line["item_id"]).first()
            if not item:
                raise ValueError("Item not found.")
            if not description:
                description = item.name
            if unit_price is None:
                unit_price = item.unit_price
        if unit_price is None:
            raise ValueError("Unit price is required.")
        quantity = Decimal(line["quantity"])
        discount = Decimal(line.get("discount") or 0)
        tax_rate = Decimal(line.get("tax_rate") or 0)
        line_subtotal, tax_amount, line_total = calculate_line_totals(
            InvoiceLineInput(
                quantity=quantity,
                unit_price=Decimal(unit_price),
                discount=discount,
                tax_rate=tax_rate,
            )
        )
        lines.append(
            InvoiceLine(
                item=item,
                description=description,
                quantity=quantity,
                unit_price=unit_price,
                discount=discount,
                tax_rate=tax_rate,
                line_total=line_total,
            )
        )
    return lines


def list_customers(db: Session, search: Optional[str]) -> Sequence[Customer]:
    query = db.query(Customer)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(func.lower(Customer.name).like(like))
    return query.order_by(Customer.name).all()


def list_items(db: Session, search: Optional[str]) -> Sequence[Item]:
    query = db.query(Item)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(func.lower(Item.name).like(like))
    return query.order_by(Item.name).all()


def list_invoices(
    db: Session,
    status: Optional[str],
    customer_id: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
    min_total: Optional[Decimal],
    max_total: Optional[Decimal],
) -> Sequence[Invoice]:
    query = db.query(Invoice)
    if status:
        query = query.filter(Invoice.status == status)
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if start_date:
        query = query.filter(Invoice.issue_date >= start_date)
    if end_date:
        query = query.filter(Invoice.issue_date <= end_date)
    if min_total:
        query = query.filter(Invoice.total >= min_total)
    if max_total:
        query = query.filter(Invoice.total <= max_total)
    return query.order_by(Invoice.issue_date.desc(), Invoice.id.desc()).all()


def create_invoice(db: Session, payload: dict) -> Invoice:
    invoice = Invoice(
        customer_id=payload["customer_id"],
        invoice_number=get_next_invoice_number(db),
        status="DRAFT",
        issue_date=payload["issue_date"],
        due_date=payload["due_date"],
        notes=payload.get("notes"),
        terms=payload.get("terms"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    invoice.lines = build_invoice_lines(db, invoice, payload["line_items"])
    recalculate_invoice_totals(invoice)
    invoice.amount_due = invoice.total
    db.add(invoice)
    db.flush()
    return invoice


def update_invoice(db: Session, invoice: Invoice, payload: dict) -> Invoice:
    if invoice.status != "DRAFT":
        raise ValueError("Only draft invoices can be edited.")
    for field in ["issue_date", "due_date", "notes", "terms"]:
        if field in payload and payload[field] is not None:
            setattr(invoice, field, payload[field])
    if payload.get("line_items") is not None:
        invoice.lines = build_invoice_lines(db, invoice, payload["line_items"])
    invoice.updated_at = datetime.utcnow()
    recalculate_invoice_totals(invoice)
    invoice.amount_due = invoice.total
    return invoice


def apply_payment(
    db: Session,
    payment_data: dict,
    applications_data: List[dict],
) -> Payment:
    invoices = db.query(Invoice).filter(Invoice.id.in_([app["invoice_id"] for app in applications_data])).all()
    invoice_map = {invoice.id: invoice for invoice in invoices}
    for invoice in invoices:
        if invoice.status == "VOID":
            raise ValueError("Payments can only be applied to sent invoices.")
        if invoice.status == "DRAFT":
            invoice.status = "SENT"
            invoice.updated_at = datetime.utcnow()
    applications_inputs: List[PaymentApplicationInput] = []
    for application in applications_data:
        invoice = invoice_map.get(application["invoice_id"])
        if not invoice:
            raise ValueError("Invoice not found.")
        recalculate_invoice_balance(db, invoice)
        applications_inputs.append(
            PaymentApplicationInput(
                invoice_id=invoice.id,
                invoice_balance=Decimal(invoice.amount_due),
                applied_amount=Decimal(application["applied_amount"]),
            )
        )
    validate_payment_applications(Decimal(payment_data["amount"]), applications_inputs)

    payment = Payment(
        customer_id=payment_data["customer_id"],
        amount=payment_data["amount"],
        payment_date=payment_data["payment_date"],
        method=payment_data.get("method"),
        reference=payment_data.get("reference"),
        memo=payment_data.get("memo"),
    )
    payment.applications = [
        PaymentApplication(
            invoice_id=application["invoice_id"], applied_amount=application["applied_amount"]
        )
        for application in applications_data
    ]
    db.add(payment)
    db.flush()

    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        update_invoice_status(invoice)
        invoice.updated_at = datetime.utcnow()
    return payment


def get_invoice_payments(db: Session, invoice_id: int) -> List[dict]:
    rows = (
        db.query(
            PaymentApplication.applied_amount,
            Payment.id,
            Payment.payment_date,
            Payment.amount,
            Payment.method,
            Payment.reference,
        )
        .join(Payment, Payment.id == PaymentApplication.payment_id)
        .filter(PaymentApplication.invoice_id == invoice_id)
        .order_by(Payment.payment_date.desc())
        .all()
    )
    return [
        {
            "payment_id": row.id,
            "payment_date": row.payment_date,
            "amount": row.amount,
            "applied_amount": row.applied_amount,
            "method": row.method,
            "reference": row.reference,
        }
        for row in rows
    ]


def sales_summary(db: Session, start_date: date, end_date: date) -> List[dict]:
    rows = (
        db.query(Invoice.status, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0))
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .group_by(Invoice.status)
        .all()
    )
    return [
        {"status": status, "invoice_count": count, "total_amount": total} for status, count, total in rows
    ]


def ar_aging(db: Session, as_of: date) -> List[dict]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.status != "VOID")
        .filter(Invoice.due_date <= as_of)
        .all()
    )
    buckets = {"0-30": Decimal("0.00"), "31-60": Decimal("0.00"), "61-90": Decimal("0.00"), "90+": Decimal("0.00")}
    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        if invoice.amount_due <= 0:
            continue
        days_past_due = (as_of - invoice.due_date).days
        if days_past_due <= 30:
            buckets["0-30"] += invoice.amount_due
        elif days_past_due <= 60:
            buckets["31-60"] += invoice.amount_due
        elif days_past_due <= 90:
            buckets["61-90"] += invoice.amount_due
        else:
            buckets["90+"] += invoice.amount_due
    return [{"bucket": bucket, "amount": amount} for bucket, amount in buckets.items()]


def customer_revenue(db: Session, start_date: date, end_date: date) -> List[dict]:
    rows = (
        db.query(Customer.id, Customer.name, func.coalesce(func.sum(Invoice.total), 0))
        .join(Invoice, Invoice.customer_id == Customer.id)
        .filter(Invoice.issue_date >= start_date, Invoice.issue_date <= end_date)
        .filter(Invoice.status != "VOID")
        .group_by(Customer.id, Customer.name)
        .order_by(Customer.name)
        .all()
    )
    return [
        {"customer_id": customer_id, "customer_name": name, "total_revenue": total}
        for customer_id, name, total in rows
    ]
