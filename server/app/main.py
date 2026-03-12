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
    items_import,
    inv_management,
    journal_entries,
    pricing,
    purchase_orders,
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
app.include_router(sales.router)
app.include_router(sales_management.router)
app.include_router(dashboard.router)
app.include_router(gl.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)
app.include_router(pricing.router)
app.include_router(sales_requests.router)
app.include_router(purchase_orders.router)
app.include_router(chart_of_accounts.router)
app.include_router(journal_entries.router)
app.include_router(control.router)
app.include_router(inv_management.router)


@app.on_event("startup")
def _backfill_unposted_invoices() -> None:
    """Post any finalized invoices that were never written to the GL."""
    from .db import SessionLocal
    from .models import Invoice
    from .services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl

    _BACKFILL_STATUSES = {"SENT", "SHIPPED", "PARTIALLY_PAID", "PAID"}
    db = SessionLocal()
    try:
        unposted = (
            db.query(Invoice)
            .filter(Invoice.status.in_(_BACKFILL_STATUSES), Invoice.posted_to_gl.is_(False))
            .order_by(Invoice.id.asc())
            .all()
        )
        if not unposted:
            return
        _logger.info("gl_backfill_start count=%d", len(unposted))
        posted = 0
        for invoice in unposted:
            try:
                post_invoice_to_gl(db, invoice.id, company_id=1)
                db.commit()
                posted += 1
            except InvoiceGLPostingError as exc:
                db.rollback()
                _logger.warning("gl_backfill_skip invoice_id=%s error=%s", invoice.id, exc)
        _logger.info("gl_backfill_done posted=%d skipped=%d", posted, len(unposted) - posted)
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok"}
