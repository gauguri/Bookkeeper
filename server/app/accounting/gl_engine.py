from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models import Account, GLEntry, GLPostingAudit, Inventory, Invoice, JournalBatch, JournalBatchLine

ZERO = Decimal("0.00")
LOGGER = logging.getLogger(__name__)
DEBIT_NORMAL_TYPES = {"ASSET", "EXPENSE", "COGS"}


class GLPostingError(ValueError):
    pass


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _resolve_account(db: Session, company_id: int, *, codes: list[str], names: list[str]) -> Account:
    account = (
        db.query(Account)
        .filter(Account.company_id == company_id, Account.code.in_(codes), Account.is_active.is_(True))
        .order_by(Account.id.asc())
        .first()
    )
    if account:
        return account

    lowered = [n.lower() for n in names]
    rows = db.query(Account).filter(Account.company_id == company_id, Account.is_active.is_(True)).all()
    for row in rows:
        if any(candidate in (row.name or "").lower() for candidate in lowered):
            return row
    defaults = {
        "cash": ("ASSET", "debit"),
        "accounts receivable": ("ASSET", "debit"),
        "a/r": ("ASSET", "debit"),
        "revenue": ("REVENUE", "credit"),
        "sales": ("REVENUE", "credit"),
        "inventory": ("ASSET", "debit"),
        "cost of goods sold": ("COGS", "debit"),
        "cogs": ("COGS", "debit"),
        "unearned": ("LIABILITY", "credit"),
        "customer deposit": ("LIABILITY", "credit"),
        "bad debt expense": ("EXPENSE", "debit"),
        "retained earnings": ("EQUITY", "credit"),
    }
    hint = names[0].lower()
    account_type, normal_balance = defaults.get(hint, ("ASSET", "debit"))
    account = Account(company_id=company_id, code=codes[0], name=names[0].title(), type=account_type, normal_balance=normal_balance, is_active=True)
    db.add(account)
    db.flush()
    return account


def _assert_balanced(lines: list[dict[str, Any]]) -> None:
    debits = sum((_money(line.get("debit_amount")) for line in lines), ZERO)
    credits = sum((_money(line.get("credit_amount")) for line in lines), ZERO)
    if debits != credits:
        raise GLPostingError(f"Unbalanced GL posting: debits={debits} credits={credits}")


def _posted_ar_balance(db: Session, invoice_id: int, ar_account_id: int) -> Decimal:
    rows = (
        db.query(GLEntry)
        .filter(GLEntry.invoice_id == invoice_id, GLEntry.account_id == ar_account_id)
        .all()
    )
    return sum((_money(r.debit_amount) - _money(r.credit_amount) for r in rows), ZERO)


def _posted_unearned_balance(db: Session, invoice_id: int, unearned_account_id: int) -> Decimal:
    rows = (
        db.query(GLEntry)
        .filter(GLEntry.invoice_id == invoice_id, GLEntry.account_id == unearned_account_id)
        .all()
    )
    return sum((_money(r.credit_amount) - _money(r.debit_amount) for r in rows), ZERO)


def get_gl_account_balances(db: Session, *, account_type: str | None = None) -> list[dict[str, Any]]:
    query = (
        db.query(
            Account.id.label("account_id"),
            Account.name.label("account_name"),
            func.coalesce(func.sum(GLEntry.debit_amount), 0).label("total_debits"),
            func.coalesce(func.sum(GLEntry.credit_amount), 0).label("total_credits"),
            Account.type.label("account_type"),
        )
        .join(GLEntry, GLEntry.account_id == Account.id)
        .group_by(Account.id, Account.name, Account.type)
    )
    if account_type:
        query = query.filter(func.upper(Account.type) == account_type.upper())

    rows = query.all()

    def _normal_balance(account_kind: str | None, debit: Decimal, credit: Decimal) -> Decimal:
        if (account_kind or "").upper() in DEBIT_NORMAL_TYPES:
            return debit - credit
        return credit - debit

    normalized_rows = [
        {
            "account_id": row.account_id,
            "account_name": row.account_name,
            "total_debits": _money(row.total_debits),
            "total_credits": _money(row.total_credits),
            "balance": _normal_balance(row.account_type, _money(row.total_debits), _money(row.total_credits)),
        }
        for row in rows
    ]
    normalized_rows.sort(key=lambda row: row["balance"])
    return normalized_rows


def get_gl_entries_for_account(db: Session, account_id: int) -> list[GLEntry]:
    return (
        db.query(GLEntry)
        .filter(GLEntry.account_id == account_id)
        .order_by(GLEntry.created_at.asc(), GLEntry.id.asc())
        .all()
    )


def _assert_asset_account_guardrails(db: Session, lines: list[dict[str, Any]], *, allowed_threshold: Decimal = ZERO) -> None:
    account_ids = {int(line["account_id"]) for line in lines}
    if not account_ids:
        return

    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    account_map = {account.id: account for account in accounts}
    for account_id in account_ids:
        account = account_map.get(account_id)
        if not account or (account.type or "").upper() != "ASSET":
            continue
        guarded_names = {"accounts receivable", "a/r", "cash", "undeposited funds"}
        account_name = (account.name or "").strip().lower()
        if account_name not in guarded_names:
            continue

        current_balance = (
            db.query(
                func.coalesce(func.sum(GLEntry.debit_amount), 0)
                - func.coalesce(func.sum(GLEntry.credit_amount), 0)
            )
            .filter(GLEntry.account_id == account_id)
            .scalar()
            or ZERO
        )
        line_delta = sum(
            (
                _money(line.get("debit_amount")) - _money(line.get("credit_amount"))
                for line in lines
                if int(line["account_id"]) == account_id
            ),
            ZERO,
        )
        projected_balance = _money(current_balance) + line_delta
        if projected_balance < _money(allowed_threshold):
            raise GLPostingError(
                f"Posting would drive asset account '{account.name}' (id={account.id}) below allowed threshold "
                f"{_money(allowed_threshold)}. Projected balance={projected_balance}."
            )


def _warn_on_negative_asset_balance(db: Session, lines: list[dict[str, Any]], *, reference: str) -> None:
    account_ids = {int(line["account_id"]) for line in lines}
    if not account_ids:
        return
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    account_map = {account.id: account for account in accounts}
    for line in lines:
        account = account_map.get(int(line["account_id"]))
        if not account or (account.type or "").upper() != "ASSET":
            continue
        line_debit = _money(line.get("debit_amount"))
        line_credit = _money(line.get("credit_amount"))
        if line_credit <= line_debit:
            continue
        current_balance = (
            db.query(
                func.coalesce(func.sum(GLEntry.debit_amount), 0)
                - func.coalesce(func.sum(GLEntry.credit_amount), 0)
            )
            .filter(GLEntry.account_id == account.id)
            .scalar()
            or ZERO
        )
        projected_balance = _money(current_balance) + (line_debit - line_credit)
        if projected_balance < ZERO:
            LOGGER.warning(
                "Asset account projected negative from credit posting | reference=%s account_id=%s account_name=%s projected_balance=%s",
                reference,
                account.id,
                account.name,
                projected_balance,
            )


def _validate_revenue_cash_direction(event_type: str, lines: list[dict[str, Any]], cash_account_id: int, revenue_account_id: int) -> None:
    cash_credit = sum(
        (_money(line.get("credit_amount")) for line in lines if int(line["account_id"]) == cash_account_id),
        ZERO,
    )
    revenue_credit = sum(
        (_money(line.get("credit_amount")) for line in lines if int(line["account_id"]) == revenue_account_id),
        ZERO,
    )
    if event_type.lower() != "cash_sale" and cash_credit > ZERO and revenue_credit > ZERO:
        raise GLPostingError("Revenue postings must not credit cash unless posting a cash_sale event.")


def _save_batch(db: Session, *, event_type: str, context: dict[str, Any], entries: list[dict[str, Any]]) -> int:
    event_id = str(context["event_id"])
    existing = (
        db.query(JournalBatch)
        .filter(JournalBatch.event_type == event_type, JournalBatch.event_id == event_id)
        .first()
    )
    if existing:
        return existing.id

    reference_id = int(context.get("reference_id") or context.get("invoice_id") or context.get("payment_id") or 0)
    batch = JournalBatch(
        event_type=event_type,
        event_id=event_id,
        reference_type=event_type,
        reference_id=reference_id,
        status="POSTED",
        posted_at=datetime.utcnow(),
    )
    db.add(batch)
    db.flush()

    for line in entries:
        db.add(
            JournalBatchLine(
                batch_id=batch.id,
                account_id=int(line["account_id"]),
                debit_amount=_money(line["debit_amount"]),
                credit_amount=_money(line["credit_amount"]),
                memo=line.get("memo"),
                created_at=line.get("created_at", datetime.utcnow()),
            )
        )
        db.add(
            GLEntry(
                journal_batch_id=batch.id,
                account_id=int(line["account_id"]),
                debit_amount=_money(line["debit_amount"]),
                credit_amount=_money(line["credit_amount"]),
                reference_type=event_type,
                reference_id=reference_id,
                invoice_id=context.get("invoice_id"),
                shipment_id=context.get("shipment_id"),
                payment_id=context.get("payment_id"),
                event_type=event_type,
                event_id=event_id,
                posting_date=context.get("posting_date"),
                created_at=line.get("created_at", datetime.utcnow()),
            )
        )
    return batch.id


def postJournalEntry(db: Session, *, event_type: str, context: dict[str, Any], entries: list[dict[str, Any]]) -> int:
    _assert_balanced(entries)
    _assert_asset_account_guardrails(db, entries, allowed_threshold=_money(context.get("asset_negative_threshold", ZERO)))
    _warn_on_negative_asset_balance(
        db,
        entries,
        reference=f"{event_type}:{context.get('reference_id') or context.get('invoice_id') or context.get('payment_id') or 'unknown'}",
    )
    return _save_batch(db, event_type=event_type, context=context, entries=entries)


def _shipment_lines(db: Session, invoice: Invoice, shipped_ratio: Decimal) -> tuple[Decimal, Decimal]:
    revenue_amount = _money(invoice.total) * shipped_ratio
    cogs_amount = ZERO
    for line in invoice.lines:
        qty = _money(line.quantity)
        if qty <= ZERO:
            continue
        ratio_qty = qty * shipped_ratio
        inventory = db.query(Inventory).filter(Inventory.item_id == line.item_id).first() if line.item_id else None
        unit_cost = _money(line.landed_unit_cost or line.unit_cost or (inventory.landed_unit_cost if inventory else 0))
        cogs_amount += _money(unit_cost * ratio_qty)
    return _money(revenue_amount), _money(cogs_amount)


def postJournalEntries(eventType: str, context: dict[str, Any], db: Session) -> int:
    event_type = eventType.upper()
    event_id = str(context["event_id"])
    with db.begin_nested():
        existing = db.query(JournalBatch).filter(and_(JournalBatch.event_type == event_type, JournalBatch.event_id == event_id)).first()
        if existing:
            return existing.id

        company_id = int(context["company_id"])
        cash = _resolve_account(db, company_id, codes=["1000", "10100"], names=["cash"])
        ar = _resolve_account(db, company_id, codes=["1100", "11100"], names=["accounts receivable", "a/r"])
        revenue = _resolve_account(db, company_id, codes=["4000", "4100"], names=["revenue", "sales"])
        inventory = _resolve_account(db, company_id, codes=["1200", "13100"], names=["inventory"])
        cogs = _resolve_account(db, company_id, codes=["5000", "5100"], names=["cost of goods sold", "cogs"])
        unearned = _resolve_account(db, company_id, codes=["2300", "2200"], names=["unearned", "customer deposit"])
        bad_debt = _resolve_account(db, company_id, codes=["6100"], names=["bad debt expense"])

        lines: list[dict[str, Any]] = []
        invoice_id = context.get("invoice_id")

        if event_type in {"INVOICE_POSTED", "SHIPMENT_POSTED", "SHIPMENT", "SHIPMENT_FOR_PREPAID_ORDER"}:
            invoice: Invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
            if not invoice:
                raise GLPostingError("Invoice not found for shipment posting.")
            shipped_ratio = _money(context.get("shipped_ratio", Decimal("1.00")))
            if shipped_ratio <= ZERO or shipped_ratio > Decimal("1.00"):
                raise GLPostingError("Invalid shipped ratio.")

            revenue_amount, cogs_amount = _shipment_lines(db, invoice, shipped_ratio)
            if revenue_amount <= ZERO:
                raise GLPostingError("Shipment posting amount must be > 0.")

            if event_type == "INVOICE_POSTED":
                lines.extend([
                    {"account_id": ar.id, "debit_amount": revenue_amount, "credit_amount": ZERO},
                    {"account_id": revenue.id, "debit_amount": ZERO, "credit_amount": revenue_amount},
                ])
            elif event_type == "SHIPMENT_FOR_PREPAID_ORDER":
                lines.extend([
                    {"account_id": unearned.id, "debit_amount": revenue_amount, "credit_amount": ZERO},
                    {"account_id": revenue.id, "debit_amount": ZERO, "credit_amount": revenue_amount},
                ])
            else:
                unearned_available = _posted_unearned_balance(db, invoice.id, unearned.id)
                unearned_to_recognize = min(unearned_available, revenue_amount)
                ar_to_recognize = _money(revenue_amount - unearned_to_recognize)
                if ar_to_recognize > ZERO:
                    lines.extend([
                        {"account_id": ar.id, "debit_amount": ar_to_recognize, "credit_amount": ZERO},
                        {"account_id": revenue.id, "debit_amount": ZERO, "credit_amount": ar_to_recognize},
                    ])
                if unearned_to_recognize > ZERO:
                    lines.extend([
                        {"account_id": unearned.id, "debit_amount": unearned_to_recognize, "credit_amount": ZERO},
                        {"account_id": revenue.id, "debit_amount": ZERO, "credit_amount": unearned_to_recognize},
                    ])

            if cogs_amount > ZERO:
                lines.extend([
                    {"account_id": cogs.id, "debit_amount": cogs_amount, "credit_amount": ZERO},
                    {"account_id": inventory.id, "debit_amount": ZERO, "credit_amount": cogs_amount},
                ])
        elif event_type in {"PAYMENT_POSTED", "PAYMENT"}:
            amount = _money(context["amount"])
            if amount <= ZERO:
                raise GLPostingError("Payment must be greater than zero.")
            invoice_status = (context.get("invoice_status") or "").upper()
            if invoice_status and invoice_status not in {"POSTED", "SHIPPED", "PARTIALLY_PAID", "PAID"}:
                raise GLPostingError("Payments can only be posted after the invoice has recognized AR.")
            ar_outstanding = _posted_ar_balance(db, int(invoice_id), ar.id)
            if ar_outstanding < amount:
                raise GLPostingError("Negative AR would result from payment posting.")
            lines.extend([
                {"account_id": cash.id, "debit_amount": amount, "credit_amount": ZERO},
                {"account_id": ar.id, "debit_amount": ZERO, "credit_amount": amount},
            ])
        elif event_type == "CASH_SALE" or eventType.lower() == "cash_sale":
            amount = _money(context["amount"])
            lines.extend([
                {"account_id": cash.id, "debit_amount": amount, "credit_amount": ZERO},
                {"account_id": revenue.id, "debit_amount": ZERO, "credit_amount": amount},
            ])
        elif event_type == "PREPAYMENT_RECEIVED":
            amount = _money(context["amount"])
            lines.extend([
                {"account_id": cash.id, "debit_amount": amount, "credit_amount": ZERO},
                {"account_id": unearned.id, "debit_amount": ZERO, "credit_amount": amount},
            ])
        elif event_type == "CREDIT_MEMO":
            amount = _money(context["amount"])
            lines.extend([
                {"account_id": revenue.id, "debit_amount": amount, "credit_amount": ZERO},
                {"account_id": ar.id, "debit_amount": ZERO, "credit_amount": amount},
            ])
        elif event_type == "WRITE_OFF":
            amount = _money(context["amount"])
            lines.extend([
                {"account_id": bad_debt.id, "debit_amount": amount, "credit_amount": ZERO},
                {"account_id": ar.id, "debit_amount": ZERO, "credit_amount": amount},
            ])
        else:
            raise GLPostingError(f"Unsupported eventType: {eventType}")

        _validate_revenue_cash_direction(eventType, lines, cash.id, revenue.id)
        batch_entries = [{**line, "created_at": datetime.utcnow()} for line in lines]
        _assert_balanced(batch_entries)
        batch_id = postJournalEntry(db, event_type=event_type, context=context, entries=batch_entries)

        db.merge(GLPostingAudit(event_type=event_type, event_id=event_id, journal_batch_id=batch_id, payload=str(context)))
        db.flush()
        return batch_id


def run_gl_diagnostics(db: Session) -> dict[str, Any]:
    negative_assets = []
    asset_rows = (
        db.query(
            Account.id,
            Account.name,
            func.coalesce(func.sum(GLEntry.debit_amount), 0).label("debits"),
            func.coalesce(func.sum(GLEntry.credit_amount), 0).label("credits"),
        )
        .join(GLEntry, GLEntry.account_id == Account.id)
        .filter(func.upper(Account.type) == "ASSET")
        .group_by(Account.id, Account.name)
        .all()
    )
    for row in asset_rows:
        bal = _money(row.debits) - _money(row.credits)
        if bal < ZERO:
            negative_assets.append({"account_id": row.id, "account_name": row.name, "balance": bal})

    unbalanced_batches = []
    batch_rows = (
        db.query(
            JournalBatch.id,
            func.coalesce(func.sum(JournalBatchLine.debit_amount), 0).label("debits"),
            func.coalesce(func.sum(JournalBatchLine.credit_amount), 0).label("credits"),
        )
        .join(JournalBatchLine, JournalBatchLine.batch_id == JournalBatch.id)
        .group_by(JournalBatch.id)
        .all()
    )
    for row in batch_rows:
        if _money(row.debits) != _money(row.credits):
            unbalanced_batches.append({"batch_id": row.id, "debits": _money(row.debits), "credits": _money(row.credits)})

    payments_without_ar = (
        db.query(GLPostingAudit.event_id)
        .filter(GLPostingAudit.event_type.in_(["PAYMENT", "PAYMENT_POSTED"]))
        .filter(
            ~db.query(GLEntry.id)
            .filter(and_(GLEntry.event_id == GLPostingAudit.event_id, GLEntry.reference_type.in_(["PAYMENT", "PAYMENT_POSTED"]), GLEntry.credit_amount > 0))
            .exists()
        )
        .all()
    )

    # simple, portable version:
    posted_invoice_ids = {row[0] for row in db.query(GLEntry.invoice_id).filter(GLEntry.invoice_id.isnot(None)).distinct().all()}
    missing_revenue = [row.id for row in db.query(Invoice.id).filter(~Invoice.id.in_(posted_invoice_ids)).all()]

    return {
        "negative_asset_balances": negative_assets,
        "unbalanced_journal_batches": unbalanced_batches,
        "payments_without_ar_credit": [row[0] for row in payments_without_ar],
        "revenue_without_gl_entries": missing_revenue,
    }
