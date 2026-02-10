from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Customer, Item, SalesRequest, SalesRequestLine


def _next_request_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"SR-{year}-"
    latest = (
        db.query(SalesRequest.request_number)
        .filter(SalesRequest.request_number.like(f"{prefix}%"))
        .order_by(SalesRequest.id.desc())
        .first()
    )
    if latest and latest[0]:
        try:
            sequence = int(str(latest[0]).split("-")[-1]) + 1
        except (ValueError, TypeError):
            sequence = 1
    else:
        sequence = 1
    return f"{prefix}{sequence:04d}"


def create_sales_request(db: Session, payload: dict) -> SalesRequest:
    lines_payload = payload.pop("lines")
    customer_id = payload.get("customer_id")
    customer_name = (payload.get("customer_name") or "").strip() or None

    if customer_id:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise ValueError("Customer not found.")
        payload["customer_name"] = customer.name
    else:
        payload["customer_name"] = customer_name

    payload["request_number"] = _next_request_number(db)
    payload.setdefault("status", "OPEN")

    sales_request = SalesRequest(**payload)
    sales_request.lines = []

    for line in lines_payload:
        item = db.query(Item).filter(Item.id == line["item_id"]).first()
        if not item:
            raise ValueError("One or more selected items no longer exist.")

        quantity = Decimal(str(line["quantity"]))
        unit_price = Decimal(str(line["unit_price"]))
        line_total = quantity * unit_price
        sales_request.lines.append(
            SalesRequestLine(
                item_id=item.id,
                item_name=item.name,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    db.add(sales_request)
    return sales_request


def calculate_sales_request_total(sales_request: SalesRequest) -> Decimal:
    return sum((Decimal(line.line_total or 0) for line in sales_request.lines), Decimal("0"))


def update_sales_request_status(sales_request: SalesRequest, status: str):
    sales_request.status = status
