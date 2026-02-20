from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user, require_module
from app.db import get_db
from app.inventory.service import SOURCE_SALES_REQUEST
from app.module_keys import ModuleKey
from app.models import AuditEvent, SalesRequest
from app.sales_requests import schemas
from app.sales_requests.service import (
    InventoryQuantityExceededError,
    SalesRequestImmutableError,
    calculate_sales_request_total,
    create_sales_request,
    generate_invoice_from_sales_request,
    get_allowed_sales_request_status_transitions,
    get_sales_request_detail,
    update_open_sales_request,
    update_sales_request_status,
    _sync_sales_request_reservations,
    record_sales_request_status_transition,
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


def _build_timeline(sr: SalesRequest, linked_invoice_status: Optional[str], linked_invoice_shipped_at: Optional[datetime], timeline_events: Optional[dict[str, datetime]] = None):
    flow = ["NEW", "QUOTED", "CONFIRMED", "INVOICED", "SHIPPED", "CLOSED"]
    labels = {
        "NEW": "New request created",
        "QUOTED": "Quoted",
        "CONFIRMED": "Confirmed (inventory reserved)",
        "INVOICED": "Invoice generated",
        "SHIPPED": "Shipment completed",
        "CLOSED": "Closed",
        "LOST": "Lost",
        "CANCELLED": "Cancelled",
    }

    timeline_events = timeline_events or {}
    current_idx = flow.index(sr.status) if sr.status in flow else -1
    entries = []
    for idx, status_key in enumerate(flow):
        occurred_at = timeline_events.get(status_key) or (sr.updated_at if idx <= current_idx else None)
        if status_key == "SHIPPED" and linked_invoice_status == "SHIPPED":
            occurred_at = linked_invoice_shipped_at or occurred_at
        entries.append(
            schemas.SalesRequestTimelineEntry(
                status=status_key,
                label=labels[status_key],
                occurred_at=occurred_at,
                completed=idx <= current_idx,
                current=status_key == sr.status,
            )
        )

    if sr.status in {"LOST", "CANCELLED"}:
        entries.append(
            schemas.SalesRequestTimelineEntry(
                status=sr.status,
                label=labels[sr.status],
                occurred_at=sr.updated_at,
                completed=True,
                current=True,
            )
        )

    return entries


def _load_status_timeline_events(db: Session, sales_request_id: int) -> dict[str, datetime]:
    rows = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.entity_type == "sales_request",
            AuditEvent.entity_id == sales_request_id,
            AuditEvent.action == "STATUS_TRANSITION",
        )
        .order_by(AuditEvent.created_at.asc())
        .all()
    )

    events: dict[str, datetime] = {}
    for row in rows:
        if not row.event_metadata or "->" not in row.event_metadata:
            continue
        to_status = row.event_metadata.split("->", 1)[1].strip()
        if to_status and to_status not in events:
            events[to_status] = row.created_at
    return events


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
        allowed_transitions=get_allowed_sales_request_status_transitions(sr),
        timeline=_build_timeline(
            sr,
            result["linked_invoice_status"],
            result["linked_invoice_shipped_at"],
            timeline_events=_load_status_timeline_events(db, sr.id),
        ),
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


@router.post("/{sales_request_id}/generate-invoice", status_code=status.HTTP_201_CREATED)
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


@router.patch("/{sales_request_id}", response_model=schemas.SalesRequestDetailResponse)
def patch_sales_request(
    sales_request_id: int,
    payload: schemas.SalesRequestUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sales_request = db.query(SalesRequest).options(selectinload(SalesRequest.lines)).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")

    next_status = payload.workflow_status or payload.status
    if next_status not in get_allowed_sales_request_status_transitions(sales_request):
        raise HTTPException(status_code=400, detail=f"Transition {sales_request.status} -> {next_status} is not allowed.")

    previous_status = sales_request.status

    # When transitioning CONFIRMED → INVOICED, auto-generate the invoice
    # so the sales request is properly linked to a real invoice record.
    if previous_status == "CONFIRMED" and next_status == "INVOICED":
        if not sales_request.customer_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot generate invoice for a walk-in customer without a linked customer record.",
            )
        today = datetime.utcnow().date()
        auto_payload = {
            "issue_date": today.isoformat(),
            "due_date": (today + timedelta(days=30)).isoformat(),
            "notes": None,
            "terms": "Net 30",
            "markup_percent": 0,
            "line_selections": [
                {
                    "sales_request_line_id": line.id,
                    "supplier_id": None,
                    "unit_cost": None,
                    "unit_price": float(line.unit_price),
                    "discount": 0,
                    "tax_rate": 0,
                }
                for line in sales_request.lines
            ],
        }
        try:
            generate_invoice_from_sales_request(db, sales_request, auto_payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        update_sales_request_status(sales_request, next_status)

    _sync_sales_request_reservations(db, sales_request)
    record_sales_request_status_transition(
        db,
        sales_request=sales_request,
        from_status=previous_status,
        to_status=next_status,
        user_id=getattr(current_user, "id", None),
    )

    db.commit()
    return get_sales_request_detail_endpoint(sales_request_id, db)


@router.delete("/{sales_request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sales_request(sales_request_id: int, db: Session = Depends(get_db)):
    sales_request = db.query(SalesRequest).filter(SalesRequest.id == sales_request_id).first()
    if not sales_request:
        raise HTTPException(status_code=404, detail="Sales request not found.")
    update_sales_request_status(sales_request, "CANCELLED")
    _sync_sales_request_reservations(db, sales_request)
    db.delete(sales_request)
    db.commit()
