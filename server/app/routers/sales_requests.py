from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.auth import get_current_user, require_module
from app.module_keys import ModuleKey
from app.models import SalesRequest
from app.sales_requests import schemas
from app.sales_requests.service import (
    calculate_sales_request_total,
    InventoryQuantityExceededError,
    create_sales_request,
    generate_invoice_from_sales_request,
    get_sales_request_detail,
    SalesRequestImmutableError,
    update_open_sales_request,
    update_sales_request_status,
)


router = APIRouter(
    prefix="/api/sales-requests",
    tags=["sales-requests"],
    dependencies=[Depends(require_module(ModuleKey.SALES_REQUESTS.value))],
)


def _to_response(sales_request: SalesRequest) -> schemas.SalesRequestResponse:
    return schemas.SalesRequestResponse(
        id=sales_request.id,
        request_number=sales_request.request_number,
        customer_id=sales_request.customer_id,
        customer_name=sales_request.customer_name,
        status=sales_request.status,
        created_at=sales_request.created_at,
        updated_at=sales_request.updated_at,
        created_by_user_id=sales_request.created_by_user_id,
        notes=sales_request.notes,
        requested_fulfillment_date=sales_request.requested_fulfillment_date,
        total_amount=Decimal(calculate_sales_request_total(sales_request)),
        lines=sales_request.lines,
    )


@router.get("", response_model=List[schemas.SalesRequestResponse])
def list_sales_requests(
    status_filter: Optional[schemas.SalesRequestStatus] = Query(None, alias="status"),
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(SalesRequest).options(selectinload(SalesRequest.lines)).order_by(SalesRequest.created_at.desc())
    if status_filter:
        query = query.filter(SalesRequest.status == status_filter)
    if customer:
        like_value = f"%{customer.strip()}%"
        query = query.filter(SalesRequest.customer_name.ilike(like_value))
    return [_to_response(request) for request in query.all()]


@router.post("", response_model=schemas.SalesRequestResponse, status_code=status.HTTP_201_CREATED)
def create_sales_request_endpoint(
    payload: schemas.SalesRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        request_payload = payload.model_dump()
        request_payload["created_by_user_id"] = current_user.id
        sales_request = create_sales_request(db, request_payload)
    except InventoryQuantityExceededError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INSUFFICIENT_INVENTORY",
                "message": str(exc),
                "violations": exc.violations,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(sales_request)
    return _to_response(sales_request)


@router.get("/{sales_request_id}", response_model=schemas.SalesRequestResponse)
def get_sales_request(sales_request_id: int, db: Session = Depends(get_db)):
    sales_request = (
        db.query(SalesRequest)
        .options(selectinload(SalesRequest.lines))
        .filter(SalesRequest.id == sales_request_id)
        .first()
    )
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    return _to_response(sales_request)


@router.get("/{sales_request_id}/detail", response_model=schemas.SalesRequestDetailResponse)
def get_sales_request_detail_endpoint(sales_request_id: int, db: Session = Depends(get_db)):
    result = get_sales_request_detail(db, sales_request_id)
    if not result:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    sr = result["sales_request"]
    return schemas.SalesRequestDetailResponse(
        id=sr.id,
        request_number=sr.request_number,
        customer_id=sr.customer_id,
        customer_name=sr.customer_name,
        status=sr.status,
        created_at=sr.created_at,
        updated_at=sr.updated_at,
        created_by_user_id=sr.created_by_user_id,
        notes=sr.notes,
        requested_fulfillment_date=sr.requested_fulfillment_date,
        total_amount=Decimal(result["display_total_amount"]),
        lines=result["enriched_lines"],
        linked_invoice_id=result["linked_invoice_id"],
        linked_invoice_number=result["linked_invoice_number"],
        invoice_id=result["linked_invoice_id"],
        invoice_number=result["linked_invoice_number"],
        linked_invoice_status=result["linked_invoice_status"],
        linked_invoice_shipped_at=result["linked_invoice_shipped_at"],
    )




@router.put("/{sales_request_id}", response_model=schemas.SalesRequestResponse)
def update_sales_request_endpoint(sales_request_id: int, payload: schemas.SalesRequestEdit, db: Session = Depends(get_db)):
    sales_request = db.query(SalesRequest).options(selectinload(SalesRequest.lines)).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    try:
        update_open_sales_request(db, sales_request, payload.model_dump())
    except SalesRequestImmutableError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except InventoryQuantityExceededError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INSUFFICIENT_INVENTORY",
                "message": str(exc),
                "violations": exc.violations,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(sales_request)
    return _to_response(sales_request)

@router.post(
    "/{sales_request_id}/generate-invoice",
    status_code=status.HTTP_201_CREATED,
)
def generate_invoice_endpoint(
    sales_request_id: int,
    payload: schemas.GenerateInvoiceFromSRRequest,
    db: Session = Depends(get_db),
):
    sales_request = (
        db.query(SalesRequest)
        .options(selectinload(SalesRequest.lines))
        .filter(SalesRequest.id == sales_request_id)
        .first()
    )
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    try:
        invoice = generate_invoice_from_sales_request(db, sales_request, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(invoice)
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total": str(invoice.total),
        "status": invoice.status,
    }


@router.patch("/{sales_request_id}", response_model=schemas.SalesRequestResponse)
def patch_sales_request(sales_request_id: int, payload: schemas.SalesRequestUpdate, db: Session = Depends(get_db)):
    sales_request = db.query(SalesRequest).options(selectinload(SalesRequest.lines)).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    update_sales_request_status(sales_request, payload.status)
    db.commit()
    db.refresh(sales_request)
    return _to_response(sales_request)
