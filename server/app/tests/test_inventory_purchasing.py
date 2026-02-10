from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.inventory.service import adjust_inventory
from app.models import Item, SalesRequest, SalesRequestLine, Supplier, SupplierItem
from app.purchasing.service import create_purchase_order, receive_purchase_order
from app.sales_requests.service import cancel_sales_request, submit_sales_request


def create_session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def create_item(db, name="Widget", unit_price=Decimal("10.00"), on_hand=Decimal("0")):
    item = Item(name=name, unit_price=unit_price, is_active=True, on_hand_qty=on_hand, reserved_qty=Decimal("0"))
    db.add(item)
    db.flush()
    return item


def create_supplier(db, name="Supply Co"):
    supplier = Supplier(name=name)
    db.add(supplier)
    db.flush()
    return supplier


def test_inventory_adjustment_updates_on_hand():
    db = create_session()
    item = create_item(db, on_hand=Decimal("2"))

    adjust_inventory(db, item=item, qty_delta=Decimal("3"), reason="Count correction")
    db.commit()
    db.refresh(item)

    assert item.on_hand_qty == Decimal("5")


def test_sales_request_submit_reserves_when_stock_available():
    db = create_session()
    item = create_item(db, on_hand=Decimal("5"))
    sales_request = SalesRequest(status="DRAFT")
    sales_request.lines = [SalesRequestLine(item_id=item.id, qty_requested=Decimal("3"))]
    db.add(sales_request)
    db.commit()

    submit_sales_request(db, sales_request)
    db.commit()
    db.refresh(item)

    assert sales_request.lines[0].status == "ALLOCATED"
    assert item.reserved_qty == Decimal("3")


def test_sales_request_submit_marks_backorder_when_insufficient_stock():
    db = create_session()
    item = create_item(db, on_hand=Decimal("2"))
    sales_request = SalesRequest(status="DRAFT")
    sales_request.lines = [SalesRequestLine(item_id=item.id, qty_requested=Decimal("5"))]
    db.add(sales_request)
    db.commit()

    submit_sales_request(db, sales_request)
    db.commit()
    db.refresh(item)

    assert sales_request.lines[0].status == "BACKORDERED"
    assert item.reserved_qty == Decimal("0")


def test_cancel_sales_request_releases_reservations():
    db = create_session()
    item = create_item(db, on_hand=Decimal("5"))
    sales_request = SalesRequest(status="DRAFT")
    sales_request.lines = [SalesRequestLine(item_id=item.id, qty_requested=Decimal("3"))]
    db.add(sales_request)
    db.commit()

    submit_sales_request(db, sales_request)
    db.commit()
    db.refresh(item)

    cancel_sales_request(db, sales_request)
    db.commit()
    db.refresh(item)

    assert sales_request.status == "CANCELLED"
    assert item.reserved_qty == Decimal("0")


def test_purchase_order_defaults_costs_from_supplier_items():
    db = create_session()
    supplier = create_supplier(db)
    item = create_item(db)
    link = SupplierItem(
        supplier_id=supplier.id,
        item_id=item.id,
        supplier_cost=Decimal("4.00"),
        freight_cost=Decimal("1.00"),
        tariff_cost=Decimal("0.50"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "lines": [{"item_id": item.id, "qty_ordered": Decimal("5")}],
        },
    )
    db.commit()
    db.refresh(po)

    assert po.lines[0].unit_cost == Decimal("4.00")
    assert po.lines[0].landed_cost == Decimal("5.50")


def test_receiving_purchase_order_increases_on_hand():
    db = create_session()
    supplier = create_supplier(db)
    item = create_item(db, on_hand=Decimal("0"))
    link = SupplierItem(
        supplier_id=supplier.id,
        item_id=item.id,
        supplier_cost=Decimal("4.00"),
        freight_cost=Decimal("1.00"),
        tariff_cost=Decimal("0.50"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "lines": [{"item_id": item.id, "qty_ordered": Decimal("5")}],
        },
    )
    db.commit()
    db.refresh(po)

    receive_purchase_order(
        db,
        po,
        {"lines": [{"line_id": po.lines[0].id, "qty_received": Decimal("4")}]},
    )
    db.commit()
    db.refresh(item)

    assert item.on_hand_qty == Decimal("4")
