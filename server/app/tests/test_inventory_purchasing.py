from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.accounting.service import create_journal_entry
from app.db import Base
from app.inventory import schemas as inventory_schemas
from app.inventory.replenishment import build_replenishment_workbench, create_replenishment_purchase_orders
from app.inventory.service import adjust_inventory
from app.models import Account, Company, GLJournalHeader, GLPostingLink, Inventory, Item, JournalEntry, PurchaseOrder, PurchaseOrderSendLog, Supplier, SupplierItem
from app.purchasing.analytics import get_procurement_hub_analytics
from app.purchasing.service import backfill_purchase_order_receipt_to_gl, create_purchase_order, post_purchase_order_receipt, receive_purchase_order, send_purchase_order, update_purchase_order


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


def test_send_purchase_order_lands_inventory_with_po_level_costs():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
    item = create_item(db)
    link = SupplierItem(
        supplier_id=supplier.id,
        item_id=item.id,
        supplier_cost=Decimal("10.00"),
        freight_cost=Decimal("0.00"),
        tariff_cost=Decimal("0.00"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "freight_cost": Decimal("20.00"),
            "tariff_cost": Decimal("10.00"),
            "lines": [{"item_id": item.id, "quantity": Decimal("5"), "unit_cost": Decimal("10.00")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    db.commit()

    inventory = db.query(Inventory).filter(Inventory.item_id == item.id).first()
    assert inventory is not None
    assert inventory.quantity_on_hand == Decimal("5")
    assert inventory.landed_unit_cost == Decimal("16")


def test_send_purchase_order_resend_does_not_double_land_inventory():
    db = create_session()
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
    item = create_item(db)
    link = SupplierItem(
        supplier_id=supplier.id,
        item_id=item.id,
        supplier_cost=Decimal("4.00"),
        freight_cost=Decimal("0.00"),
        tariff_cost=Decimal("0.00"),
        is_preferred=True,
    )
    db.add(link)
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "freight_cost": Decimal("2.00"),
            "tariff_cost": Decimal("3.00"),
            "lines": [{"item_id": item.id, "quantity": Decimal("5"), "unit_cost": Decimal("4.00")}],
        },
    )
    db.commit()

    send_purchase_order(db, po)
    send_purchase_order(db, po)
    db.commit()

    inventory = db.query(Inventory).filter(Inventory.item_id == item.id).first()
    assert inventory.quantity_on_hand == Decimal("5")


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


def _create_company_and_accounts(db):
    company = Company(name="Demo")
    db.add(company)
    db.flush()
    cash = Account(company_id=company.id, code="10100", name="Cash - Regular Checking", type="ASSET", normal_balance="debit", is_active=True)
    inventory = Account(company_id=company.id, code="13100", name="Inventory", type="ASSET", normal_balance="debit", is_active=True)
    db.add_all([cash, inventory])
    db.flush()
    return company, cash, inventory


def test_post_purchase_order_receipt_creates_balanced_journal_entry():
    db = create_session()
    _company, cash, inventory = _create_company_and_accounts(db)
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
    item = create_item(db)
    db.add(SupplierItem(supplier_id=supplier.id, item_id=item.id, supplier_cost=Decimal("10.00"), is_preferred=True))
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "freight_cost": Decimal("5.00"),
            "tariff_cost": Decimal("5.00"),
            "lines": [{"item_id": item.id, "quantity": Decimal("2"), "unit_cost": Decimal("10.00")}],
        },
    )
    db.commit()

    post_purchase_order_receipt(
        db,
        po=po,
        entry_date=date.today(),
        memo="PO receipt",
        inventory_account_id=inventory.id,
        cash_account_id=cash.id,
    )
    db.commit()

    entry = db.query(JournalEntry).filter(JournalEntry.id == po.posted_journal_entry_id).first()
    assert entry is not None
    assert len(entry.lines) == 2
    assert sum((Decimal(line.debit or 0) for line in entry.lines), Decimal("0")) == Decimal("30.00")
    assert sum((Decimal(line.credit or 0) for line in entry.lines), Decimal("0")) == Decimal("30.00")

    gl_header = db.query(GLJournalHeader).filter(GLJournalHeader.reference == po.po_number).first()
    assert gl_header is not None
    assert gl_header.status == "POSTED"
    assert gl_header.source_module == "PURCHASING"
    assert len(gl_header.lines) == 2
    assert sum((Decimal(line.debit_amount or 0) for line in gl_header.lines), Decimal("0")) == Decimal("30.00")
    assert sum((Decimal(line.credit_amount or 0) for line in gl_header.lines), Decimal("0")) == Decimal("30.00")

    gl_link = db.query(GLPostingLink).filter(GLPostingLink.source_module == "PURCHASE_ORDER", GLPostingLink.source_id == po.id).first()
    assert gl_link is not None
    assert gl_link.gl_journal_header_id == gl_header.id


def test_post_purchase_order_receipt_blocks_duplicates():
    db = create_session()
    _company, cash, inventory = _create_company_and_accounts(db)
    supplier = create_supplier(db)
    supplier.email = "buyer@supplyco.test"
    item = create_item(db)
    db.add(SupplierItem(supplier_id=supplier.id, item_id=item.id, supplier_cost=Decimal("1.00"), is_preferred=True))
    db.flush()

    po = create_purchase_order(
        db,
        {"supplier_id": supplier.id, "order_date": date.today(), "lines": [{"item_id": item.id, "quantity": Decimal("1"), "unit_cost": Decimal("1.00")}],},
    )
    db.commit()

    post_purchase_order_receipt(db, po=po, entry_date=date.today(), memo=None, inventory_account_id=inventory.id, cash_account_id=cash.id)
    db.commit()

    try:
        post_purchase_order_receipt(db, po=po, entry_date=date.today(), memo=None, inventory_account_id=inventory.id, cash_account_id=cash.id)
        assert False, "Expected duplicate posting to fail"
    except ValueError as exc:
        assert "already posted" in str(exc)


def test_backfill_purchase_order_receipt_to_gl_from_legacy_journal():
    db = create_session()
    company, cash, inventory = _create_company_and_accounts(db)
    supplier = create_supplier(db)
    item = create_item(db)
    db.add(SupplierItem(supplier_id=supplier.id, item_id=item.id, supplier_cost=Decimal("10.00"), is_preferred=True))
    db.flush()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "freight_cost": Decimal("2.00"),
            "tariff_cost": Decimal("3.00"),
            "lines": [{"item_id": item.id, "quantity": Decimal("2"), "unit_cost": Decimal("10.00")}],
        },
    )
    db.flush()

    legacy_entry = create_journal_entry(
        db,
        company_id=company.id,
        entry_date=date.today(),
        memo=f"PO {po.po_number} landed cost",
        source_type="PURCHASE_ORDER",
        source_id=po.id,
        debit_account_id=inventory.id,
        credit_account_id=cash.id,
        amount=Decimal("25.00"),
        mirror_to_gl=False,
    )
    po.posted_journal_entry_id = legacy_entry.id
    db.commit()

    backfilled = backfill_purchase_order_receipt_to_gl(db, po)
    db.commit()

    assert backfilled is True
    gl_header = db.query(GLJournalHeader).filter(GLJournalHeader.reference == po.po_number).first()
    assert gl_header is not None
    assert gl_header.status == "POSTED"
    assert sum((Decimal(line.debit_amount or 0) for line in gl_header.lines), Decimal("0")) == Decimal("25.00")
    assert sum((Decimal(line.credit_amount or 0) for line in gl_header.lines), Decimal("0")) == Decimal("25.00")

    gl_link = db.query(GLPostingLink).filter(GLPostingLink.source_module == "PURCHASE_ORDER", GLPostingLink.source_id == po.id).first()
    assert gl_link is not None
    assert gl_link.gl_journal_header_id == gl_header.id



def test_procurement_hub_analytics_uses_live_purchase_order_data():
    db = create_session()
    supplier_a = create_supplier(db, "Alpha Stone")
    supplier_a.email = "buyer@alpha.test"
    supplier_a.default_lead_time_days = 45
    supplier_b = create_supplier(db, "Beta Memorials")
    supplier_b.email = "buyer@beta.test"
    supplier_b.default_lead_time_days = 75

    item_a = create_item(db, name="Marker A", unit_price=Decimal("100.00"))
    item_b = create_item(db, name="Marker B", unit_price=Decimal("200.00"))
    db.add_all(
        [
            SupplierItem(supplier_id=supplier_a.id, item_id=item_a.id, supplier_cost=Decimal("100.00"), is_preferred=True),
            SupplierItem(supplier_id=supplier_b.id, item_id=item_b.id, supplier_cost=Decimal("200.00"), is_preferred=True),
        ]
    )
    db.flush()

    po_open = create_purchase_order(
        db,
        {
            "supplier_id": supplier_a.id,
            "order_date": date(2026, 3, 1),
            "expected_date": date(2026, 3, 20),
            "lines": [{"item_id": item_a.id, "quantity": Decimal("2"), "unit_cost": Decimal("100.00")}],
        },
    )
    db.commit()
    send_purchase_order(db, po_open)
    db.commit()

    po_received = create_purchase_order(
        db,
        {
            "supplier_id": supplier_b.id,
            "order_date": date(2026, 2, 10),
            "expected_date": date(2026, 3, 5),
            "lines": [{"item_id": item_b.id, "quantity": Decimal("3"), "unit_cost": Decimal("200.00")}],
        },
    )
    db.commit()
    send_purchase_order(db, po_received)
    po_received.status = "RECEIVED"
    po_received.landed_at = po_received.created_at
    po_received.posted_journal_entry_id = 1
    db.commit()

    payload = get_procurement_hub_analytics(db, date(2026, 3, 13))

    cards = {card["key"]: card for card in payload["cards"]}
    assert cards["total_spend_ytd"]["value"] == 800.0
    assert cards["open_purchase_orders"]["value"] == 1
    assert cards["received_purchase_orders"]["value"] == 1
    assert cards["active_suppliers"]["value"] == 2
    assert cards["average_lead_time_days"]["value"] == 60.0
    assert cards["catalog_coverage_percent"]["value"] == 100.0

    assert any(point["month"] == "Feb" and point["actual_spend"] == Decimal("600.00") for point in payload["spend_trend"])
    assert any(point["month"] == "Mar" and point["actual_spend"] == Decimal("200.00") for point in payload["spend_trend"])
    assert payload["vendor_spend"][0]["supplier_name"] == "Beta Memorials"
    assert any(rule["id"] == "received-posted" and rule["failed"] == 0 for rule in payload["compliance_rules"])
    assert any(risk["category"] in {"Delivery", "Backlog", "Master Data"} for risk in payload["risk_items"])
    assert payload["insights"]

def test_replenishment_workbench_groups_supplier_and_unmapped_items():
    db = create_session()
    supplier = create_supplier(db, name="Granite Supply")
    mapped_item = create_item(db, name="Blue Pearl", on_hand=Decimal("2"))
    unmapped_item = create_item(db, name="Legacy Marker", on_hand=Decimal("0"))
    db.add(
        SupplierItem(
            supplier_id=supplier.id,
            item_id=mapped_item.id,
            supplier_cost=Decimal("40.00"),
            freight_cost=Decimal("5.00"),
            tariff_cost=Decimal("0.00"),
            min_order_qty=Decimal("10.00"),
            is_preferred=True,
            is_active=True,
        )
    )
    db.commit()

    rows = [
        inventory_schemas.InventoryItemRow(
            id=mapped_item.id,
            sku=None,
            item=mapped_item.name,
            on_hand=Decimal("2.00"),
            reserved=Decimal("0.00"),
            available=Decimal("2.00"),
            reorder_point=Decimal("6.00"),
            safety_stock=Decimal("1.00"),
            lead_time_days=14,
            avg_daily_usage=Decimal("1.00"),
            days_of_supply=Decimal("2.00"),
            suggested_reorder_qty=Decimal("6.00"),
            preferred_supplier=supplier.name,
            preferred_supplier_id=supplier.id,
            last_receipt=None,
            last_issue=None,
            total_value=Decimal("90.00"),
            inbound_qty=Decimal("0.00"),
            health_flag="low_stock",
        ),
        inventory_schemas.InventoryItemRow(
            id=unmapped_item.id,
            sku=None,
            item=unmapped_item.name,
            on_hand=Decimal("0.00"),
            reserved=Decimal("0.00"),
            available=Decimal("0.00"),
            reorder_point=Decimal("4.00"),
            safety_stock=Decimal("1.00"),
            lead_time_days=7,
            avg_daily_usage=Decimal("1.00"),
            days_of_supply=Decimal("0.00"),
            suggested_reorder_qty=Decimal("4.00"),
            preferred_supplier=None,
            preferred_supplier_id=None,
            last_receipt=None,
            last_issue=None,
            total_value=Decimal("0.00"),
            inbound_qty=Decimal("0.00"),
            health_flag="stockout",
        ),
    ]

    response = build_replenishment_workbench(db, rows, usage_days=90)

    assert response.summary.total_recommendations == 2
    assert response.summary.supplier_groups == 1
    assert response.summary.unmapped_items == 1
    mapped_group = next(group for group in response.groups if group.supplier_id == supplier.id)
    unmapped_group = next(group for group in response.groups if group.supplier_id is None)
    assert mapped_group.items[0].recommended_order_qty == Decimal("10.00")
    assert mapped_group.items[0].estimated_order_value == Decimal("450.00")
    assert unmapped_group.actionable is False
    assert unmapped_group.items[0].has_supplier_mapping is False


def test_replenishment_purchase_orders_group_lines_by_supplier():
    db = create_session()
    supplier = create_supplier(db, name="Quarry One")
    first_item = create_item(db, name="Angel Upright")
    second_item = create_item(db, name="Companion Slant")
    db.add_all([
        SupplierItem(supplier_id=supplier.id, item_id=first_item.id, supplier_cost=Decimal("10.00"), freight_cost=Decimal("2.00"), tariff_cost=Decimal("1.00"), is_preferred=True, is_active=True),
        SupplierItem(supplier_id=supplier.id, item_id=second_item.id, supplier_cost=Decimal("20.00"), freight_cost=Decimal("3.00"), tariff_cost=Decimal("2.00"), is_preferred=False, is_active=True),
    ])
    db.commit()

    response = create_replenishment_purchase_orders(
        db,
        selections=[
            inventory_schemas.ReplenishmentSelection(item_id=first_item.id, supplier_id=supplier.id, quantity=Decimal("3.00")),
            inventory_schemas.ReplenishmentSelection(item_id=second_item.id, supplier_id=supplier.id, quantity=Decimal("2.00")),
        ],
    )
    db.commit()

    assert len(response.created_purchase_orders) == 1
    created = response.created_purchase_orders[0]
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == created.id).first()
    assert po is not None
    assert po.supplier_id == supplier.id
    assert len(po.lines) == 2
    assert po.lines[0].qty_ordered + po.lines[1].qty_ordered == Decimal("5.00")
    assert created.total == Decimal("70.00")


def test_replenishment_purchase_orders_reject_unmapped_items():
    db = create_session()
    supplier = create_supplier(db, name="Missing Mapping Supplier")
    item = create_item(db, name="Unmapped Stock")
    db.commit()

    try:
        create_replenishment_purchase_orders(
            db,
            selections=[inventory_schemas.ReplenishmentSelection(item_id=item.id, supplier_id=supplier.id, quantity=Decimal("1.00"))],
        )
    except ValueError as exc:
        assert "not mapped" in str(exc)
    else:
        raise AssertionError("Expected unmapped replenishment item to fail")


def test_purchase_order_number_advances_from_highest_existing_sequence():
    db = create_session()
    supplier = create_supplier(db, name="Sequence Supplier")
    item = create_item(db, name="Sequence Item")
    db.add(SupplierItem(supplier_id=supplier.id, item_id=item.id, supplier_cost=Decimal("8.00"), is_preferred=True, is_active=True))
    db.add(PurchaseOrder(po_number="PO-00005", supplier_id=supplier.id, order_date=date.today(), notes="existing"))
    db.commit()

    po = create_purchase_order(
        db,
        {
            "supplier_id": supplier.id,
            "order_date": date.today(),
            "lines": [{"item_id": item.id, "quantity": Decimal("1.00")}],
        },
    )
    db.commit()

    assert po.po_number == "PO-00006"
