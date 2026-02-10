from decimal import Decimal

from sqlalchemy.orm import Session

from app.inventory.service import reserve_inventory
from app.models import Item, SalesRequest, SalesRequestLine


def create_sales_request(db: Session, payload: dict) -> SalesRequest:
    lines_payload = payload.pop("lines")
    sales_request = SalesRequest(**payload)
    sales_request.lines = [SalesRequestLine(**line) for line in lines_payload]
    db.add(sales_request)
    return sales_request


def submit_sales_request(db: Session, sales_request: SalesRequest) -> SalesRequest:
    if sales_request.status == "CANCELLED":
        raise ValueError("Cannot submit a cancelled sales request.")
    for line in sales_request.lines:
        if line.status == "ALLOCATED":
            continue
        item = db.query(Item).filter(Item.id == line.item_id).with_for_update().first()
        if not item:
            raise ValueError("Item not found.")
        available = Decimal(item.available_qty)
        if available >= Decimal(line.qty_requested):
            reserve_inventory(
                db,
                item=item,
                qty_delta=Decimal(line.qty_requested),
                reference_type="SALES_REQUEST",
                reference_id=sales_request.id,
            )
            line.qty_reserved = line.qty_requested
            line.status = "ALLOCATED"
        else:
            line.qty_reserved = Decimal("0")
            line.status = "BACKORDERED"
    sales_request.status = "OPEN"
    return sales_request


def cancel_sales_request(db: Session, sales_request: SalesRequest) -> SalesRequest:
    if sales_request.status == "CANCELLED":
        return sales_request
    for line in sales_request.lines:
        if line.qty_reserved and line.status == "ALLOCATED":
            item = db.query(Item).filter(Item.id == line.item_id).with_for_update().first()
            if item:
                reserve_inventory(
                    db,
                    item=item,
                    qty_delta=Decimal(line.qty_reserved) * Decimal("-1"),
                    reference_type="SALES_REQUEST",
                    reference_id=sales_request.id,
                )
        line.status = "CANCELLED"
        line.qty_reserved = Decimal("0")
    sales_request.status = "CANCELLED"
    return sales_request
