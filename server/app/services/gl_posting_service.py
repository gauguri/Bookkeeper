from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.accounting.gl_engine import postJournalEntries
from app.models import Invoice


class InvoiceGLPostingError(Exception):
    pass


def post_invoice_to_gl(db: Session, invoice_id: int, *, company_id: int = 1) -> int:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise InvoiceGLPostingError("Invoice not found.")

    if invoice.posted_to_gl:
        existing_batch_id = invoice.gl_journal_entry_id or invoice.posted_journal_entry_id
        if existing_batch_id is None:
            raise InvoiceGLPostingError("Invoice is marked posted_to_gl but has no journal batch id.")
        return int(existing_batch_id)

    try:
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
        raise InvoiceGLPostingError(str(exc)) from exc

    posted_at = datetime.utcnow()
    invoice.posted_to_gl = True
    invoice.gl_journal_entry_id = batch_id
    invoice.gl_posted_at = posted_at
    # Backward-compatible fields while API/UI transitions to gl_* naming.
    invoice.posted_journal_entry_id = batch_id
    invoice.posted_at = posted_at
    invoice.gl_posting_last_error = None

    return batch_id
