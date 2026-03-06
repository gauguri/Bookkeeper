from __future__ import annotations

import argparse

from app.db import SessionLocal
from app.models import Invoice
from app.services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl


FINALIZED_STATUSES = ("SENT", "SHIPPED", "PARTIALLY_PAID", "PAID")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill GL posting for finalized invoices that were never posted.")
    parser.add_argument("--dry-run", action="store_true", help="Show invoices that would be posted without writing changes.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        invoices = (
            db.query(Invoice)
            .filter(Invoice.status.in_(FINALIZED_STATUSES))
            .order_by(Invoice.id.asc())
            .all()
        )
        repaired = 0
        skipped = 0
        failed = 0
        for invoice in invoices:
            if invoice.posted_to_gl and invoice.gl_journal_entry_id:
                skipped += 1
                print(f"[SKIP] invoice_id={invoice.id} status={invoice.status} already_posted=True batch_id={invoice.gl_journal_entry_id}")
                continue
            if invoice.posted_to_gl and not invoice.gl_journal_entry_id:
                failed += 1
                print(f"[ERROR] invoice_id={invoice.id} inconsistent state: posted_to_gl=true but gl_journal_entry_id is null")
                continue

            print(f"[PENDING] invoice_id={invoice.id} status={invoice.status} posted_to_gl={invoice.posted_to_gl}")
            if args.dry_run:
                continue

            try:
                post_invoice_to_gl(db, invoice.id, company_id=1)
                db.commit()
                repaired += 1
                print(f"[OK] invoice_id={invoice.id} posted")
            except InvoiceGLPostingError as exc:
                db.rollback()
                failed += 1
                print(f"[ERROR] invoice_id={invoice.id} failed: {exc}")

        print(f"Done. repaired={repaired}, skipped={skipped}, failed={failed}, scanned={len(invoices)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
