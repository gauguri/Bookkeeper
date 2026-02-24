from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_module
from app.db import get_db
from app.models import Opportunity, Quote, SalesAccount, SalesOrder, SalesRequest
from app.module_keys import ModuleKey
from app.sales_management import schemas
from app.sales_management.service import (
    convert_quote_to_order,
    create_account,
    create_activity,
    create_contact,
    create_opportunity,
    create_order,
    create_quote,
    list_accounts,
    list_activities,
    list_opportunities,
    list_orders,
    list_pricebooks,
    list_quotes,
    reports_summary,
    update_account,
    update_opportunity,
    update_order_status,
)

router = APIRouter(prefix="/api/sales", tags=["sales-management"])

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

@router.put("/opportunities/{opportunity_id}", response_model=schemas.OpportunityResponse)
def put_opportunity(opportunity_id: int, payload: schemas.OpportunityUpdate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    obj = db.query(Opportunity).filter(Opportunity.id == opportunity_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Opportunity not found.")
    return update_opportunity(db, obj, payload.model_dump(exclude_unset=True), user.id if user else None)

@router.get("/quotes", response_model=schemas.Page[schemas.QuoteResponse])
def get_quotes(status: str | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_quotes(db, status, page, page_size)

@router.post("/quotes", response_model=schemas.QuoteResponse, status_code=status.HTTP_201_CREATED)
def post_quote(payload: schemas.QuoteCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_quote(db, payload.model_dump(), user.id if user else None)

@router.post("/quotes/{quote_id}/convert-to-order", response_model=schemas.SalesOrderResponse)
def post_convert_quote(quote_id: int, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found.")
    return convert_quote_to_order(db, quote, user.id if user else None)

@router.get("/orders", response_model=schemas.Page[schemas.SalesOrderResponse])
def get_orders(status: str | None = None, page: int = Query(0, ge=0), page_size: int = Query(25, ge=1, le=200), db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_orders(db, status, page, page_size)

@router.post("/orders", response_model=schemas.SalesOrderResponse, status_code=status.HTTP_201_CREATED)
def post_orders(payload: schemas.SalesOrderCreate, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return create_order(db, payload.model_dump(), user.id if user else None)

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

@router.get("/pricebooks", response_model=list[schemas.PriceBookResponse])
def get_pricebooks(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return list_pricebooks(db)

@router.get("/reports/summary", response_model=schemas.ReportSummary)
def get_reports_summary(db: Session = Depends(get_db), _=Depends(require_module(ModuleKey.SALES_REQUESTS.value))):
    return reports_summary(db)

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
