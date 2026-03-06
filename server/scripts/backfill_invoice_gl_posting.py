from __future__ import annotations

from app.db import SessionLocal
from app.models import Invoice
from app.services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl


FINALIZED_STATUSES = ("SENT", "SHIPPED", "PARTIALLY_PAID", "PAID")


def main() -> None:
    db = SessionLocal()
    try:
        invoices = (
            db.query(Invoice)
            .filter(Invoice.status.in_(FINALIZED_STATUSES))
            .filter(Invoice.posted_to_gl.is_(False))
            .order_by(Invoice.id.asc())
            .all()
        )
        repaired = 0
        for invoice in invoices:
            try:
                post_invoice_to_gl(db, invoice.id, company_id=1)
                repaired += 1
            except InvoiceGLPostingError as exc:
                db.rollback()
                print(f"[ERROR] invoice_id={invoice.id} failed: {exc}")
                continue
            db.commit()
            print(f"[OK] invoice_id={invoice.id} posted")
        print(f"Done. repaired={repaired}, scanned={len(invoices)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
