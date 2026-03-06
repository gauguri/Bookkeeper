from __future__ import annotations

import argparse
from decimal import Decimal

from sqlalchemy import func

from app.db import SessionLocal
from app.models import Account, GLEntry, Invoice, JournalBatch, JournalBatchLine


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify invoice -> GL posting integrity for one invoice.")
    parser.add_argument("invoice_id", type=int)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == args.invoice_id).first()
        if not invoice:
            print(f"invoice_id={args.invoice_id} not found")
            return

        print(f"invoice_id={invoice.id} invoice_number={invoice.invoice_number}")
        print(f"status={invoice.status}")
        print(f"posted_to_gl={invoice.posted_to_gl}")
        print(f"gl_journal_entry_id={invoice.gl_journal_entry_id}")

        batch = None
        if invoice.gl_journal_entry_id is not None:
            batch = db.query(JournalBatch).filter(JournalBatch.id == invoice.gl_journal_entry_id).first()
        print(f"journal_batch_exists={batch is not None}")

        lines = []
        if batch:
            lines = db.query(JournalBatchLine).filter(JournalBatchLine.batch_id == batch.id).all()
        debit_total = sum(Decimal(line.debit_amount or 0) for line in lines)
        credit_total = sum(Decimal(line.credit_amount or 0) for line in lines)
        print(f"journal_lines={len(lines)} debits={debit_total} credits={credit_total} balanced={debit_total == credit_total}")

        income_account_ids = {
            row[0]
            for row in db.query(Account.id).filter(func.upper(Account.type) == "REVENUE").all()
        }
        income_credit_lines = [
            line for line in lines if line.account_id in income_account_ids and Decimal(line.credit_amount or 0) > 0
        ]
        print(f"income_credit_lines={len(income_credit_lines)}")

        pnl_revenue = (
            db.query(func.coalesce(func.sum(GLEntry.credit_amount - GLEntry.debit_amount), 0))
            .join(Account, Account.id == GLEntry.account_id)
            .filter(func.upper(Account.type) == "REVENUE")
            .filter(GLEntry.posting_date == invoice.issue_date)
            .scalar()
            or Decimal("0")
        )
        print(f"pnl_revenue_on_posting_date={Decimal(pnl_revenue)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
