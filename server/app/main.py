import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    analytics,
    ar,
    auth,
    backlog,
    banking,
    chart_of_accounts,
    control,
    customers_import,
    dashboard,
    gl,
    health,
    inventory,
    invoices_import,
    items_import,
    inv_management,
    journal_entries,
    pricing,
    purchase_orders,
    purchase_orders_import,
    sales,
    sales_management,
    sales_requests,
    suppliers,
)

_logger = logging.getLogger(__name__)

app = FastAPI(title="Bedrock API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(analytics.router)
app.include_router(ar.router)
app.include_router(auth.router)
app.include_router(backlog.router)
app.include_router(banking.router)
app.include_router(customers_import.router)
app.include_router(items_import.router)
app.include_router(invoices_import.router)
app.include_router(sales.router)
app.include_router(sales_management.router)
app.include_router(dashboard.router)
app.include_router(gl.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)
app.include_router(pricing.router)
app.include_router(sales_requests.router)
app.include_router(purchase_orders_import.router)
app.include_router(purchase_orders.router)
app.include_router(chart_of_accounts.router)
app.include_router(journal_entries.router)
app.include_router(control.router)
app.include_router(inv_management.router)


@app.on_event("startup")
def _backfill_unposted_subledger_entries() -> None:
    """Backfill finalized subledger transactions that were not written to the GL."""
    from .db import SessionLocal
    from .models import Invoice, PurchaseOrder
    from .purchasing.service import backfill_purchase_order_receipt_to_gl
    from .services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl
    from .services.unified_ledger import backfill_legacy_batches_to_gl, backfill_manual_journal_entries_to_gl
    invoice_statuses = {"SENT", "SHIPPED", "PARTIALLY_PAID", "PAID"}
    db = SessionLocal()
    try:
        unposted_invoices = (
            db.query(Invoice)
            .filter(Invoice.status.in_(invoice_statuses), Invoice.posted_to_gl.is_(False))
            .order_by(Invoice.id.asc())
            .all()
        )
        if unposted_invoices:
            _logger.info("gl_backfill_start invoices=%d", len(unposted_invoices))
        invoice_posted = 0
        for invoice in unposted_invoices:
            try:
                post_invoice_to_gl(db, invoice.id, company_id=1)
                db.commit()
                invoice_posted += 1
            except InvoiceGLPostingError as exc:
                db.rollback()
                _logger.warning("gl_backfill_skip invoice_id=%s error=%s", invoice.id, exc)
        if unposted_invoices:
            _logger.info("gl_backfill_done invoices_posted=%d invoices_skipped=%d", invoice_posted, len(unposted_invoices) - invoice_posted)

        manual_backfilled = backfill_manual_journal_entries_to_gl(db)
        if manual_backfilled:
            db.commit()
            _logger.info("gl_backfill_done manual_journal_entries_backfilled=%d", manual_backfilled)

        legacy_batches_backfilled = backfill_legacy_batches_to_gl(db)
        if legacy_batches_backfilled:
            db.commit()
            _logger.info("gl_backfill_done legacy_batches_backfilled=%d", legacy_batches_backfilled)
        po_candidates = (
            db.query(PurchaseOrder)
            .filter(PurchaseOrder.posted_journal_entry_id.is_not(None))
            .order_by(PurchaseOrder.id.asc())
            .all()
        )
        po_backfilled = 0
        po_skipped = 0
        for purchase_order in po_candidates:
            try:
                if backfill_purchase_order_receipt_to_gl(db, purchase_order):
                    db.commit()
                    po_backfilled += 1
            except ValueError as exc:
                db.rollback()
                po_skipped += 1
                _logger.warning("gl_backfill_skip purchase_order_id=%s error=%s", purchase_order.id, exc)
        if po_candidates:
            already_linked = len(po_candidates) - po_backfilled - po_skipped
            _logger.info(
                "gl_backfill_done purchase_orders_backfilled=%d purchase_orders_skipped=%d purchase_orders_already_linked=%d",
                po_backfilled,
                po_skipped,
                already_linked,
            )
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok"}


