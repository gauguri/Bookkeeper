from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import Customer, Invoice, InvoiceLine, Opportunity, OpportunityStageConfig, PriceBook, Quote, QuoteLine, SalesAccount, SalesActivity, SalesContact, SalesOrder, SalesOrderLine
from app.sales_management.deal_desk import evaluate_quote_record, normalize_discount_pct
from app.sales_management.order_execution import generate_invoice_from_sales_order, get_allowed_sales_order_status_transitions, sync_sales_order_reservations

ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ALLOCATED", "FULFILLED", "INVOICED", "CLOSED"]
FOLLOW_UP_TYPE = "follow_up"
FOLLOW_UP_OPEN_STATUSES = {"OPEN", "SNOOZED"}
FOLLOW_UP_ALLOWED_STATUSES = FOLLOW_UP_OPEN_STATUSES | {"DONE", "CANCELLED"}
FOLLOW_UP_ALLOWED_PRIORITIES = {"LOW", "MEDIUM", "HIGH"}
STALE_OPPORTUNITY_DAYS = 7
STALE_QUOTE_DAYS = 3


def _next_number(db: Session, prefix: str, model) -> str:
    latest = db.query(model).order_by(model.id.desc()).first()
    return f"{prefix}-{(latest.id if latest else 0) + 1:05d}"


def _paginate(query, page: int, page_size: int):
    return {"items": query.offset(page * page_size).limit(page_size).all(), "total_count": query.count()}


def _normalize_follow_up_status(value: str | None) -> str:
    normalized = (value or "OPEN").strip().upper()
    if normalized not in FOLLOW_UP_ALLOWED_STATUSES:
        raise ValueError("Invalid follow-up status.")
    return normalized


def _normalize_follow_up_priority(value: str | None) -> str:
    normalized = (value or "MEDIUM").strip().upper()
    if normalized not in FOLLOW_UP_ALLOWED_PRIORITIES:
        raise ValueError("Invalid follow-up priority.")
    return normalized


def _follow_up_age_days(created_at: datetime | None) -> int:
    if created_at is None:
        return 0
    return max(0, (datetime.utcnow().date() - created_at.date()).days)


def list_accounts(db: Session, search: str | None, owner_user_id: int | None, page: int, page_size: int):
    q = db.query(SalesAccount)
    if search:
        q = q.filter(SalesAccount.name.ilike(f"%{search.strip()}%"))
    if owner_user_id:
        q = q.filter(SalesAccount.owner_user_id == owner_user_id)
    return _paginate(q.order_by(SalesAccount.updated_at.desc()), page, page_size)


def create_account(db: Session, payload: dict, user_id: int | None):
    obj = SalesAccount(**payload, created_by_user_id=user_id)
    db.add(obj)
    db.flush()
    db.add(SalesActivity(entity_type="account", entity_id=obj.id, type="system", subject="Account created", created_by=user_id))
    db.commit()
    db.refresh(obj)
    return obj


def update_account(db: Session, account: SalesAccount, payload: dict):
    for k, v in payload.items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return account


def create_contact(db: Session, payload: dict):
    obj = SalesContact(**payload)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_opportunities(db: Session, search: str | None, stage: str | None, owner_user_id: int | None, page: int, page_size: int):
    q = db.query(Opportunity)
    if search:
        q = q.filter(Opportunity.name.ilike(f"%{search.strip()}%"))
    if stage:
        q = q.filter(Opportunity.stage == stage)
    if owner_user_id:
        q = q.filter(Opportunity.owner_user_id == owner_user_id)
    return _paginate(q.order_by(Opportunity.updated_at.desc()), page, page_size)


def create_opportunity(db: Session, payload: dict, user_id: int | None):
    if "probability" not in payload:
        cfg = db.query(OpportunityStageConfig).filter(OpportunityStageConfig.name == payload.get("stage")).first()
        payload["probability"] = cfg.probability_default if cfg else 10
    obj = Opportunity(**payload, created_by_user_id=user_id)
    db.add(obj)
    db.flush()
    db.add(SalesActivity(entity_type="opportunity", entity_id=obj.id, type="status_change", subject=f"Opportunity created in {obj.stage}", created_by=user_id))
    db.commit()
    db.refresh(obj)
    return obj


def update_opportunity(db: Session, obj: Opportunity, payload: dict, user_id: int | None):
    before = obj.stage
    for k, v in payload.items():
        setattr(obj, k, v)
    if payload.get("stage") and payload.get("stage") != before:
        db.add(SalesActivity(entity_type="opportunity", entity_id=obj.id, type="status_change", subject=f"Stage changed to {obj.stage}", created_by=user_id))
    db.commit()
    db.refresh(obj)
    return obj


def _quote_totals(lines: list[dict]):
    subtotal = Decimal("0")
    discount_total = Decimal("0")
    normalized_lines = []
    for line in lines:
        qty = Decimal(line.get("qty") or 0)
        unit = Decimal(line.get("unit_price") or 0)
        pct = normalize_discount_pct(line.get("discount_pct") or 0)
        gross = qty * unit
        disc = (gross * pct).quantize(Decimal("0.01"))
        total = gross - disc
        subtotal += gross
        discount_total += disc
        normalized_lines.append({**line, "discount_pct": pct, "discount_amount": disc, "line_total": total})
    return normalized_lines, subtotal, discount_total, Decimal("0"), subtotal - discount_total


def create_quote(db: Session, payload: dict, user_id: int | None):
    lines = payload.pop("lines", [])
    normalized, subtotal, discount_total, tax_total, total = _quote_totals(lines)
    quote = Quote(
        **payload,
        quote_number=_next_number(db, "QT", Quote),
        version=1,
        subtotal=subtotal,
        discount_total=discount_total,
        tax_total=tax_total,
        total=total,
        approval_status="NOT_REQUIRED",
        created_by_user_id=user_id,
    )
    quote.lines = [QuoteLine(**line) for line in normalized]
    db.add(quote)
    db.flush()
    evaluation = evaluate_quote_record(db, quote)
    quote.approval_status = "REQUESTED" if evaluation["summary"]["approval_required"] else "NOT_REQUIRED"
    subject = "Quote created" if quote.approval_status == "NOT_REQUIRED" else "Quote created and routed for approval"
    db.add(SalesActivity(entity_type="quote", entity_id=quote.id, type="system", subject=subject, created_by=user_id))
    db.commit()
    db.refresh(quote)
    return quote


def list_quotes(db: Session, status: str | None, page: int, page_size: int):
    q = db.query(Quote)
    if status:
        q = q.filter(Quote.status == status)
    return _paginate(q.order_by(Quote.updated_at.desc()), page, page_size)


def get_quote(db: Session, quote_id: int):
    return (
        db.query(Quote)
        .options(joinedload(Quote.lines), joinedload(Quote.opportunity).joinedload(Opportunity.account))
        .filter(Quote.id == quote_id)
        .first()
    )


def convert_quote_to_order(db: Session, quote: Quote, user_id: int | None):
    if quote.approval_status == "REQUESTED":
        raise ValueError("Quote requires approval before conversion to order.")
    oppty = db.query(Opportunity).filter(Opportunity.id == quote.opportunity_id).first()
    order = SalesOrder(
        order_number=_next_number(db, "SO", SalesOrder),
        account_id=oppty.account_id,
        opportunity_id=oppty.id,
        quote_id=quote.id,
        status="DRAFT",
        order_date=date.today(),
        shipping_address=oppty.account.shipping_address if oppty and oppty.account else None,
        subtotal=quote.subtotal,
        tax_total=quote.tax_total,
        total=quote.total,
        created_by_user_id=user_id,
    )
    order.lines = [
        SalesOrderLine(item_id=line.item_id, qty=line.qty, unit_price=line.unit_price, discount=line.discount_amount, line_total=line.line_total)
        for line in quote.lines
    ]
    db.add(order)
    db.flush()
    db.add(SalesActivity(entity_type="order", entity_id=order.id, type="system", subject="Order created from quote", created_by=user_id))
    db.commit()
    db.refresh(order)
    return order


def create_order(db: Session, payload: dict, user_id: int | None):
    lines = payload.pop("lines", [])
    quote_id = payload.get("quote_id")

    subtotal = Decimal("0")
    tax_total = Decimal("0")
    total = Decimal("0")
    order_lines: list[SalesOrderLine] = []

    if quote_id:
        quote = db.query(Quote).options(joinedload(Quote.lines)).filter(Quote.id == quote_id).first()
        if not quote:
            raise ValueError("Quote not found.")
        if quote.approval_status == "REQUESTED":
            raise ValueError("Quote requires approval before order creation.")
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
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_orders(db: Session, status: str | None, page: int, page_size: int):
    q = db.query(SalesOrder)
    if status:
        q = q.filter(SalesOrder.status == status)
    return _paginate(q.order_by(SalesOrder.updated_at.desc()), page, page_size)


def update_order_status(db: Session, order: SalesOrder, status: str, user_id: int | None):
    if status not in ORDER_STATUSES:
        raise ValueError("Invalid sales order status")
    if status == order.status:
        return order
    allowed_transitions = get_allowed_sales_order_status_transitions(order)
    if status not in allowed_transitions:
        raise ValueError(f"Cannot move sales order from {order.status} to {status}.")

    previous_status = order.status
    if status == "INVOICED" and not order.invoice_id:
        generate_invoice_from_sales_order(db, order)
    else:
        order.status = status
        sync_sales_order_reservations(db, order)

    if previous_status != order.status:
        db.add(SalesActivity(entity_type="order", entity_id=order.id, type="status_change", subject=f"Order status changed to {order.status}", created_by=user_id))

    db.commit()
    db.refresh(order)
    return order


def list_activities(db: Session, entity_type: str | None, entity_id: int | None, page: int, page_size: int):
    q = db.query(SalesActivity)
    if entity_type:
        q = q.filter(SalesActivity.entity_type == entity_type)
    if entity_id:
        q = q.filter(SalesActivity.entity_id == entity_id)
    return _paginate(q.order_by(SalesActivity.created_at.desc()), page, page_size)


def create_activity(db: Session, payload: dict, user_id: int | None):
    obj = SalesActivity(**payload, created_by=user_id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_follow_ups(
    db: Session,
    *,
    owner_user_id: int | None,
    status: str | None,
    entity_type: str | None,
    entity_id: int | None,
    include_completed: bool,
    page: int,
    page_size: int,
):
    q = db.query(SalesActivity).filter(SalesActivity.type == FOLLOW_UP_TYPE)
    if owner_user_id is not None:
        q = q.filter(SalesActivity.owner_user_id == owner_user_id)
    if status:
        q = q.filter(SalesActivity.status == _normalize_follow_up_status(status))
    elif not include_completed:
        q = q.filter(SalesActivity.status.in_(sorted(FOLLOW_UP_OPEN_STATUSES)))
    if entity_type:
        q = q.filter(SalesActivity.entity_type == entity_type)
    if entity_id is not None:
        q = q.filter(SalesActivity.entity_id == entity_id)
    return _paginate(q.order_by(SalesActivity.due_date.asc().nullslast(), SalesActivity.created_at.desc()), page, page_size)


def create_follow_up(db: Session, payload: dict, user_id: int | None):
    obj = SalesActivity(
        entity_type=payload["entity_type"],
        entity_id=payload["entity_id"],
        type=FOLLOW_UP_TYPE,
        subject=payload["subject"],
        body=payload.get("body"),
        due_date=payload.get("due_date"),
        priority=_normalize_follow_up_priority(payload.get("priority")),
        status="OPEN",
        owner_user_id=payload.get("owner_user_id") or user_id,
        created_by=user_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_follow_up(db: Session, activity_id: int, payload: dict):
    obj = db.query(SalesActivity).filter(SalesActivity.id == activity_id, SalesActivity.type == FOLLOW_UP_TYPE).first()
    if not obj:
        raise ValueError("Follow-up not found.")
    for field in ("subject", "body", "due_date", "owner_user_id"):
        if field in payload:
            setattr(obj, field, payload[field])
    if "priority" in payload:
        obj.priority = _normalize_follow_up_priority(payload.get("priority"))
    if "status" in payload:
        obj.status = _normalize_follow_up_status(payload.get("status"))
        obj.completed_at = datetime.utcnow() if obj.status == "DONE" else None
    db.commit()
    db.refresh(obj)
    return obj


def complete_follow_up(db: Session, activity_id: int):
    obj = db.query(SalesActivity).filter(SalesActivity.id == activity_id, SalesActivity.type == FOLLOW_UP_TYPE).first()
    if not obj:
        raise ValueError("Follow-up not found.")
    obj.status = "DONE"
    obj.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj


def follow_up_summary(db: Session, owner_user_id: int | None = None):
    today = datetime.utcnow().date()
    follow_up_query = db.query(SalesActivity).filter(SalesActivity.type == FOLLOW_UP_TYPE)
    if owner_user_id is not None:
        follow_up_query = follow_up_query.filter(SalesActivity.owner_user_id == owner_user_id)

    open_query = follow_up_query.filter(SalesActivity.status.in_(sorted(FOLLOW_UP_OPEN_STATUSES)))
    due_today = open_query.filter(SalesActivity.due_date == today).order_by(SalesActivity.created_at.desc()).limit(10).all()
    overdue = open_query.filter(SalesActivity.due_date.is_not(None), SalesActivity.due_date < today).order_by(SalesActivity.due_date.asc(), SalesActivity.created_at.desc()).limit(10).all()

    recent_activity_subquery = (
        db.query(
            SalesActivity.entity_type.label("entity_type"),
            SalesActivity.entity_id.label("entity_id"),
            func.max(SalesActivity.created_at).label("last_activity_at"),
        )
        .group_by(SalesActivity.entity_type, SalesActivity.entity_id)
        .subquery()
    )

    stale_opportunity_cutoff = datetime.utcnow() - timedelta(days=STALE_OPPORTUNITY_DAYS)
    stale_opportunities = (
        db.query(Opportunity, recent_activity_subquery.c.last_activity_at)
        .outerjoin(
            recent_activity_subquery,
            (recent_activity_subquery.c.entity_type == "opportunity") & (recent_activity_subquery.c.entity_id == Opportunity.id),
        )
        .filter(~Opportunity.stage.in_(["Closed Won", "Closed Lost"]))
        .filter(
            (recent_activity_subquery.c.last_activity_at.is_(None) & (Opportunity.updated_at < stale_opportunity_cutoff))
            | (recent_activity_subquery.c.last_activity_at < stale_opportunity_cutoff)
            | ((Opportunity.expected_close_date.is_not(None)) & (Opportunity.expected_close_date < today))
        )
        .order_by(Opportunity.updated_at.asc())
        .limit(10)
        .all()
    )

    stale_quote_cutoff = datetime.utcnow() - timedelta(days=STALE_QUOTE_DAYS)
    stale_quotes = (
        db.query(Quote, recent_activity_subquery.c.last_activity_at)
        .outerjoin(
            recent_activity_subquery,
            (recent_activity_subquery.c.entity_type == "quote") & (recent_activity_subquery.c.entity_id == Quote.id),
        )
        .filter(Quote.status != "ACCEPTED")
        .filter(
            (recent_activity_subquery.c.last_activity_at.is_(None) & (Quote.updated_at < stale_quote_cutoff))
            | (recent_activity_subquery.c.last_activity_at < stale_quote_cutoff)
        )
        .order_by(Quote.updated_at.asc())
        .limit(10)
        .all()
    )

    def _serialize_follow_up_item(item: SalesActivity) -> dict:
        return {
            "id": item.id,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "subject": item.subject,
            "due_date": item.due_date,
            "priority": item.priority or "MEDIUM",
            "status": item.status or "OPEN",
            "owner_user_id": item.owner_user_id,
            "age_days": _follow_up_age_days(item.created_at),
        }

    def _serialize_stale_item(item, entity_type: str, subject: str, owner_id: int | None = None) -> dict:
        return {
            "id": item.id,
            "entity_type": entity_type,
            "entity_id": item.id,
            "subject": subject,
            "due_date": None,
            "priority": "HIGH",
            "status": "OPEN",
            "owner_user_id": owner_id,
            "age_days": _follow_up_age_days(item.updated_at),
        }

    return {
        "open_count": open_query.count(),
        "due_today_count": open_query.filter(SalesActivity.due_date == today).count(),
        "overdue_count": open_query.filter(SalesActivity.due_date.is_not(None), SalesActivity.due_date < today).count(),
        "stale_opportunities_count": len(stale_opportunities),
        "stale_quotes_count": len(stale_quotes),
        "due_today": [_serialize_follow_up_item(item) for item in due_today],
        "overdue": [_serialize_follow_up_item(item) for item in overdue],
        "stale_opportunities": [
            _serialize_stale_item(opportunity, "opportunity", f"Opportunity '{opportunity.name}' needs follow-up.", opportunity.owner_user_id)
            for opportunity, _last_activity_at in stale_opportunities
        ],
        "stale_quotes": [
            _serialize_stale_item(quote, "quote", f"Quote {quote.quote_number} needs follow-up.")
            for quote, _last_activity_at in stale_quotes
        ],
    }


def list_pricebooks(db: Session):
    return db.query(PriceBook).order_by(PriceBook.is_default.desc(), PriceBook.name.asc()).all()


def reports_summary(db: Session):
    thirty_days_ago = datetime.utcnow().date() - timedelta(days=30)
    pipeline_value = db.query(func.coalesce(func.sum(Opportunity.amount_estimate), 0)).filter(~Opportunity.stage.in_(["Closed Won", "Closed Lost"])).scalar() or 0
    open_opportunities = db.query(func.count(Opportunity.id)).filter(~Opportunity.stage.in_(["Closed Won", "Closed Lost"])).scalar() or 0
    quotes_pending_approval = db.query(func.count(Quote.id)).filter(Quote.approval_status == "REQUESTED").scalar() or 0
    orders_pending_fulfillment = db.query(func.count(SalesOrder.id)).filter(SalesOrder.status.in_(["CONFIRMED", "ALLOCATED"])).scalar() or 0
    won_last_30d = db.query(func.coalesce(func.sum(Opportunity.amount_estimate), 0)).filter(Opportunity.stage == "Closed Won", Opportunity.updated_at >= thirty_days_ago).scalar() or 0
    by_stage = [{"stage": stage, "count": count, "amount": amount} for stage, count, amount in db.query(Opportunity.stage, func.count(Opportunity.id), func.coalesce(func.sum(Opportunity.amount_estimate), 0)).group_by(Opportunity.stage).all()]
    return {
        "pipeline_value": pipeline_value,
        "open_opportunities": open_opportunities,
        "quotes_pending_approval": quotes_pending_approval,
        "orders_pending_fulfillment": orders_pending_fulfillment,
        "won_last_30d": won_last_30d,
        "by_stage": by_stage,
    }


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




