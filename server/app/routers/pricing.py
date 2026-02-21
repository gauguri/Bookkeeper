from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import require_module
from app.db import get_db
from app.module_keys import ModuleKey
from app.pricing.mwb import compute_mwb_price
from app.sales_requests import schemas

router = APIRouter(
    prefix="/api/pricing",
    tags=["pricing"],
    dependencies=[Depends(require_module(ModuleKey.SALES_REQUESTS.value))],
)


@router.get("/mwb", response_model=schemas.MWBPricingResponse)
def get_mwb_pricing(
    customer_id: int = Query(..., gt=0),
    item_id: int = Query(..., gt=0),
    qty: Decimal = Query(..., gt=0),
    db: Session = Depends(get_db),
):
    try:
        result = compute_mwb_price(db, customer_id=customer_id, item_id=item_id, qty=Decimal(str(qty)))
    except Exception as exc:  # safe fallback for sparse/malformed data paths
        raise HTTPException(status_code=400, detail=str(exc))

    return schemas.MWBPricingResponse(
        unit_price=result.mwb_unit_price,
        currency="USD",
        source_level=result.source_level,
        confidence=result.confidence,
        confidence_score=result.confidence_score,
        explanation=result.explanation,
        computed_at=datetime.utcnow(),
    )
