from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import SalesRequest
from app.sales_requests import schemas
from app.sales_requests.service import cancel_sales_request, create_sales_request, submit_sales_request


router = APIRouter(prefix="/api/sales-requests", tags=["sales-requests"])


@router.get("", response_model=List[schemas.SalesRequestResponse])
def list_sales_requests(db: Session = Depends(get_db)):
    return (
        db.query(SalesRequest)
        .options(selectinload(SalesRequest.lines))
        .order_by(SalesRequest.requested_at.desc())
        .all()
    )


@router.post("", response_model=schemas.SalesRequestResponse, status_code=status.HTTP_201_CREATED)
def create_sales_request_endpoint(payload: schemas.SalesRequestCreate, db: Session = Depends(get_db)):
    sales_request = create_sales_request(db, payload.model_dump())
    db.commit()
    db.refresh(sales_request)
    return sales_request


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
    return sales_request


@router.post("/{sales_request_id}/submit", response_model=schemas.SalesRequestSubmitResponse)
def submit_sales_request_endpoint(sales_request_id: int, db: Session = Depends(get_db)):
    sales_request = (
        db.query(SalesRequest)
        .options(selectinload(SalesRequest.lines))
        .filter(SalesRequest.id == sales_request_id)
        .first()
    )
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    try:
        submit_sales_request(db, sales_request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(sales_request)
    return sales_request


@router.post("/{sales_request_id}/cancel", response_model=schemas.SalesRequestSubmitResponse)
def cancel_sales_request_endpoint(sales_request_id: int, db: Session = Depends(get_db)):
    sales_request = (
        db.query(SalesRequest)
        .options(selectinload(SalesRequest.lines))
        .filter(SalesRequest.id == sales_request_id)
        .first()
    )
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    cancel_sales_request(db, sales_request)
    db.commit()
    db.refresh(sales_request)
    return sales_request
