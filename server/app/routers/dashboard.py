from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import require_module
from app.dashboard.schemas import RevenueDashboardResponse
from app.dashboard.service import get_revenue_dashboard_metrics
from app.db import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_module("DASHBOARD"))])


@router.get("/revenue", response_model=RevenueDashboardResponse)
def revenue_dashboard(
    company_id: Optional[int] = Query(None),
    months: int = Query(7, ge=1, le=24),
    basis: str = Query("cash", pattern="^(cash|accrual)$"),
    db: Session = Depends(get_db),
):
    try:
        return get_revenue_dashboard_metrics(
            db,
            months=months,
            basis=basis,
            company_id=company_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
