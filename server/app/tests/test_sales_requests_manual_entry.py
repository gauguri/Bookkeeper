from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Customer, Item, SalesRequest
from app.sales_requests.service import create_sales_request


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_rep_can_create_sales_request_and_see_it_in_list():
    db = create_session()
    customer = Customer(name="Acme Stores", is_active=True)
    item = Item(name="Widget", unit_price=Decimal("12.50"), is_active=True, on_hand_qty=0, reserved_qty=0)
    db.add_all([customer, item])
    db.commit()

    sales_request = create_sales_request(
        db,
        {
            "customer_id": customer.id,
            "notes": "Phone order from branch manager",
            "status": "OPEN",
            "created_by_user_id": 1,
            "lines": [{"item_id": item.id, "quantity": Decimal("2"), "unit_price": Decimal("12.50")}],
        },
    )
    db.commit()
    db.refresh(sales_request)

    assert sales_request.request_number.startswith("SR-")
    assert sales_request.customer_name == "Acme Stores"
    assert sales_request.lines[0].line_total == Decimal("25.00")

    listed = db.query(SalesRequest).filter(SalesRequest.customer_name.ilike("%acme%")).all()
    assert len(listed) == 1
    assert listed[0].id == sales_request.id
