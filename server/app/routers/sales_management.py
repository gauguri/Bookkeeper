from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_module
from app.db import get_db
from app.models import Opportunity, Quote, SalesAccount, SalesOrder, SalesRequest
from app.module_keys import ModuleKey
from app.sales_management import schemas
from app.sales_management.deal_desk import approve_quote, evaluate_deal, evaluate_quote_record, revenue_control_summary
from app.sales_management.order_execution import generate_invoice_from_sales_order, get_sales_order_360
from app.sales_management.service import (
    complete_follow_up,
    conversion_summary,
    convert_quote_to_order,
    create_account,
    create_activity,
    create_contact,
    create_follow_up,
    create_opportunity,
    create_order,
    create_quote,
    follow_up_summary,
    get_quote,
    list_accounts,
    list_activities,
    list_follow_ups,
    list_opportunities,
    list_orders,
    list_pricebooks,
    list_quotes,
    pipeline_trend,
    reports_summary,
    update_account,
    update_follow_up,
    update_opportunity,
    update_order_status,
)

router = APIRouter(prefix="/api/sales", tags=["sales-management"])


APPROVER_ROLES = {"admin", "sales_manager", "finance_manager", "controller", "owner"}


def _assert_quote_approver(user):
    if user and (user.is_admin or (user.role or "").lower() in APPROVER_ROLES):
        return
    raise HTTPException(status_code=403, detail="Quote approval requires manager or admin access.")


@router.get("/accounts", response_model=schemas.Page[schemas.SalesAccountResponse])
def get_accounts(
    search: str | None = None,
    owner_user_id: int | None = None,
    page: int = Query(0, ge=0),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    return list_accounts(db, search, owner_user_id, page, page_size)


@router.get("/accounts/{account_id}", response_model=schemas.SalesAccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    account = db.query(SalesAccount).filter(SalesAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return account


@router.post("/accounts", response_model=schemas.SalesAccountResponse, status_code=status.HTTP_201_CREATED)
def post_account(payload: schemas.SalesAccountCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_account(db, payload.model_dump(), user.id if user else None)


@router.put("/accounts/{account_id}", response_model=schemas.SalesAccountResponse)
def put_account(account_id: int, payload: schemas.SalesAccountUpdate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    obj = db.query(SalesAccount).filter(SalesAccount.id == account_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Account not found.")
    return update_account(db, obj, payload.model_dump(exclude_unset=True))


@router.post("/contacts", response_model=schemas.SalesContactResponse, status_code=status.HTTP_201_CREATED)
def post_contact(payload: schemas.SalesContactCreate, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_contact(db, payload.model_dump())


@router.get("/opportunities", response_model=schemas.Page[schemas.OpportunityResponse])
def get_opportunities(search: str | None = None, stage: str | None = None, owner_user_id: int | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_opportunities(db, search, stage, owner_user_id, page, page_size)


@router.post("/opportunities", response_model=schemas.OpportunityResponse, status_code=status.HTTP_201_CREATED)
def post_opportunity(payload: schemas.OpportunityCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_opportunity(db, payload.model_dump(), user.id if user else None)


@router.get("/opportunities/{opportunity_id}", response_model=schemas.OpportunityResponse)
def get_opportunity(opportunity_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    opportunity = db.query(Opportunity).filter(Opportunity.id == opportunity_id).first()
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found.")
    return opportunity


@router.put("/opportunities/{opportunity_id}", response_model=schemas.OpportunityResponse)
def put_opportunity(opportunity_id: int, payload: schemas.OpportunityUpdate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    obj = db.query(Opportunity).filter(Opportunity.id == opportunity_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Opportunity not found.")
    return update_opportunity(db, obj, payload.model_dump(exclude_unset=True), user.id if user else None)


@router.get("/quotes", response_model=schemas.Page[schemas.QuoteResponse])
def get_quotes(status: str | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_quotes(db, status, page, page_size)


@router.post("/quotes/evaluate", response_model=schemas.DealDeskEvaluationResponse)
def evaluate_quote(payload: schemas.DealDeskEvaluationRequest, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    try:
        return evaluate_deal(
            db,
            opportunity_id=payload.opportunity_id,
            lines_payload=[line.model_dump() for line in payload.lines],
            valid_until=payload.valid_until,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/quotes", response_model=schemas.QuoteResponse, status_code=status.HTTP_201_CREATED)
def post_quote(payload: schemas.QuoteCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_quote(db, payload.model_dump(), user.id if user else None)


@router.get("/quotes/{quote_id}", response_model=schemas.QuoteDetailResponse)
def get_quote_by_id(quote_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    quote = get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found.")

    opportunity = quote.opportunity
    account = opportunity.account if opportunity else None
    return schemas.QuoteDetailResponse(
        id=quote.id,
        opportunity_id=quote.opportunity_id,
        quote_number=quote.quote_number,
        version=quote.version,
        status=quote.status,
        valid_until=quote.valid_until,
        notes=quote.notes,
        subtotal=quote.subtotal,
        discount_total=quote.discount_total,
        tax_total=quote.tax_total,
        total=quote.total,
        approval_status=quote.approval_status,
        lines=quote.lines or [],
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        opportunity={
            "id": opportunity.id,
            "name": opportunity.name,
            "account_id": opportunity.account_id,
            "account_name": account.name if account else None,
        } if opportunity else None,
    )


@router.get("/quotes/{quote_id}/deal-desk", response_model=schemas.DealDeskEvaluationResponse)
def get_quote_deal_desk(quote_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    quote = get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found.")
    return evaluate_quote_record(db, quote)


@router.post("/quotes/{quote_id}/approve", response_model=schemas.QuoteResponse)
def approve_quote_endpoint(quote_id: int, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    _assert_quote_approver(user)
    quote = get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found.")
    approve_quote(db, quote, approver_user_id=user.id if user else None)
    db.commit()
    db.refresh(quote)
    return quote


@router.post("/quotes/{quote_id}/convert-to-order", response_model=schemas.SalesOrderResponse)
def post_convert_quote(quote_id: int, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found.")
    try:
        return convert_quote_to_order(db, quote, user.id if user else None)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/orders", response_model=schemas.Page[schemas.SalesOrderResponse])
def get_orders(status: str | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_orders(db, status, page, page_size)


@router.get("/orders/{order_id}", response_model=schemas.SalesOrderResponse)
def get_order_by_id(order_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found.")
    return order


@router.post("/orders", response_model=schemas.SalesOrderResponse, status_code=status.HTTP_201_CREATED)
def post_orders(payload: schemas.SalesOrderCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    try:
        return create_order(db, payload.model_dump(), user.id if user else None)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

@router.get("/orders/{order_id}/360", response_model=schemas.SalesOrderExecutionResponse)
def get_order_execution(order_id: int, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    order = get_sales_order_360(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found.")
    return order


@router.post("/orders/{order_id}/generate-invoice", response_model=schemas.SalesOrderExecutionResponse)
def post_order_generate_invoice(order_id: int, payload: schemas.GenerateInvoiceFromOrderRequest, db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found.")
    try:
        invoice_payload = payload.model_dump(exclude_none=True)
        if not invoice_payload.get("issue_date"):
            invoice_payload.pop("issue_date", None)
        if not invoice_payload.get("due_date"):
            invoice_payload.pop("due_date", None)
        generate_invoice_from_sales_order(db, order, invoice_payload if invoice_payload else None)
        db.commit()
        refreshed = get_sales_order_360(db, order_id)
        if not refreshed:
            raise HTTPException(status_code=404, detail="Sales order not found after invoice generation.")
        return refreshed
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/orders/{order_id}/status", response_model=schemas.SalesOrderResponse)
def post_order_status(order_id: int, payload: schemas.SalesOrderStatusUpdate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found.")
    try:
        return update_order_status(db, order, payload.status, user.id if user else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/activities", response_model=schemas.Page[schemas.ActivityResponse])
def get_activities(entity_type: str | None = None, entity_id: int | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_activities(db, entity_type, entity_id, page, page_size)


@router.post("/activities", response_model=schemas.ActivityResponse, status_code=status.HTTP_201_CREATED)
def post_activity(payload: schemas.ActivityCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_activity(db, payload.model_dump(), user.id if user else None)


@router.get("/follow-ups", response_model=schemas.Page[schemas.FollowUpResponse])
def get_follow_ups(
    owner_user_id: int | None = None,
    status: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    include_completed: bool = False,
    page: int = Query(0, ge=0),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    try:
        return list_follow_ups(
            db,
            owner_user_id=owner_user_id,
            status=status,
            entity_type=entity_type,
            entity_id=entity_id,
            include_completed=include_completed,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/follow-ups", response_model=schemas.FollowUpResponse, status_code=status.HTTP_201_CREATED)
def post_follow_up(
    payload: schemas.FollowUpCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    try:
        return create_follow_up(db, payload.model_dump(), user.id if user else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/follow-ups/{activity_id}", response_model=schemas.FollowUpResponse)
def patch_follow_up(
    activity_id: int,
    payload: schemas.FollowUpUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    try:
        return update_follow_up(db, activity_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@router.post("/follow-ups/{activity_id}/complete", response_model=schemas.FollowUpResponse)
def post_complete_follow_up(
    activity_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    try:
        return complete_follow_up(db, activity_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/pricebooks", response_model=list[schemas.PriceBookResponse])
def get_pricebooks(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_pricebooks(db)


@router.get("/reports/summary", response_model=schemas.ReportSummary)
def get_reports_summary(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return reports_summary(db)


@router.get("/reports/pipeline_trend", response_model=list[schemas.PipelineTrendPoint])
def get_pipeline_trend(months: int = Query(12, ge=1, le=24), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return pipeline_trend(db, months=months)


@router.get("/reports/stage_distribution", response_model=list[schemas.PipelineSummaryRow])
def get_stage_distribution(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return reports_summary(db).get("by_stage", [])


@router.get("/reports/conversion_summary", response_model=schemas.ConversionSummary)
def get_conversion_summary(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return conversion_summary(db)


@router.get("/reports/revenue_control_tower", response_model=schemas.RevenueControlSummaryResponse)
def get_revenue_control_tower_summary(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return revenue_control_summary(db)


@router.get("/reports/follow-up-summary", response_model=schemas.FollowUpSummaryResponse)
def get_follow_up_summary(
    owner_user_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.SALES_REQUESTS.value)),
):
    return follow_up_summary(db, owner_user_id=owner_user_id)


@router.post("/sales-requests/{sales_request_id}/convert-to-opportunity", response_model=schemas.OpportunityResponse)
def convert_sales_request_to_opportunity(sales_request_id: int, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    sales_request = db.query(SalesRequest).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    account = db.query(SalesAccount).filter(SalesAccount.customer_id == sales_request.customer_id).first() if sales_request.customer_id else None
    if not account:
        account = create_account(
            db,
            {
                "customer_id": sales_request.customer_id,
                "name": sales_request.customer.name if sales_request.customer else (sales_request.customer_name or f"Request {sales_request.request_number}"),
                "phone": sales_request.customer.phone if sales_request.customer else None,
                "billing_address": sales_request.customer.billing_address if sales_request.customer else None,
                "shipping_address": sales_request.customer.shipping_address if sales_request.customer else None,
            },
            user.id if user else None,
        )
    return create_opportunity(
        db,
        {
            "account_id": account.id,
            "name": f"Opportunity from {sales_request.request_number}",
            "stage": "Qualification",
            "amount_estimate": sum((line.line_total or 0) for line in sales_request.lines),
            "source": "Sales Request",
            "next_step": "Review and send quote",
            "owner_user_id": user.id if user else None,
        },
        user.id if user else None,
    )



