from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_module
from app.banking.schemas import (
    BankAccountResponse,
    BankTransactionResponse,
    BankingDashboardResponse,
    CsvImportPayload,
    CsvImportResult,
    MatchLinkCreate,
    MatchLinkResponse,
    ReconciliationSessionCreate,
    ReconciliationSessionResponse,
    ReconciliationWorkspaceResponse,
    TransactionListResponse,
)
from app.banking.service import (
    close_reconciliation_session,
    create_match_link,
    create_reconciliation_session,
    get_dashboard_metrics,
    get_reconciliation_workspace,
    import_transactions_from_rows,
    list_bank_accounts,
    list_reconciliation_sessions,
    list_transactions,
    update_transaction,
)
from app.db import get_db
from app.models import User
from app.module_keys import ModuleKey

router = APIRouter(prefix="/api/banking", tags=["banking"], dependencies=[Depends(require_module(ModuleKey.BANKING.value))])


@router.get("/dashboard", response_model=BankingDashboardResponse)
def banking_dashboard(db: Session = Depends(get_db)):
    return get_dashboard_metrics(db)


@router.get("/accounts", response_model=list[BankAccountResponse])
def banking_accounts(db: Session = Depends(get_db)):
    return list_bank_accounts(db)


@router.get("/transactions", response_model=TransactionListResponse)
def banking_transactions(
    search: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    amount_min: Optional[Decimal] = Query(None),
    amount_max: Optional[Decimal] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    items, total = list_transactions(
        db,
        search=search,
        account_id=account_id,
        status=status,
        category=category,
        direction=direction,
        start_date=start_date,
        end_date=end_date,
        amount_min=amount_min,
        amount_max=amount_max,
        limit=limit,
    )
    return {"items": items, "total": total}


@router.patch("/transactions/{transaction_id}", response_model=BankTransactionResponse)
def patch_transaction(transaction_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        return update_transaction(db, transaction_id, **payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/import-csv", response_model=CsvImportResult)
def import_csv(payload: CsvImportPayload, db: Session = Depends(get_db)):
    try:
        return import_transactions_from_rows(
            db,
            bank_account_id=payload.bank_account_id,
            source=payload.source,
            rows=[row.model_dump() for row in payload.rows],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/reconciliation/sessions", response_model=list[ReconciliationSessionResponse])
def get_reconciliation_sessions(db: Session = Depends(get_db)):
    return list_reconciliation_sessions(db)


@router.post("/reconciliation/sessions", response_model=ReconciliationSessionResponse)
def post_reconciliation_session(
    payload: ReconciliationSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_reconciliation_session(
        db,
        bank_account_id=payload.bank_account_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        statement_ending_balance=payload.statement_ending_balance,
        created_by=current_user.id,
    )


@router.get("/reconciliation/sessions/{session_id}", response_model=ReconciliationWorkspaceResponse)
def get_reconciliation_session(session_id: int, db: Session = Depends(get_db)):
    try:
        return get_reconciliation_workspace(db, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/matches", response_model=MatchLinkResponse)
def post_match(payload: MatchLinkCreate, db: Session = Depends(get_db)):
    try:
        return create_match_link(
            db,
            bank_transaction_id=payload.bank_transaction_id,
            linked_entity_type=payload.linked_entity_type,
            linked_entity_id=payload.linked_entity_id,
            match_confidence=payload.match_confidence,
            match_type=payload.match_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/reconciliation/sessions/{session_id}/close", response_model=ReconciliationSessionResponse)
def post_close_reconciliation(session_id: int, force: bool = False, db: Session = Depends(get_db)):
    try:
        return close_reconciliation_session(db, session_id, force=force)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
