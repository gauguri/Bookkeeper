from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.inventory.service import adjust_inventory
from app.models import Item, PurchaseOrderSendLog, Supplier, SupplierItem
from app.purchasing.service import create_purchase_order, receive_purchase_order, send_purchase_order, update_purchase_order


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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
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


def test_send_purchase_order_sets_status_and_logs_send():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    db.commit()

    send_log = db.query(PurchaseOrderSendLog).filter(PurchaseOrderSendLog.purchase_order_id == po.id).first()
    assert po.status == "SENT"
    assert send_log is not None


def test_send_purchase_order_allows_resend_and_adds_new_log():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    send_purchase_order(db, po)
    db.commit()

    send_log_count = (
        db.query(PurchaseOrderSendLog)
        .filter(PurchaseOrderSendLog.purchase_order_id == po.id)
        .count()
    )
    assert po.status == "SENT"
    assert send_log_count == 2


def test_update_purchase_order_allowed_when_sent():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    db.commit()

    updated_po = update_purchase_order(
        db,
        po,
        {
            "notes": "late update",
            "lines": [{"item_id": item.id, "quantity": Decimal("7"), "unit_cost": Decimal("3.50")}],
        },
    )
    db.commit()

    assert updated_po.status == "SENT"
    assert updated_po.notes == "late update"
    assert updated_po.lines[0].qty_ordered == Decimal("7")


def test_update_purchase_order_rejected_when_not_draft_or_sent():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
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
            "lines": [{"item_id": item.id, "quantity": Decimal("5")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    po.status = "RECEIVED"
    db.commit()

    try:
        update_purchase_order(db, po, {"notes": "late update"})
    except ValueError as exc:
        assert "DRAFT or SENT" in str(exc)
    else:
        raise AssertionError("Expected ValueError when editing received PO")
