from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Customer, Invoice, InvoiceLine, Opportunity, OpportunityStageConfig, PriceBook, Quote, QuoteLine, SalesAccount, SalesActivity, SalesContact, SalesOrder, SalesOrderLine

ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ALLOCATED", "FULFILLED", "INVOICED", "CLOSED"]

def _next_number(db: Session, prefix: str, model) -> str:
    latest = db.query(model).order_by(model.id.desc()).first()
    return f"{prefix}-{(latest.id if latest else 0) + 1:05d}"

def _paginate(query, page: int, page_size: int):
    return {"items": query.offset(page * page_size).limit(page_size).all(), "total_count": query.count()}

def list_accounts(db: Session, search: str | None, owner_user_id: int | None, page: int, page_size: int):
    q = db.query(SalesAccount)
    if search:
        q = q.filter(SalesAccount.name.ilike(f"%{search.strip()}%"))
    if owner_user_id:
        q = q.filter(SalesAccount.owner_user_id == owner_user_id)
    return _paginate(q.order_by(SalesAccount.updated_at.desc()), page, page_size)

def create_account(db: Session, payload: dict, user_id: int | None):
    obj = SalesAccount(**payload, created_by_user_id=user_id)
    db.add(obj); db.flush()
    db.add(SalesActivity(entity_type="account", entity_id=obj.id, type="system", subject="Account created", created_by=user_id))
    db.commit(); db.refresh(obj); return obj

def update_account(db: Session, account: SalesAccount, payload: dict):
    for k, v in payload.items(): setattr(account, k, v)
    db.commit(); db.refresh(account); return account

def create_contact(db: Session, payload: dict):
    obj = SalesContact(**payload)
    db.add(obj); db.commit(); db.refresh(obj); return obj

def list_opportunities(db: Session, search: str | None, stage: str | None, owner_user_id: int | None, page: int, page_size: int):
    q = db.query(Opportunity)
    if search: q = q.filter(Opportunity.name.ilike(f"%{search.strip()}%"))
    if stage: q = q.filter(Opportunity.stage == stage)
    if owner_user_id: q = q.filter(Opportunity.owner_user_id == owner_user_id)
    return _paginate(q.order_by(Opportunity.updated_at.desc()), page, page_size)

def create_opportunity(db: Session, payload: dict, user_id: int | None):
    if "probability" not in payload:
        cfg = db.query(OpportunityStageConfig).filter(OpportunityStageConfig.name == payload.get("stage")).first()
        payload["probability"] = cfg.probability_default if cfg else 10
    obj = Opportunity(**payload, created_by_user_id=user_id)
    db.add(obj); db.flush()
    db.add(SalesActivity(entity_type="opportunity", entity_id=obj.id, type="status_change", subject=f"Opportunity created in {obj.stage}", created_by=user_id))
    db.commit(); db.refresh(obj); return obj

def update_opportunity(db: Session, obj: Opportunity, payload: dict, user_id: int | None):
    before = obj.stage
    for k, v in payload.items(): setattr(obj, k, v)
    if payload.get("stage") and payload.get("stage") != before:
        db.add(SalesActivity(entity_type="opportunity", entity_id=obj.id, type="status_change", subject=f"Stage changed to {obj.stage}", created_by=user_id))
    db.commit(); db.refresh(obj); return obj

def _quote_totals(lines: list[dict]):
    subtotal = Decimal("0"); discount_total = Decimal("0"); out = []
    for line in lines:
        qty = Decimal(line.get("qty") or 0); unit = Decimal(line.get("unit_price") or 0); pct = Decimal(line.get("discount_pct") or 0)
        gross = qty * unit; disc = (gross * pct).quantize(Decimal("0.01")); total = gross - disc
        subtotal += gross; discount_total += disc
        out.append({**line, "discount_amount": disc, "line_total": total})
    return out, subtotal, discount_total, Decimal("0"), subtotal - discount_total

def create_quote(db: Session, payload: dict, user_id: int | None):
    lines = payload.pop("lines", [])
    normalized, subtotal, discount_total, tax_total, total = _quote_totals(lines)
    quote = Quote(**payload, quote_number=_next_number(db, "QT", Quote), version=1, subtotal=subtotal, discount_total=discount_total, tax_total=tax_total, total=total, approval_status="REQUESTED" if any(Decimal(l.get("discount_pct") or 0) > Decimal("0.10") for l in lines) else "NOT_REQUIRED", created_by_user_id=user_id)
    quote.lines = [QuoteLine(**l) for l in normalized]
    db.add(quote); db.flush()
    db.add(SalesActivity(entity_type="quote", entity_id=quote.id, type="system", subject="Quote created", created_by=user_id))
    db.commit(); db.refresh(quote); return quote

def list_quotes(db: Session, status: str | None, page: int, page_size: int):
    q = db.query(Quote)
    if status: q = q.filter(Quote.status == status)
    return _paginate(q.order_by(Quote.updated_at.desc()), page, page_size)


def get_quote(db: Session, quote_id: int):
    return (
        db.query(Quote)
        .options(
            joinedload(Quote.lines),
            joinedload(Quote.opportunity).joinedload(Opportunity.account),
        )
        .filter(Quote.id == quote_id)
        .first()
    )

def convert_quote_to_order(db: Session, quote: Quote, user_id: int | None):
    oppty = db.query(Opportunity).filter(Opportunity.id == quote.opportunity_id).first()
    order = SalesOrder(order_number=_next_number(db, "SO", SalesOrder), account_id=oppty.account_id, opportunity_id=oppty.id, quote_id=quote.id, status="DRAFT", order_date=date.today(), shipping_address=oppty.account.shipping_address if oppty and oppty.account else None, subtotal=quote.subtotal, tax_total=quote.tax_total, total=quote.total, created_by_user_id=user_id)
    order.lines = [SalesOrderLine(item_id=l.item_id, qty=l.qty, unit_price=l.unit_price, discount=l.discount_amount, line_total=l.line_total) for l in quote.lines]
    db.add(order); db.flush()
    db.add(SalesActivity(entity_type="order", entity_id=order.id, type="system", subject="Order created from quote", created_by=user_id))
    db.commit(); db.refresh(order); return order

def create_order(db: Session, payload: dict, user_id: int | None):
    lines = payload.pop("lines", [])
    quote_id = payload.get("quote_id")

    subtotal = Decimal("0")
    tax_total = Decimal("0")
    total = Decimal("0")
    order_lines: list[SalesOrderLine] = []

    if quote_id:
        quote = (
            db.query(Quote)
            .options(joinedload(Quote.lines))
            .filter(Quote.id == quote_id)
            .first()
        )
        if not quote:
            raise ValueError("Quote not found.")

        subtotal = Decimal(quote.subtotal or 0)
        tax_total = Decimal(quote.tax_total or 0)
        total = Decimal(quote.total or 0)
        order_lines = [
            SalesOrderLine(
                item_id=line.item_id,
                qty=line.qty,
                unit_price=line.unit_price,
                discount=line.discount_amount,
                line_total=line.line_total,
            )
            for line in quote.lines
        ]
    elif lines:
        normalized, subtotal, _, tax_total, total = _quote_totals(lines)
        order_lines = [
            SalesOrderLine(
                item_id=line.get("item_id"),
                qty=line.get("qty"),
                unit_price=line.get("unit_price"),
                discount=line.get("discount_amount") or Decimal("0"),
                line_total=line.get("line_total") or Decimal("0"),
            )
            for line in normalized
        ]

    obj = SalesOrder(
        **payload,
        order_number=_next_number(db, "SO", SalesOrder),
        status="DRAFT",
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        created_by_user_id=user_id,
    )
    obj.lines = order_lines
    db.add(obj); db.commit(); db.refresh(obj); return obj

def list_orders(db: Session, status: str | None, page: int, page_size: int):
    q = db.query(SalesOrder)
    if status: q = q.filter(SalesOrder.status == status)
    return _paginate(q.order_by(SalesOrder.updated_at.desc()), page, page_size)

def update_order_status(db: Session, order: SalesOrder, status: str, user_id: int | None):
    if status not in ORDER_STATUSES: raise ValueError("Invalid sales order status")
    order.status = status
    db.add(SalesActivity(entity_type="order", entity_id=order.id, type="status_change", subject=f"Order status changed to {status}", created_by=user_id))
    if status == "INVOICED" and not order.invoice_id:
        account = db.query(SalesAccount).filter(SalesAccount.id == order.account_id).first()
        customer_id = account.customer_id if account else None
        if not customer_id:
            customer = Customer(name=account.name if account else "Sales Order Customer")
            db.add(customer); db.flush(); customer_id = customer.id
            if account: account.customer_id = customer.id
        invoice = Invoice(customer_id=customer_id, invoice_number=_next_number(db, "INV", Invoice), status="DRAFT", issue_date=date.today(), due_date=date.today() + timedelta(days=30), subtotal=order.subtotal, tax_total=order.tax_total, total=order.total, amount_due=order.total, notes=f"Generated from {order.order_number}")
        invoice.lines = [InvoiceLine(item_id=l.item_id, description=f"Generated from {order.order_number}", quantity=l.qty, unit_price=l.unit_price, discount=l.discount, line_total=l.line_total) for l in order.lines]
        db.add(invoice); db.flush(); order.invoice_id = invoice.id
    db.commit(); db.refresh(order); return order

def list_activities(db: Session, entity_type: str | None, entity_id: int | None, page: int, page_size: int):
    q = db.query(SalesActivity)
    if entity_type: q = q.filter(SalesActivity.entity_type == entity_type)
    if entity_id: q = q.filter(SalesActivity.entity_id == entity_id)
    return _paginate(q.order_by(SalesActivity.created_at.desc()), page, page_size)

def create_activity(db: Session, payload: dict, user_id: int | None):
    obj = SalesActivity(**payload, created_by=user_id)
    db.add(obj); db.commit(); db.refresh(obj); return obj

def list_pricebooks(db: Session):
    return db.query(PriceBook).order_by(PriceBook.is_default.desc(), PriceBook.name.asc()).all()

def reports_summary(db: Session):
    thirty_days_ago = datetime.utcnow().date() - timedelta(days=30)
    pipeline_value = db.query(func.coalesce(func.sum(Opportunity.amount_estimate), 0)).filter(~Opportunity.stage.in_(["Closed Won", "Closed Lost"])).scalar() or 0
    open_opportunities = db.query(func.count(Opportunity.id)).filter(~Opportunity.stage.in_(["Closed Won", "Closed Lost"])).scalar() or 0
    quotes_pending_approval = db.query(func.count(Quote.id)).filter(Quote.approval_status == "REQUESTED").scalar() or 0
    orders_pending_fulfillment = db.query(func.count(SalesOrder.id)).filter(SalesOrder.status.in_(["CONFIRMED", "ALLOCATED"])).scalar() or 0
    won_last_30d = db.query(func.coalesce(func.sum(Opportunity.amount_estimate), 0)).filter(Opportunity.stage == "Closed Won", Opportunity.updated_at >= thirty_days_ago).scalar() or 0
    by_stage = [{"stage": s, "count": c, "amount": a} for s, c, a in db.query(Opportunity.stage, func.count(Opportunity.id), func.coalesce(func.sum(Opportunity.amount_estimate), 0)).group_by(Opportunity.stage).all()]
    return {"pipeline_value": pipeline_value, "open_opportunities": open_opportunities, "quotes_pending_approval": quotes_pending_approval, "orders_pending_fulfillment": orders_pending_fulfillment, "won_last_30d": won_last_30d, "by_stage": by_stage}


def pipeline_trend(db: Session, months: int = 12):
    months = max(1, min(months, 24))
    today = datetime.utcnow().date().replace(day=1)
    month_starts = []
    cursor = today
    for _ in range(months):
        month_starts.append(cursor)
        cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
    month_starts = list(reversed(month_starts))

    trend = []
    for month_start in month_starts:
        if month_start.month == 12:
            next_month = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            next_month = month_start.replace(month=month_start.month + 1, day=1)
        value = (
            db.query(func.coalesce(func.sum(Opportunity.amount_estimate), 0))
            .filter(Opportunity.created_at >= month_start, Opportunity.created_at < next_month)
            .scalar()
            or 0
        )
        trend.append({"period": month_start.strftime("%b %y"), "value": value})
    return trend


def conversion_summary(db: Session):
    return {
        "quotes": db.query(func.count(Quote.id)).scalar() or 0,
        "orders": db.query(func.count(SalesOrder.id)).scalar() or 0,
        "invoices": db.query(func.count(SalesOrder.id)).filter(SalesOrder.invoice_id.isnot(None)).scalar() or 0,
    }
