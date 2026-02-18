from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ar.schemas import ARActivityResponse, ARAgingCustomerRow, ARNoteCreate, ARReminderCreate, CashForecastResponse
from app.ar.service import create_ar_activity, get_ar_aging_by_customer, get_cash_forecast
from app.auth import require_module
from app.db import get_db
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api/ar", tags=["ar"])


@router.get("/aging", response_model=List[ARAgingCustomerRow])
def get_ar_aging(
    as_of: date = Query(...),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    return get_ar_aging_by_customer(db, as_of)


@router.get("/cash-forecast", response_model=CashForecastResponse)
def get_cash_forecast_endpoint(
    weeks: int = Query(8, ge=1, le=26),
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    return get_cash_forecast(db, weeks=weeks)


@router.post("/notes", response_model=ARActivityResponse, status_code=status.HTTP_201_CREATED)
def create_ar_note(
    payload: ARNoteCreate,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    try:
        return create_ar_activity(
            db,
            customer_id=payload.customer_id,
            activity_type="NOTE",
            note=payload.note,
            follow_up_date=payload.follow_up_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/reminders", response_model=ARActivityResponse, status_code=status.HTTP_201_CREATED)
def create_ar_reminder(
    payload: ARReminderCreate,
    db: Session = Depends(get_db),
    _=Depends(require_module(ModuleKey.REPORTS.value)),
):
    try:
        return create_ar_activity(
            db,
            customer_id=payload.customer_id,
            activity_type="REMINDER",
            note=payload.note,
            follow_up_date=payload.follow_up_date,
            reminder_channel=payload.channel.upper(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
