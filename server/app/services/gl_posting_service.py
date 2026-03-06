from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.accounting.gl_engine import postJournalEntries
from app.models import Invoice

LOGGER = logging.getLogger(__name__)


class InvoiceGLPostingError(Exception):
    pass


def post_invoice_to_gl(db: Session, invoice_id: int, *, company_id: int = 1) -> int:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise InvoiceGLPostingError("Invoice not found.")

    LOGGER.info(
        "invoice_gl_posting_service_invoked",
        extra={
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "old_status": invoice.status,
            "new_status": invoice.status,
            "total_amount": str(invoice.total),
            "subtotal": str(invoice.subtotal),
            "tax_amount": str(invoice.tax_total),
            "posted_to_gl_before": bool(invoice.posted_to_gl),
            "journal_entry_id": invoice.gl_journal_entry_id or invoice.posted_journal_entry_id,
        },
    )

    if invoice.posted_to_gl:
        existing_batch_id = invoice.gl_journal_entry_id or invoice.posted_journal_entry_id
        if existing_batch_id is None:
            raise InvoiceGLPostingError("Invoice is marked posted_to_gl but has no journal batch id.")
        return int(existing_batch_id)

    try:
        LOGGER.info(
            "invoice_gl_posting_service_calling_gl_engine",
            extra={
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "old_status": invoice.status,
                "new_status": invoice.status,
                "total_amount": str(invoice.total),
                "subtotal": str(invoice.subtotal),
                "tax_amount": str(invoice.tax_total),
                "posted_to_gl_before": bool(invoice.posted_to_gl),
                "journal_entry_id": invoice.gl_journal_entry_id or invoice.posted_journal_entry_id,
            },
        )
        batch_id = postJournalEntries(
            "INVOICE_POSTED",
            {
                "event_id": f"invoice-posted:{invoice.id}",
                "company_id": company_id,
                "invoice_id": invoice.id,
                "reference_id": invoice.id,
                "posting_date": invoice.issue_date,
            },
            db,
        )
    except Exception as exc:  # pragma: no cover - defensive wrap for API/service callers
        invoice.gl_posting_last_error = str(exc)
        LOGGER.exception(
            "invoice_gl_posting_service_failed",
            extra={
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "old_status": invoice.status,
                "new_status": invoice.status,
                "total_amount": str(invoice.total),
                "subtotal": str(invoice.subtotal),
                "tax_amount": str(invoice.tax_total),
                "posted_to_gl_before": bool(invoice.posted_to_gl),
                "journal_entry_id": invoice.gl_journal_entry_id or invoice.posted_journal_entry_id,
            },
        )
        raise InvoiceGLPostingError(str(exc)) from exc

    posted_at = datetime.utcnow()
    invoice.posted_to_gl = True
    invoice.gl_journal_entry_id = batch_id
    invoice.gl_posted_at = posted_at
    # Backward-compatible fields while API/UI transitions to gl_* naming.
    invoice.posted_journal_entry_id = batch_id
    invoice.posted_at = posted_at
    invoice.gl_posting_last_error = None

    LOGGER.info(
        "invoice_gl_posting_service_completed",
        extra={
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "old_status": invoice.status,
            "new_status": invoice.status,
            "total_amount": str(invoice.total),
            "subtotal": str(invoice.subtotal),
            "tax_amount": str(invoice.tax_total),
            "posted_to_gl_before": False,
            "posted_to_gl_after": bool(invoice.posted_to_gl),
            "journal_entry_id": batch_id,
        },
    )

    return batch_id
