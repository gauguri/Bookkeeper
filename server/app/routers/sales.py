from datetime import date, datetime
import logging
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session

from app.auth import require_module
from app.accounting.gl_engine import postJournalEntries
from app.services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl
from app.module_keys import ModuleKey
from app.db import get_db
from app.inventory.service import SOURCE_INVOICE, SOURCE_SALES_REQUEST, create_inventory_movement, get_source_reserved_qty_map, release_reservations
from app.models import Customer, Inventory, Invoice, Item, Payment, PaymentApplication
from app.sales.calculations import PaymentApplicationInput, validate_payment_applications
from app.sales_requests.service import (
    update_sales_request_status,
)
from app.sales import schemas
from app.sales.service import (
    create_invoice_payment,
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
    get_item_pricing_context,
    get_customer_insights,
    get_customer_360,
    get_customers_enriched,
    get_customers_summary,
    get_item_360,
    get_items_enriched,
    get_items_summary,
)

router = APIRouter(prefix="/api", tags=["sales"])
LOGGER = logging.getLogger(__name__)


def _date_range_bounds(range_key: str) -> tuple[date, date]:
    today = date.today()
    if range_key == "mtd":
        start = today.replace(day=1)
    elif range_key == "qtd":
        quarter_start_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_start_month, day=1)
    elif range_key == "12m":
        start = date(today.year - 1, today.month, 1)
    else:  # ytd
        start = date(today.year, 1, 1)
    return start, today


def _build_payment_workbench_item(payment: Payment) -> schemas.PaymentWorkbenchItem:
    applied_amount = sum((Decimal(application.applied_amount or 0) for application in payment.applications), Decimal("0.00"))
    total_amount = Decimal(payment.amount or 0)
    unapplied_amount = max(total_amount - applied_amount, Decimal("0.00"))

    has_invalid_application = any(application.invoice and application.invoice.status == "VOID" for application in payment.applications)
    if has_invalid_application:
        status = "Exception"
        exception_reason = "Applied to void invoice"
    elif unapplied_amount == 0:
        status = "Applied"
        exception_reason = None
    elif applied_amount > 0:
        status = "Partially applied"
        exception_reason = None
    else:
        status = "Unapplied"
        exception_reason = None

    return schemas.PaymentWorkbenchItem(
        id=payment.id,
        payment_number=f"PMT-{payment.id:06d}",
        invoice_id=payment.invoice_id,
        invoice_number=payment.invoice.invoice_number if payment.invoice else None,
        customer_id=payment.customer_id,
        customer_name=payment.customer.name if payment.customer else None,
        amount=total_amount,
        payment_date=payment.payment_date,
        method=payment.method,
        reference=payment.reference,
        notes=payment.notes,
        status=status,
        applied_amount=applied_amount,
        unapplied_amount=unapplied_amount,
        exception_reason=exception_reason,
        updated_at=payment.created_at,
    )


@router.get("/customers", response_model=List[schemas.CustomerResponse])
def get_customers(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.CUSTOMERS.value)),
):
    return list_customers(db, search)


@router.post("/customers", response_model=schemas.CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.CUSTOMERS.value))):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.CUSTOMERS.value))):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.put("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.CUSTOMERS.value))):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def archive_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.CUSTOMERS.value))):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    customer.is_active = False
    db.commit()
    db.refresh(customer)
    return customer




@router.get("/customers/{customer_id}/insights", response_model=schemas.CustomerInsightsResponse)
def get_customer_insights_endpoint(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.CUSTOMERS.value)),
):
    try:
        return get_customer_insights(db, customer_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/customers-summary", response_model=schemas.CustomersSummaryResponse)
def get_customers_summary_endpoint(
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.CUSTOMERS.value)),
):
    return get_customers_summary(db)


@router.get("/customers-enriched", response_model=List[schemas.CustomerListItem])
def get_customers_enriched_endpoint(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    is_active: Optional[bool] = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.CUSTOMERS.value)),
):
    return get_customers_enriched(
        db, search=search, tier=tier, is_active=is_active,
        sort_by=sort_by, sort_dir=sort_dir,
    )


@router.get("/customers/{customer_id}/360", response_model=schemas.Customer360Response)
def get_customer_360_endpoint(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.CUSTOMERS.value)),
):
    try:
        return get_customer_360(db, customer_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/items-summary", response_model=schemas.ItemsSummaryResponse)
def get_items_summary_endpoint(
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.ITEMS.value)),
):
    return get_items_summary(db)


@router.get("/items-enriched", response_model=List[schemas.ItemListEnriched])
def get_items_enriched_endpoint(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    stock_status: Optional[str] = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.ITEMS.value)),
):
    return get_items_enriched(
        db, search=search, is_active=is_active, stock_status=stock_status,
        sort_by=sort_by, sort_dir=sort_dir,
    )


@router.get("/items/{item_id}/360", response_model=schemas.Item360Response)
def get_item_360_endpoint(
    item_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.ITEMS.value)),
):
    try:
        return get_item_360(db, item_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/items", response_model=List[schemas.ItemResponse])
def get_items(search: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.ITEMS.value))):
    return list_items(db, search)


@router.post("/items", response_model=schemas.ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.ITEMS.value))):
    item = Item(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}", response_model=schemas.ItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.ITEMS.value))):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


@router.get("/items/{item_id}/pricing-context", response_model=schemas.ItemPricingContextResponse)
def get_item_pricing_context_endpoint(
    item_id: int,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.ITEMS.value)),
):
    try:
        return get_item_pricing_context(db, item_id=item_id, customer_id=customer_id)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail)


@router.put("/items/{item_id}", response_model=schemas.ItemResponse)
def update_item(item_id: int, payload: schemas.ItemUpdate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.ITEMS.value))):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", response_model=schemas.ItemResponse)
def archive_item(item_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.ITEMS.value))):
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
    _=Depends(require_module(ModuleKey.INVOICES.value)),
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
            sales_request_id=invoice.sales_request_id,
        )
        for invoice in invoices
    ]


@router.post("/invoices", response_model=schemas.InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice_endpoint(payload: schemas.InvoiceCreate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
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
def get_invoice(invoice_id: str, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
    invoice_query = db.query(Invoice)
    invoice = None
    if invoice_id.isdigit():
        invoice = invoice_query.filter(Invoice.id == int(invoice_id)).first()
    if not invoice:
        invoice = invoice_query.filter(Invoice.invoice_number == invoice_id).first()
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
        shipped_at=invoice.shipped_at,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        customer=invoice.customer,
        line_items=invoice.lines,
        payments=get_invoice_payments(db, invoice.id),
    )


@router.put("/invoices/{invoice_id}", response_model=schemas.InvoiceResponse)
def update_invoice_endpoint(invoice_id: int, payload: schemas.InvoiceUpdate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
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
def send_invoice(invoice_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    old_status = invoice.status
    request_path = f"/api/invoices/{invoice_id}/send"
    if old_status not in {"DRAFT", "SENT", "SHIPPED", "PARTIALLY_PAID", "PAID"}:
        raise HTTPException(status_code=400, detail="Only draft or active invoices can be finalized.")

    try:
        LOGGER.info(
            "invoice_finalize_api_entry",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="send_invoice",
            ),
        )
        LOGGER.info(
            "invoice_finalize_before_status_change",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="send_invoice",
            ),
        )
        if old_status == "DRAFT":
            invoice.status = "SENT"

        LOGGER.info(
            "invoice_finalize_after_status_change",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="send_invoice",
            ),
        )
        LOGGER.info(
            "invoice_finalize_before_gl_posting",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="send_invoice",
            ),
        )
        batch_id = post_invoice_to_gl(db, invoice.id, company_id=1)
        db.commit()
        db.refresh(invoice)
        LOGGER.info(
            "invoice_finalize_after_commit",
            extra={
                **_invoice_log_payload(
                    invoice,
                    prior_status=old_status,
                    new_status=invoice.status,
                    request_path=request_path,
                    function_name="send_invoice",
                ),
                "posted_to_gl": bool(invoice.posted_to_gl),
                "gl_journal_entry_id": batch_id,
            },
        )
    except InvoiceGLPostingError as exc:
        db.rollback()
        LOGGER.exception(
            "invoice_finalize_failed",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="send_invoice",
            ),
        )
        raise HTTPException(status_code=400, detail=f"Failed to post invoice to GL: {exc}")

    return invoice




@router.post("/invoices/{invoice_id}/ship", response_model=schemas.InvoiceResponse)
def ship_invoice(invoice_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if invoice.status in {"VOID", "PAID"}:
        raise HTTPException(status_code=400, detail="Only active invoices can be marked as shipped.")
    if invoice.status not in {"SENT", "PARTIALLY_PAID"}:
        raise HTTPException(status_code=400, detail="Only sent invoices can be marked as shipped.")

    if invoice.sales_request_id is not None:
        source_type = SOURCE_SALES_REQUEST
        source_id = invoice.sales_request_id
    else:
        source_type = SOURCE_INVOICE
        source_id = invoice.id

    reserved_by_item = get_source_reserved_qty_map(
        db,
        source_type=source_type,
        source_id=source_id,
    )

    for line in invoice.lines:
        if line.item_id is None:
            continue
        inventory = db.query(Inventory).filter(Inventory.item_id == line.item_id).with_for_update().first()
        if inventory is None:
            raise HTTPException(status_code=400, detail=f"No inventory record for item_id {line.item_id}.")

        qty_shipped = Decimal(line.quantity or 0)
        if Decimal(inventory.quantity_on_hand or 0) < qty_shipped:
            raise HTTPException(status_code=409, detail=f"Insufficient inventory for item_id {line.item_id}.")

        if reserved_by_item.get(line.item_id, Decimal("0")) < qty_shipped:
            raise HTTPException(status_code=409, detail=f"Insufficient reserved inventory for item_id {line.item_id}.")

        inventory.quantity_on_hand = Decimal(inventory.quantity_on_hand or 0) - qty_shipped
        inventory.total_value = Decimal(inventory.quantity_on_hand or 0) * Decimal(inventory.landed_unit_cost or 0)
        create_inventory_movement(
            db,
            item_id=line.item_id,
            qty_delta=-qty_shipped,
            reason="SHIPMENT",
            ref_type="invoice",
            ref_id=invoice.id,
        )

    release_reservations(db, source_type=source_type, source_id=source_id)

    old_status = invoice.status
    request_path = f"/api/invoices/{invoice_id}/ship"
    try:
        LOGGER.info(
            "invoice_ship_before_gl_posting",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="ship_invoice",
            ),
        )
        post_invoice_to_gl(db, invoice.id, company_id=1)
    except InvoiceGLPostingError as exc:
        db.rollback()
        LOGGER.exception(
            "invoice_ship_gl_posting_failed",
            extra=_invoice_log_payload(
                invoice,
                prior_status=old_status,
                new_status=invoice.status,
                request_path=request_path,
                function_name="ship_invoice",
            ),
        )
        raise HTTPException(status_code=400, detail=f"Failed to post invoice to GL before shipping: {exc}")

    postJournalEntries(
        "shipment_cogs",
        {
            "event_id": f"shipment:{invoice.id}",
            "company_id": 1,
            "invoice_id": invoice.id,
            "shipment_id": invoice.id,
            "reference_id": invoice.id,
            "posting_date": date.today(),
            "shipped_ratio": Decimal("1.00"),
        },
        db,
    )

    invoice.status = "SHIPPED"
    invoice.shipped_at = datetime.utcnow()

    if invoice.sales_request:
        update_sales_request_status(invoice.sales_request, "SHIPPED")

    db.commit()
    db.refresh(invoice)
    return invoice



@router.get("/invoices/{invoice_id}/gl-status", response_model=schemas.InvoiceGLPostingStatus)
def get_invoice_gl_status(invoice_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return schemas.InvoiceGLPostingStatus(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        posted_to_gl=bool(invoice.posted_to_gl),
        gl_journal_entry_id=invoice.gl_journal_entry_id,
        gl_posted_at=invoice.gl_posted_at,
        posted_journal_entry_id=invoice.posted_journal_entry_id,
        posted_at=invoice.posted_at,
        last_error=invoice.gl_posting_last_error,
    )


@router.post("/invoices/{invoice_id}/void", response_model=schemas.InvoiceResponse)
def void_invoice(invoice_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.INVOICES.value))):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if invoice.status in {"PAID", "PARTIALLY_PAID", "SHIPPED"}:
        raise HTTPException(status_code=400, detail="Paid or shipped invoices cannot be voided.")

    if invoice.sales_request_id is not None:
        release_reservations(db, source_type=SOURCE_SALES_REQUEST, source_id=invoice.sales_request_id)
    else:
        release_reservations(db, source_type=SOURCE_INVOICE, source_id=invoice.id)

    invoice.status = "VOID"
    invoice.amount_due = Decimal("0.00")
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/payments", response_model=List[schemas.PaymentResponse])
def get_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=1000),
    queue: str = Query("all"),
    search: Optional[str] = Query(None),
    date_range: str = Query("ytd"),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.PAYMENTS.value)),
):
    start_date, end_date = _date_range_bounds(date_range.lower())
    query = (
        db.query(Payment)
        .filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)
        .order_by(Payment.payment_date.desc(), Payment.id.desc())
    )
    if search:
        term = f"%{search.strip()}%"
        query = query.join(Customer, Payment.customer_id == Customer.id).filter(
            Customer.name.ilike(term)
            | Payment.method.ilike(term)
            | Payment.reference.ilike(term)
            | cast(Payment.id, String).ilike(term)
        )
    payments = query.offset((page - 1) * page_size).limit(page_size).all()
    workbench_items = [_build_payment_workbench_item(payment) for payment in payments]
    normalized_queue = queue.lower()
    if normalized_queue in {"needs-attention", "needs_attention"}:
        workbench_items = [item for item in workbench_items if item.status in {"Unapplied", "Partially applied", "Exception"}]
    elif normalized_queue == "unapplied":
        workbench_items = [item for item in workbench_items if item.status == "Unapplied"]
    elif normalized_queue == "exceptions":
        workbench_items = [item for item in workbench_items if item.status == "Exception"]
    elif normalized_queue == "applied":
        workbench_items = [item for item in workbench_items if item.status == "Applied"]
    elif normalized_queue in {"refunds", "reversals", "refunds-reversals"}:
        workbench_items = []

    selected_ids = {item.id for item in workbench_items}
    selected_payments = [payment for payment in payments if payment.id in selected_ids]
    return [
        schemas.PaymentResponse(
            id=payment.id,
            invoice_id=payment.invoice_id or (payment.applications[0].invoice_id if payment.applications else 0),
            customer_id=payment.customer_id,
            amount=payment.amount,
            payment_date=payment.payment_date,
            method=payment.method,
            notes=payment.notes,
            created_at=payment.created_at,
            invoice_number=payment.invoice.invoice_number if payment.invoice else None,
            applications=payment.applications,
        )
        for payment in selected_payments
    ]


@router.get("/payments/summary", response_model=schemas.PaymentSummaryAnalytics)
def get_payments_summary(
    range: str = Query("mtd"),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.PAYMENTS.value)),
):
    start_date, end_date = _date_range_bounds(range.lower())
    payments = (
        db.query(Payment)
        .filter(Payment.payment_date >= start_date, Payment.payment_date <= end_date)
        .order_by(Payment.payment_date.asc())
        .all()
    )
    workbench_items = [_build_payment_workbench_item(payment) for payment in payments]
    payments_received = sum((Decimal(item.amount) for item in workbench_items), Decimal("0.00"))
    unapplied_payments = sum((Decimal(item.unapplied_amount) for item in workbench_items), Decimal("0.00"))
    exceptions_count = sum(1 for item in workbench_items if item.status == "Exception")
    method_mix: dict[str, Decimal] = {}
    monthly_trend: dict[str, dict[str, Decimal]] = {}
    by_customer: dict[int, Decimal] = {}
    customer_names: dict[int, str] = {}
    for item in workbench_items:
        method = item.method or "Other"
        method_mix[method] = method_mix.get(method, Decimal("0.00")) + Decimal(item.amount)
        month_key = item.payment_date.strftime("%Y-%m")
        monthly_bucket = monthly_trend.setdefault(month_key, {"received": Decimal("0.00"), "applied": Decimal("0.00"), "unapplied": Decimal("0.00")})
        monthly_bucket["received"] += Decimal(item.amount)
        monthly_bucket["applied"] += Decimal(item.applied_amount)
        monthly_bucket["unapplied"] += Decimal(item.unapplied_amount)
        by_customer[item.customer_id] = by_customer.get(item.customer_id, Decimal("0.00")) + Decimal(item.amount)
        customer_names[item.customer_id] = item.customer_name or f"Customer #{item.customer_id}"

    return schemas.PaymentSummaryAnalytics(
        summary=schemas.PaymentSummaryResponse(
            payments_received=payments_received,
            unapplied_payments=unapplied_payments,
            exceptions_count=exceptions_count,
            avg_days_to_pay=None,
            refunds_reversals=Decimal("0.00"),
            cash_forecast_impact=payments_received - unapplied_payments,
        ),
        method_mix=[schemas.PaymentMethodMixPoint(method=method, amount=amount) for method, amount in method_mix.items()],
        monthly_trend=[
            schemas.PaymentTrendPoint(month=month, received=vals["received"], applied=vals["applied"], unapplied=vals["unapplied"])
            for month, vals in sorted(monthly_trend.items())
        ],
        top_customers=[
            schemas.TopCustomerPaymentPoint(customer_id=customer_id, customer_name=customer_names[customer_id], amount=amount)
            for customer_id, amount in sorted(by_customer.items(), key=lambda row: row[1], reverse=True)[:8]
        ],
    )


@router.get("/payments/{payment_id}", response_model=schemas.PaymentDetailResponse)
def get_payment_detail(payment_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.PAYMENTS.value))):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    base = _build_payment_workbench_item(payment)
    return schemas.PaymentDetailResponse(**base.model_dump(), allocations=payment.applications)


@router.post("/payments/{payment_id}/apply", response_model=schemas.PaymentDetailResponse)
def apply_payment_to_invoices(
    payment_id: int,
    payload: schemas.PaymentApplyRequest,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.PAYMENTS.value)),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    allocations = payload.allocations
    invoice_ids = [allocation.invoice_id for allocation in allocations]
    invoices = db.query(Invoice).filter(Invoice.id.in_(invoice_ids)).all()
    invoice_map = {invoice.id: invoice for invoice in invoices}
    if len(invoice_map) != len(set(invoice_ids)):
        raise HTTPException(status_code=404, detail="Invoice not found.")
    for invoice in invoices:
        if invoice.status == "VOID":
            raise HTTPException(status_code=400, detail="Payments cannot be applied to void invoices.")
        if invoice.customer_id != payment.customer_id:
            raise HTTPException(status_code=400, detail="Invoice does not belong to payment customer.")
        recalculate_invoice_balance(db, invoice)
    try:
        validate_payment_applications(
            Decimal(payment.amount or 0),
            [
                PaymentApplicationInput(
                    invoice_id=allocation.invoice_id,
                    invoice_balance=Decimal(invoice_map[allocation.invoice_id].amount_due or 0),
                    applied_amount=Decimal(allocation.applied_amount),
                )
                for allocation in allocations
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    payment.applications = [
        PaymentApplication(invoice_id=allocation.invoice_id, applied_amount=allocation.applied_amount) for allocation in allocations
    ]
    for invoice in invoices:
        recalculate_invoice_balance(db, invoice)
        update_invoice_status(invoice)
        invoice.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(payment)
    base = _build_payment_workbench_item(payment)
    return schemas.PaymentDetailResponse(**base.model_dump(), allocations=payment.applications)


@router.get("/customers/{customer_id}/open-invoices", response_model=List[schemas.InvoiceListResponse])
def get_customer_open_invoices(customer_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.PAYMENTS.value))):
    invoices = (
        db.query(Invoice)
        .join(Customer, Invoice.customer_id == Customer.id)
        .filter(Invoice.customer_id == customer_id, Invoice.status != "VOID", Invoice.amount_due > 0)
        .order_by(Invoice.due_date.asc(), Invoice.id.asc())
        .all()
    )
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
            sales_request_id=invoice.sales_request_id,
        )
        for invoice in invoices
    ]


@router.post("/payments", response_model=schemas.PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(payload: schemas.PaymentCreate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.PAYMENTS.value))):
    try:
        payment = create_invoice_payment(db, payload.model_dump())
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail)
    db.commit()
    db.refresh(payment)
    return schemas.PaymentResponse(
        id=payment.id,
        invoice_id=payment.invoice_id or payload.invoice_id,
        customer_id=payment.customer_id,
        amount=payment.amount,
        payment_date=payment.payment_date,
        method=payment.method,
        notes=payment.notes,
        created_at=payment.created_at,
        invoice_number=payment.invoice.invoice_number if payment.invoice else None,
        applications=payment.applications,
    )


@router.get("/reports/sales-summary", response_model=List[schemas.SalesSummaryResponse])
def get_sales_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    return sales_summary(db, start_date, end_date)


@router.get("/reports/ar-aging", response_model=List[schemas.ARAgingBucket])
def get_ar_aging(as_of: date = Query(...), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.REPORTS.value))):
    return ar_aging(db, as_of)


@router.get("/reports/customer-revenue", response_model=List[schemas.CustomerRevenueResponse])
def get_customer_revenue(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    return customer_revenue(db, start_date, end_date)
def _invoice_log_payload(invoice: Invoice, *, prior_status: str, new_status: str, request_path: str, function_name: str) -> dict:
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "prior_status": prior_status,
        "new_status": new_status,
        "subtotal": str(invoice.subtotal),
        "tax_amount": str(invoice.tax_total),
        "total_amount": str(invoice.total),
        "posted_to_gl": bool(invoice.posted_to_gl),
        "gl_journal_entry_id": invoice.gl_journal_entry_id,
        "request_path": request_path,
        "function_name": function_name,
    }

