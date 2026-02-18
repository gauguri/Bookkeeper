from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_module
from app.backlog import schemas
from app.backlog.service import get_backlog_customers, get_backlog_items, get_backlog_summary
from app.db import get_db
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api/backlog", tags=["backlog"], dependencies=[Depends(require_module(ModuleKey.INVENTORY.value))])


@router.get("/summary", response_model=schemas.BacklogSummaryResponse)
def backlog_summary(db: Session = Depends(get_db)):
    return get_backlog_summary(db)


@router.get("/items", response_model=List[schemas.BacklogItemResponse])
def backlog_items(db: Session = Depends(get_db)):
    return get_backlog_items(db)


@router.get("/customers", response_model=List[schemas.BacklogCustomerResponse])
def backlog_customers(db: Session = Depends(get_db)):
    return get_backlog_customers(db)
