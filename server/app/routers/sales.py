from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Customer, Invoice, Item, Payment
from app.sales import schemas
from app.sales.service import (
    apply_payment,
    create_invoice,
    get_invoice_payments,
    list_customers,
    list_invoices,
    list_items,
    recalculate_invoice_balance,
    sales_summary,
    update_invoice,
    update_invoice_status,
    customer_revenue,
    ar_aging,
)

router = APIRouter(prefix="/api", tags=["sales"])


@router.get("/customers", response_model=List[schemas.CustomerResponse])
def get_customers(search: Optional[str] = None, db: Session = Depends(get_db)):
    return list_customers(db, search)


@router.post("/customers", response_model=schemas.CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.put("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def archive_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    customer.is_active = False
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/items", response_model=List[schemas.ItemResponse])
def get_items(search: Optional[str] = None, db: Session = Depends(get_db)):
    return list_items(db, search)


@router.post("/items", response_model=schemas.ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
    item = Item(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}", response_model=schemas.ItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


@router.put("/items/{item_id}", response_model=schemas.ItemResponse)
def update_item(item_id: int, payload: schemas.ItemUpdate, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", response_model=schemas.ItemResponse)
def archive_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    item.is_active = False
    db.commit()
    db.refresh(item)
    return item


@router.get("/invoices", response_model=List[schemas.InvoiceListResponse])
def get_invoices(
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    min_total: Optional[Decimal] = Query(None, ge=0),
    max_total: Optional[Decimal] = Query(None, ge=0),
    db: Session = Depends(get_db),
):
    invoices = list_invoices(db, status, customer_id, start_date, end_date, min_total, max_total)
    return [
        schemas.InvoiceListResponse(
            id=invoice.id,
            invoice_number=invoice.invoice_number,
            customer_id=invoice.customer_id,
            customer_name=invoice.customer.name,
            status=invoice.status,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            total=invoice.total,
            amount_due=invoice.amount_due,
        )
        for invoice in invoices
    ]


@router.post("/invoices", response_model=schemas.InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice_endpoint(payload: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    try:
        invoice = create_invoice(db, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/invoices/{invoice_id}", response_model=schemas.InvoiceDetailResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    recalculate_invoice_balance(db, invoice)
    update_invoice_status(invoice)
    db.commit()
    db.refresh(invoice)
    return schemas.InvoiceDetailResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        customer_id=invoice.customer_id,
        status=invoice.status,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        notes=invoice.notes,
        terms=invoice.terms,
        subtotal=invoice.subtotal,
        tax_total=invoice.tax_total,
        total=invoice.total,
        amount_due=invoice.amount_due,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        customer=invoice.customer,
        line_items=invoice.lines,
        payments=get_invoice_payments(db, invoice.id),
    )


@router.put("/invoices/{invoice_id}", response_model=schemas.InvoiceResponse)
def update_invoice_endpoint(invoice_id: int, payload: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    try:
        invoice = update_invoice(db, invoice, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/invoices/{invoice_id}/send", response_model=schemas.InvoiceResponse)
def send_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if invoice.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft invoices can be sent.")
    invoice.status = "SENT"
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/invoices/{invoice_id}/void", response_model=schemas.InvoiceResponse)
def void_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if invoice.status in {"PAID", "PARTIALLY_PAID"}:
        raise HTTPException(status_code=400, detail="Paid invoices cannot be voided.")
    invoice.status = "VOID"
    invoice.amount_due = Decimal("0.00")
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/payments", response_model=List[schemas.PaymentResponse])
def get_payments(db: Session = Depends(get_db)):
    payments = db.query(Payment).order_by(Payment.payment_date.desc(), Payment.id.desc()).all()
    return payments


@router.post("/payments", response_model=schemas.PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(payload: schemas.PaymentCreate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    try:
        payment = apply_payment(db, payload.model_dump(exclude={"applications"}), payload.applications)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/reports/sales-summary", response_model=List[schemas.SalesSummaryResponse])
def get_sales_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return sales_summary(db, start_date, end_date)


@router.get("/reports/ar-aging", response_model=List[schemas.ARAgingBucket])
def get_ar_aging(as_of: date = Query(...), db: Session = Depends(get_db)):
    return ar_aging(db, as_of)


@router.get("/reports/customer-revenue", response_model=List[schemas.CustomerRevenueResponse])
def get_customer_revenue(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return customer_revenue(db, start_date, end_date)
