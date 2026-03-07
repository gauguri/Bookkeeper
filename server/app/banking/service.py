from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import BankAccount, BankTransaction, MatchLink, Payment, ReconciliationSession


def _to_decimal(value: str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, TypeError):
        return None



def _is_legacy_placeholder_account(account: BankAccount) -> bool:
    return (
        account.name == "Operating Account"
        and account.institution == "Bedrock Bank"
        and account.account_type == "checking"
        and account.last4 == "1209"
        and (account.currency or "USD") == "USD"
        and Decimal(account.opening_balance or 0) == Decimal("250000.00")
        and Decimal(account.current_balance or 0) == Decimal("287450.12")
        and account.status == "active"
    )


def _purge_legacy_placeholder_bank_accounts(db: Session) -> None:
    placeholder_accounts = db.query(BankAccount).all()
    removed = False
    for account in placeholder_accounts:
        if not _is_legacy_placeholder_account(account):
            continue
        has_transactions = db.query(BankTransaction.id).filter(BankTransaction.bank_account_id == account.id).first() is not None
        has_reconciliations = db.query(ReconciliationSession.id).filter(ReconciliationSession.bank_account_id == account.id).first() is not None
        if has_transactions or has_reconciliations:
            continue
        db.delete(account)
        removed = True
    if removed:
        db.commit()


def list_bank_accounts(db: Session) -> list[BankAccount]:
    _purge_legacy_placeholder_bank_accounts(db)
    return db.query(BankAccount).order_by(BankAccount.name.asc()).all()

def get_dashboard_metrics(db: Session) -> dict:
    accounts = list_bank_accounts(db)
    txns = db.query(BankTransaction).all()
    cash_balance = sum((Decimal(a.current_balance or a.opening_balance or 0) for a in accounts), Decimal("0"))
    unreconciled = sum(1 for t in txns if t.status in {"new", "categorized", "matched"})
    needs_review = sum(1 for t in txns if t.status == "new")
    exceptions_count = sum(1 for t in txns if t.status in {"excluded"})
    month_start = date.today().replace(day=1)
    reconciled_this_month = sum(1 for t in txns if t.status == "reconciled" and t.posted_date >= month_start)

    trend = []
    if accounts:
        running = cash_balance - Decimal("5000")
        for i in range(11, -1, -1):
            trend_day = date.today() - timedelta(days=i)
            running += Decimal("380") - Decimal(i * 8)
            trend.append({"day": trend_day, "balance": running.quantize(Decimal("0.01"))})

    by_category: dict[str, Decimal] = {}
    for txn in txns:
        category = txn.category or "Uncategorized"
        by_category[category] = by_category.get(category, Decimal("0")) + abs(Decimal(txn.amount or 0))
    category_breakdown = [{"category": k, "value": v.quantize(Decimal("0.01"))} for k, v in sorted(by_category.items(), key=lambda i: i[1], reverse=True)[:6]]

    progress = []
    for account in accounts:
        account_txns = [t for t in txns if t.bank_account_id == account.id]
        progress.append({
            "account": account.name,
            "reconciled": sum(1 for t in account_txns if t.status == "reconciled"),
            "unreconciled": sum(1 for t in account_txns if t.status != "reconciled"),
        })

    return {
        "kpis": {
            "cash_balance": cash_balance.quantize(Decimal("0.01")),
            "unreconciled_transactions": unreconciled,
            "items_needing_review": needs_review,
            "reconciled_this_month": reconciled_this_month,
            "exceptions_count": exceptions_count,
        },
        "cash_trend": trend,
        "category_breakdown": category_breakdown,
        "reconciliation_progress": progress,
    }

def list_transactions(
    db: Session,
    *,
    search: str | None = None,
    account_id: int | None = None,
    status: str | None = None,
    category: str | None = None,
    direction: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    amount_min: Decimal | None = None,
    amount_max: Decimal | None = None,
    limit: int = 200,
) -> tuple[list[BankTransaction], int]:
    query = db.query(BankTransaction)
    if account_id:
        query = query.filter(BankTransaction.bank_account_id == account_id)
    if status:
        query = query.filter(BankTransaction.status == status)
    if category:
        query = query.filter(BankTransaction.category == category)
    if direction:
        query = query.filter(BankTransaction.direction == direction)
    if start_date:
        query = query.filter(BankTransaction.posted_date >= start_date)
    if end_date:
        query = query.filter(BankTransaction.posted_date <= end_date)
    if amount_min is not None:
        query = query.filter(func.abs(BankTransaction.amount) >= amount_min)
    if amount_max is not None:
        query = query.filter(func.abs(BankTransaction.amount) <= amount_max)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            BankTransaction.description.ilike(like),
            BankTransaction.vendor.ilike(like),
            BankTransaction.reference.ilike(like),
        ))

    total = query.count()
    rows = query.order_by(BankTransaction.posted_date.desc(), BankTransaction.id.desc()).limit(limit).all()
    return rows, total


def update_transaction(db: Session, transaction_id: int, **updates) -> BankTransaction:
    txn = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not txn:
        raise ValueError("Transaction not found.")
    for key, value in updates.items():
        if value is not None and hasattr(txn, key):
            setattr(txn, key, value)
    db.commit()
    db.refresh(txn)
    return txn


def import_transactions_from_rows(db: Session, *, bank_account_id: int, source: str, rows: list[dict]) -> dict:
    account = db.query(BankAccount).filter(BankAccount.id == bank_account_id).first()
    if not account:
        raise ValueError("Bank account not found.")

    imported = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=2):
        posted = row.get("date")
        description = (row.get("description") or "").strip()
        if not posted or not description:
            errors.append(f"Row {idx}: date and description are required.")
            continue
        try:
            posted_date = date.fromisoformat(posted)
        except ValueError:
            errors.append(f"Row {idx}: invalid date '{posted}'.")
            continue

        signed_amount = _to_decimal(row.get("amount"))
        debit = _to_decimal(row.get("debit"))
        credit = _to_decimal(row.get("credit"))
        if signed_amount is None:
            if debit is None and credit is None:
                errors.append(f"Row {idx}: amount or debit/credit columns required.")
                continue
            signed_amount = (credit or Decimal("0")) - (debit or Decimal("0"))

        direction = "credit" if signed_amount >= 0 else "debit"
        txn = BankTransaction(
            bank_account_id=bank_account_id,
            posted_date=posted_date,
            description=description,
            amount=signed_amount.quantize(Decimal("0.01")),
            currency=(row.get("currency") or account.currency or "USD").upper(),
            direction=direction,
            vendor=row.get("vendor") or None,
            reference=row.get("reference") or None,
            source=source,
            status="new",
        )
        db.add(txn)
        imported += 1

    db.commit()
    return {"imported_count": imported, "errors": errors}


def create_reconciliation_session(db: Session, *, bank_account_id: int, period_start: date, period_end: date, statement_ending_balance: Decimal, created_by: int | None) -> ReconciliationSession:
    session = ReconciliationSession(
        bank_account_id=bank_account_id,
        period_start=period_start,
        period_end=period_end,
        statement_ending_balance=statement_ending_balance,
        created_by=created_by,
        status="open",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_reconciliation_sessions(db: Session) -> list[ReconciliationSession]:
    return db.query(ReconciliationSession).order_by(ReconciliationSession.created_at.desc()).all()


def _candidate_matches(db: Session, txn: BankTransaction) -> list[dict]:
    date_floor = txn.posted_date - timedelta(days=3)
    date_ceil = txn.posted_date + timedelta(days=3)
    target = abs(Decimal(txn.amount or 0))
    payments = db.query(Payment).filter(and_(Payment.payment_date >= date_floor, Payment.payment_date <= date_ceil)).all()
    candidates = []
    for payment in payments:
        payment_amt = abs(Decimal(payment.amount or 0))
        if payment_amt == 0:
            continue
        delta = abs(target - payment_amt)
        confidence = Decimal("100") if delta == 0 else max(Decimal("45"), Decimal("100") - (delta * 100 / max(target, Decimal('1'))))
        candidates.append({
            "entity_type": "payment",
            "entity_id": payment.id,
            "date": payment.payment_date,
            "description": payment.reference or payment.memo or f"Payment #{payment.id}",
            "amount": payment_amt.quantize(Decimal("0.01")),
            "confidence": confidence.quantize(Decimal("0.01")),
        })
    candidates.sort(key=lambda item: item["confidence"], reverse=True)
    return candidates[:5]


def get_reconciliation_workspace(db: Session, reconciliation_session_id: int) -> dict:
    session = db.query(ReconciliationSession).filter(ReconciliationSession.id == reconciliation_session_id).first()
    if not session:
        raise ValueError("Reconciliation session not found.")

    txns = (
        db.query(BankTransaction)
        .filter(BankTransaction.bank_account_id == session.bank_account_id)
        .filter(BankTransaction.posted_date >= session.period_start)
        .filter(BankTransaction.posted_date <= session.period_end)
        .order_by(BankTransaction.posted_date.asc(), BankTransaction.id.asc())
        .all()
    )
    cleared = [txn for txn in txns if txn.status == "reconciled"]
    uncleared = [txn for txn in txns if txn.status != "reconciled"]
    needs_review = [txn for txn in txns if txn.status == "new"]

    account = db.query(BankAccount).filter(BankAccount.id == session.bank_account_id).first()
    opening = Decimal(account.opening_balance or 0) if account else Decimal("0")
    period_net = sum((Decimal(txn.amount or 0) for txn in txns), Decimal("0"))
    computed = (opening + period_net).quantize(Decimal("0.01"))
    difference = (Decimal(session.statement_ending_balance or 0) - computed).quantize(Decimal("0.01"))

    return {
        "session": session,
        "cleared_count": len(cleared),
        "uncleared_count": len(uncleared),
        "difference": difference,
        "uncleared_transactions": uncleared,
        "needs_review_transactions": needs_review,
        "candidates": {txn.id: _candidate_matches(db, txn) for txn in uncleared[:20]},
    }


def create_match_link(db: Session, *, bank_transaction_id: int, linked_entity_type: str, linked_entity_id: int, match_confidence: Decimal | None, match_type: str) -> MatchLink:
    txn = db.query(BankTransaction).filter(BankTransaction.id == bank_transaction_id).first()
    if not txn:
        raise ValueError("Transaction not found.")
    link = MatchLink(
        bank_transaction_id=bank_transaction_id,
        linked_entity_type=linked_entity_type,
        linked_entity_id=linked_entity_id,
        match_confidence=match_confidence,
        match_type=match_type,
    )
    db.add(link)
    txn.status = "matched"
    db.commit()
    db.refresh(link)
    return link


def close_reconciliation_session(db: Session, reconciliation_session_id: int, force: bool = False) -> ReconciliationSession:
    workspace = get_reconciliation_workspace(db, reconciliation_session_id)
    session = workspace["session"]
    if workspace["difference"] != 0 and not force:
        raise ValueError("Difference must be zero before closing reconciliation.")
    session.status = "closed"
    session.reconciled_at = datetime.utcnow()
    for txn in workspace["uncleared_transactions"]:
        if txn.status == "matched":
            txn.status = "reconciled"
    db.commit()
    db.refresh(session)
    return session

