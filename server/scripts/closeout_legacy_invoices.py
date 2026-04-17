from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.db import SessionLocal
from app.accounting.gl_engine import postJournalEntries
from app.inventory.service import create_inventory_movement
from app.models import Inventory, InventoryMovement, Invoice
from app.sales.service import apply_payment, recalculate_invoice_balance, update_invoice_status
from app.services.gl_posting_service import InvoiceGLPostingError, post_invoice_to_gl


ACTIVE_STATUSES = {"DRAFT", "SENT", "SHIPPED", "PARTIALLY_PAID", "PAID"}


def _payment_date_for_invoice(invoice: Invoice) -> date:
    return invoice.due_date or invoice.issue_date


def _shipment_timestamp(invoice: Invoice) -> datetime:
    ship_date = invoice.issue_date or invoice.due_date or date.today()
    return datetime.combine(ship_date, time(12, 0))


def _shipment_posting_date(invoice: Invoice) -> date:
    return invoice.issue_date or invoice.due_date or date.today()


def _backfill_shipment_inventory(db, invoice: Invoice, *, dry_run: bool) -> list[str]:
    actions: list[str] = []
    for line in invoice.lines:
        if line.item_id is None:
            continue

        qty_shipped = Decimal(line.quantity or 0)
        if qty_shipped <= 0:
            continue

        inventory = (
            db.query(Inventory)
            .filter(Inventory.item_id == line.item_id)
            .with_for_update()
            .first()
        )
        if inventory is None:
            actions.append(f"inventory_missing:{line.item_id}")
            continue

        movement_rows = (
            db.query(InventoryMovement.qty_delta)
            .filter(
                InventoryMovement.item_id == line.item_id,
                InventoryMovement.ref_type == "invoice",
                InventoryMovement.ref_id == invoice.id,
                InventoryMovement.reason == "SHIPMENT",
            )
            .all()
        )
        already_applied = sum((abs(Decimal(row.qty_delta or 0)) for row in movement_rows), Decimal("0"))
        remaining_qty = qty_shipped - already_applied
        if remaining_qty <= 0:
            actions.append(f"inventory_already_shipped:{line.item_id}")
            continue

        on_hand = Decimal(inventory.quantity_on_hand or 0)
        qty_to_apply = min(on_hand, remaining_qty) if on_hand > 0 else Decimal("0")
        if qty_to_apply <= 0:
            actions.append(f"inventory_no_on_hand:{line.item_id}")
            continue

        if not dry_run:
            new_qty = on_hand - qty_to_apply
            inventory.quantity_on_hand = new_qty
            inventory.total_value = new_qty * Decimal(inventory.landed_unit_cost or 0)
            if getattr(inventory, "item", None) is not None:
                inventory.item.on_hand_qty = new_qty
            create_inventory_movement(
                db,
                item_id=line.item_id,
                qty_delta=-qty_to_apply,
                reason="SHIPMENT",
                ref_type="invoice",
                ref_id=invoice.id,
            )

        if qty_to_apply < remaining_qty:
            actions.append(f"inventory_partial:{line.item_id}:{qty_to_apply}/{remaining_qty}")
        else:
            actions.append(f"inventory_shipped:{line.item_id}:{qty_to_apply}")

    return actions


def _close_invoice(db, invoice: Invoice, *, dry_run: bool, payment_method: str, payment_note: str) -> dict:
    recalculate_invoice_balance(db, invoice)
    outstanding_before = Decimal(invoice.amount_due or 0)
    prior_status = invoice.status
    actions: list[str] = []

    if invoice.status == "VOID":
        return {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": "SKIP",
            "reason": "void invoice",
            "prior_status": prior_status,
            "final_status": prior_status,
            "outstanding_before": outstanding_before,
        }

    if invoice.status not in ACTIVE_STATUSES:
        return {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": "SKIP",
            "reason": f"unsupported status {invoice.status}",
            "prior_status": prior_status,
            "final_status": prior_status,
            "outstanding_before": outstanding_before,
        }

    if invoice.status == "DRAFT":
        invoice.status = "SENT"
        actions.append("marked_sent")

    if invoice.shipped_at is None:
        invoice.shipped_at = _shipment_timestamp(invoice)
        actions.append("set_shipped_at")

    if invoice.status != "PAID":
        invoice.status = "SHIPPED"
        actions.append("marked_shipped")

    if not invoice.posted_to_gl:
        actions.append("post_invoice_gl")
        if not dry_run:
            post_invoice_to_gl(db, invoice.id, company_id=1)

    actions.extend(_backfill_shipment_inventory(db, invoice, dry_run=dry_run))

    actions.append("post_shipment_gl")
    if not dry_run:
        postJournalEntries(
            "shipment_cogs",
            {
                "event_id": f"shipment:{invoice.id}",
                "company_id": 1,
                "invoice_id": invoice.id,
                "shipment_id": invoice.id,
                "reference_id": invoice.id,
                "posting_date": _shipment_posting_date(invoice),
                "shipped_ratio": Decimal("1.00"),
            },
            db,
        )

    recalculate_invoice_balance(db, invoice)
    outstanding_to_pay = Decimal(invoice.amount_due or 0)

    if outstanding_to_pay > 0:
        payment_date = _payment_date_for_invoice(invoice)
        actions.append(f"record_payment:{outstanding_to_pay}")
        if not dry_run:
            apply_payment(
                db,
                {
                    "customer_id": invoice.customer_id,
                    "invoice_id": invoice.id,
                    "amount": outstanding_to_pay,
                    "payment_date": payment_date,
                    "method": payment_method,
                    "reference": f"legacy-closeout:{invoice.invoice_number}",
                    "memo": payment_note,
                    "notes": payment_note,
                },
                [{"invoice_id": invoice.id, "applied_amount": outstanding_to_pay}],
            )

    recalculate_invoice_balance(db, invoice)
    update_invoice_status(invoice)
    invoice.updated_at = datetime.utcnow()

    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "status": "READY" if dry_run else "UPDATED",
        "prior_status": prior_status,
        "final_status": invoice.status,
        "outstanding_before": outstanding_before,
        "outstanding_after": Decimal(invoice.amount_due or 0),
        "actions": actions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mark legacy invoices as sent/shipped and record full payment for invoices on or before a cutoff date."
    )
    parser.add_argument(
        "--from-date",
        default=None,
        help="Optional inclusive start issue-date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--through",
        default="2024-12-31",
        help="Inclusive invoice issue-date cutoff in YYYY-MM-DD format. Default: 2024-12-31",
    )
    parser.add_argument(
        "--status",
        action="append",
        default=[],
        help="Optional invoice status filter. Can be supplied multiple times.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. If omitted, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--payment-method",
        default="Legacy Closeout",
        help="Payment method label for generated payments.",
    )
    parser.add_argument(
        "--payment-note",
        default="Historical invoice closeout backfill",
        help="Notes/memo attached to generated payments.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit on the number of invoices to process.",
    )
    args = parser.parse_args()

    start_date = date.fromisoformat(args.from_date) if args.from_date else None
    cutoff = date.fromisoformat(args.through)
    statuses = [status.upper() for status in args.status]

    db = SessionLocal()
    try:
        query = db.query(Invoice).filter(Invoice.issue_date <= cutoff)
        if start_date is not None:
            query = query.filter(Invoice.issue_date >= start_date)
        if statuses:
            query = query.filter(Invoice.status.in_(statuses))
        query = query.order_by(Invoice.issue_date.asc(), Invoice.id.asc())
        if args.limit > 0:
            query = query.limit(args.limit)
        invoices = query.all()

        processed = 0
        skipped = 0
        failed = 0

        print(
            f"[START] mode={'APPLY' if args.apply else 'DRY-RUN'} "
            f"from_inclusive={(start_date.isoformat() if start_date else 'None')} "
            f"cutoff_inclusive={cutoff.isoformat()} statuses={','.join(statuses) if statuses else 'ALL'} "
            f"invoices={len(invoices)}"
        )

        for invoice in invoices:
            try:
                result = _close_invoice(
                    db,
                    invoice,
                    dry_run=not args.apply,
                    payment_method=args.payment_method,
                    payment_note=args.payment_note,
                )
                if result["status"] == "SKIP":
                    skipped += 1
                    print(
                        f"[SKIP] invoice_id={result['invoice_id']} invoice_number={result['invoice_number']} "
                        f"reason={result['reason']} status={result['prior_status']}"
                    )
                    if args.apply:
                        db.rollback()
                    else:
                        db.expire_all()
                    continue

                if args.apply:
                    db.commit()
                else:
                    db.rollback()

                processed += 1
                print(
                    f"[{result['status']}] invoice_id={result['invoice_id']} invoice_number={result['invoice_number']} "
                    f"prior_status={result['prior_status']} final_status={result['final_status']} "
                    f"outstanding_before={result['outstanding_before']} outstanding_after={result['outstanding_after']} "
                    f"actions={','.join(result['actions'])}"
                )
            except InvoiceGLPostingError as exc:
                db.rollback()
                failed += 1
                print(
                    f"[ERROR] invoice_id={invoice.id} invoice_number={invoice.invoice_number} "
                    f"gl_post_failed={exc}"
                )
            except Exception as exc:  # pragma: no cover - defensive batch script handling
                db.rollback()
                failed += 1
                print(
                    f"[ERROR] invoice_id={invoice.id} invoice_number={invoice.invoice_number} "
                    f"error={exc}"
                )

        print(
            f"[DONE] processed={processed} skipped={skipped} failed={failed} scanned={len(invoices)} mode={'APPLY' if args.apply else 'DRY-RUN'}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
