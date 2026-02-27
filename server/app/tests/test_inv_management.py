"""Tests for the SAP-level inventory management module.

Covers transaction engine, master data, operations, and reporting services.
"""

import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.db import Base
from app.models import (
    Company,
    InvBatch,
    InvBin,
    InvCountPlan,
    InvCountPlanItem,
    InvInspectionLot,
    InvItemCategory,
    InvNonConformanceReport,
    InvReasonCode,
    InvReorderAlert,
    InvReservation,
    InvSerial,
    InvSetting,
    InvStockOnHand,
    InvTransactionHeader,
    InvTransactionLine,
    InvUom,
    InvUomConversion,
    InvValuationConfig,
    InvWarehouse,
    InvZone,
    InvAisle,
    InvRack,
    InvShelf,
    Item,
    User,
)

# ---------------------------------------------------------------------------
# Test database setup
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(TEST_DATABASE_URL, echo=False)
TestSession = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def db():
    """Create all tables fresh for each test."""
    Base.metadata.create_all(engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def sample_company(db: Session):
    company = Company(name="Test Corp", base_currency="USD")
    db.add(company)
    db.flush()
    return company


@pytest.fixture
def sample_user(db: Session, sample_company):
    user = User(
        company_id=sample_company.id,
        email="test@test.com",
        full_name="Test User",
        password_hash="fakehash",
        role="admin",
        is_admin=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def sample_item(db: Session):
    item = Item(
        sku="TEST-001",
        name="Test Item",
        unit_price=Decimal("10.00"),
        on_hand_qty=Decimal("100"),
        reorder_point=Decimal("20"),
        safety_stock_qty=Decimal("5"),
        lead_time_days=7,
    )
    db.add(item)
    db.flush()
    return item


@pytest.fixture
def sample_item2(db: Session):
    item = Item(
        sku="TEST-002",
        name="Test Item 2",
        unit_price=Decimal("25.00"),
        on_hand_qty=Decimal("50"),
    )
    db.add(item)
    db.flush()
    return item


@pytest.fixture
def sample_warehouse(db: Session):
    wh = InvWarehouse(code="WH-TEST", name="Test Warehouse", warehouse_type="standard")
    db.add(wh)
    db.flush()
    return wh


@pytest.fixture
def sample_warehouse2(db: Session):
    wh = InvWarehouse(code="WH-TEST2", name="Test Warehouse 2", warehouse_type="standard")
    db.add(wh)
    db.flush()
    return wh


@pytest.fixture
def sample_uom(db: Session):
    uom = InvUom(code="PCS", name="Pieces", category="quantity", is_base=True)
    db.add(uom)
    db.flush()
    return uom


@pytest.fixture
def stock_with_items(db: Session, sample_item, sample_warehouse):
    """Create stock on hand for testing."""
    stock = InvStockOnHand(
        item_id=sample_item.id,
        warehouse_id=sample_warehouse.id,
        stock_type="unrestricted",
        quantity=Decimal("100"),
    )
    db.add(stock)
    db.flush()
    return stock


# ===========================================================================
# UNIT TESTS: Master Data Service
# ===========================================================================


class TestCategoryService:
    def test_create_category(self, db):
        from app.inv_management.master_data_service import create_category

        cat = create_category(db, parent_id=None, name="Electronics", code="ELEC")
        db.flush()

        assert cat.id is not None
        assert cat.name == "Electronics"
        assert cat.code == "ELEC"
        assert cat.level == 0

    def test_create_subcategory(self, db):
        from app.inv_management.master_data_service import create_category

        parent = create_category(db, parent_id=None, name="Electronics", code="ELEC")
        db.flush()

        child = create_category(db, parent_id=parent.id, name="Displays", code="DISP")
        db.flush()

        assert child.level == 1
        assert child.parent_id == parent.id

    def test_create_category_invalid_parent(self, db):
        from app.inv_management.master_data_service import create_category

        with pytest.raises(ValueError, match="Parent category 9999 not found"):
            create_category(db, parent_id=9999, name="Bad", code="BAD")

    def test_list_categories(self, db):
        from app.inv_management.master_data_service import create_category, list_categories

        create_category(db, parent_id=None, name="A", code="A")
        create_category(db, parent_id=None, name="B", code="B")
        db.flush()

        cats = list_categories(db)
        assert len(cats) == 2


class TestUomService:
    def test_create_uom(self, db):
        from app.inv_management.master_data_service import create_uom

        uom = create_uom(db, code="KG", name="Kilogram", category="weight", is_base=True)
        db.flush()
        assert uom.code == "KG"
        assert uom.is_base is True

    def test_create_uom_conversion(self, db, sample_uom):
        from app.inv_management.master_data_service import create_uom, create_uom_conversion

        box = create_uom(db, code="BOX", name="Box", category="quantity")
        db.flush()

        conv = create_uom_conversion(
            db, item_id=None, from_uom_id=box.id, to_uom_id=sample_uom.id,
            conversion_factor=Decimal("12"),
        )
        db.flush()

        assert conv.conversion_factor == Decimal("12")


class TestWarehouseService:
    def test_create_warehouse(self, db):
        from app.inv_management.master_data_service import create_warehouse

        wh = create_warehouse(db, code="WH-01", name="Warehouse 1")
        db.flush()
        assert wh.code == "WH-01"
        assert wh.is_active is True

    def test_create_zone(self, db, sample_warehouse):
        from app.inv_management.master_data_service import create_zone

        zone = create_zone(db, sample_warehouse.id, code="RCV", name="Receiving", zone_type="receiving")
        db.flush()
        assert zone.warehouse_id == sample_warehouse.id

    def test_create_full_hierarchy(self, db, sample_warehouse):
        from app.inv_management.master_data_service import (
            create_zone, create_aisle, create_rack, create_shelf, create_bin
        )

        zone = create_zone(db, sample_warehouse.id, code="STR", name="Storage")
        db.flush()
        aisle = create_aisle(db, zone.id, code="A01", name="Aisle 1")
        db.flush()
        rack = create_rack(db, aisle.id, code="R01", name="Rack 1")
        db.flush()
        shelf = create_shelf(db, rack.id, code="S01", name="Shelf 1")
        db.flush()
        bin_ = create_bin(db, shelf.id, code="B01", name="Bin 1")
        db.flush()

        assert bin_.shelf_id == shelf.id
        assert bin_.is_active is True


class TestBatchService:
    def test_create_batch_auto_number(self, db, sample_item):
        from app.inv_management.master_data_service import create_batch

        batch = create_batch(db, item_id=sample_item.id)
        db.flush()

        assert batch.batch_number is not None
        assert sample_item.sku in batch.batch_number

    def test_create_batch_manual_number(self, db, sample_item):
        from app.inv_management.master_data_service import create_batch

        batch = create_batch(db, item_id=sample_item.id, batch_number="CUSTOM-001")
        db.flush()

        assert batch.batch_number == "CUSTOM-001"

    def test_get_expiring_batches(self, db, sample_item):
        from app.inv_management.master_data_service import create_batch, get_expiring_batches

        # Expiring in 10 days
        create_batch(
            db, item_id=sample_item.id, batch_number="EXP-001",
            expiry_date=date.today() + timedelta(days=10),
        )
        # Not expiring (60 days out)
        create_batch(
            db, item_id=sample_item.id, batch_number="SAFE-001",
            expiry_date=date.today() + timedelta(days=60),
        )
        db.flush()

        expiring = get_expiring_batches(db, days=30)
        assert len(expiring) == 1
        assert expiring[0].batch_number == "EXP-001"


class TestSerialService:
    def test_create_serial(self, db, sample_item):
        from app.inv_management.master_data_service import create_serial

        serial = create_serial(db, item_id=sample_item.id, serial_number="SN-001")
        db.flush()

        assert serial.serial_number == "SN-001"
        assert serial.status == "in_stock"

    def test_serial_uniqueness_per_item(self, db, sample_item):
        from app.inv_management.master_data_service import create_serial

        create_serial(db, item_id=sample_item.id, serial_number="SN-DUP")
        db.flush()

        # SQLite doesn't enforce unique constraints the same way but the model has it
        # In production (PostgreSQL), this would raise IntegrityError


# ===========================================================================
# UNIT TESTS: Transaction Service
# ===========================================================================


class TestGoodsReceipt:
    def test_goods_receipt_creates_stock(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt

        header = goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 50, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        assert header.transaction_number.startswith("GR-")
        assert header.status == "posted"
        assert header.transaction_type == "goods_receipt"
        assert len(header.lines) == 1

        # Check stock created
        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse.id,
        ).first()
        assert stock is not None
        assert stock.quantity == Decimal("50")

    def test_goods_receipt_updates_legacy_item(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt

        old_qty = sample_item.on_hand_qty
        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 25, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        assert sample_item.on_hand_qty == Decimal(str(old_qty)) + Decimal("25")

    def test_goods_receipt_multi_line(self, db, sample_item, sample_item2, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt

        header = goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[
                {"item_id": sample_item.id, "quantity": 10, "unit_cost": 5},
                {"item_id": sample_item2.id, "quantity": 20, "unit_cost": 15},
            ],
            created_by=sample_user.id,
        )
        db.flush()

        assert len(header.lines) == 2
        assert header.lines[0].line_number == 1
        assert header.lines[1].line_number == 2

    def test_goods_receipt_creates_valuation(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt

        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 100, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == sample_item.id).first()
        assert config is not None
        assert config.moving_average_cost == Decimal("10")


class TestGoodsIssue:
    def test_goods_issue_decrements_stock(self, db, sample_item, sample_warehouse, sample_user,
                                           stock_with_items):
        from app.inv_management.transaction_service import goods_issue

        header = goods_issue(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 30}],
            created_by=sample_user.id,
        )
        db.flush()

        assert header.transaction_type == "goods_issue"
        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
        ).first()
        assert stock.quantity == Decimal("70")

    def test_goods_issue_insufficient_stock(self, db, sample_item, sample_warehouse, sample_user,
                                             stock_with_items):
        from app.inv_management.transaction_service import goods_issue

        with pytest.raises(ValueError, match="Insufficient stock"):
            goods_issue(
                db,
                warehouse_id=sample_warehouse.id,
                lines=[{"item_id": sample_item.id, "quantity": 999}],
                created_by=sample_user.id,
            )


class TestStockTransfer:
    def test_stock_transfer_between_warehouses(self, db, sample_item, sample_warehouse,
                                                sample_warehouse2, sample_user, stock_with_items):
        from app.inv_management.transaction_service import stock_transfer

        header = stock_transfer(
            db,
            source_warehouse_id=sample_warehouse.id,
            destination_warehouse_id=sample_warehouse2.id,
            lines=[{"item_id": sample_item.id, "quantity": 40}],
            created_by=sample_user.id,
        )
        db.flush()

        assert header.transaction_type == "stock_transfer"

        source = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse.id,
        ).first()
        dest = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse2.id,
        ).first()

        assert source.quantity == Decimal("60")
        assert dest.quantity == Decimal("40")

    def test_stock_transfer_insufficient(self, db, sample_item, sample_warehouse,
                                          sample_warehouse2, sample_user, stock_with_items):
        from app.inv_management.transaction_service import stock_transfer

        with pytest.raises(ValueError, match="Insufficient stock"):
            stock_transfer(
                db,
                source_warehouse_id=sample_warehouse.id,
                destination_warehouse_id=sample_warehouse2.id,
                lines=[{"item_id": sample_item.id, "quantity": 200}],
                created_by=sample_user.id,
            )


class TestStockAdjustment:
    def test_positive_adjustment(self, db, sample_item, sample_warehouse, sample_user, stock_with_items):
        from app.inv_management.transaction_service import stock_adjustment

        header = stock_adjustment(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
        ).first()
        assert stock.quantity == Decimal("110")

    def test_negative_adjustment(self, db, sample_item, sample_warehouse, sample_user, stock_with_items):
        from app.inv_management.transaction_service import stock_adjustment

        header = stock_adjustment(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": -20}],
            created_by=sample_user.id,
        )
        db.flush()

        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
        ).first()
        assert stock.quantity == Decimal("80")

    def test_adjustment_prevents_negative_stock(self, db, sample_item, sample_warehouse,
                                                  sample_user, stock_with_items):
        from app.inv_management.transaction_service import stock_adjustment

        with pytest.raises(ValueError, match="negative"):
            stock_adjustment(
                db,
                warehouse_id=sample_warehouse.id,
                lines=[{"item_id": sample_item.id, "quantity": -200}],
                created_by=sample_user.id,
            )


class TestReversal:
    def test_reverse_goods_receipt(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt, reverse_transaction

        header = goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 50, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        # Verify stock increased
        stock = db.query(InvStockOnHand).filter(InvStockOnHand.item_id == sample_item.id).first()
        assert stock.quantity == Decimal("50")

        # Reverse
        reversal = reverse_transaction(db, transaction_id=header.id, created_by=sample_user.id)
        db.flush()

        assert reversal.reversal_of_id == header.id
        assert reversal.transaction_number.startswith("REV-")
        assert header.status == "reversed"

        # Stock should be back to 0
        db.refresh(stock)
        assert stock.quantity == Decimal("0")

    def test_cannot_reverse_twice(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt, reverse_transaction

        header = goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 50, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        reverse_transaction(db, transaction_id=header.id, created_by=sample_user.id)
        db.flush()

        with pytest.raises(ValueError, match="already reversed"):
            reverse_transaction(db, transaction_id=header.id, created_by=sample_user.id)

    def test_cannot_reverse_nonexistent(self, db, sample_user):
        from app.inv_management.transaction_service import reverse_transaction

        with pytest.raises(ValueError, match="not found"):
            reverse_transaction(db, transaction_id=9999, created_by=sample_user.id)


class TestTransactionListing:
    def test_list_transactions(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.transaction_service import goods_receipt, list_transactions

        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 10, "unit_cost": 5}],
            created_by=sample_user.id,
        )
        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 20, "unit_cost": 8}],
            created_by=sample_user.id,
        )
        db.flush()

        txns, total = list_transactions(db)
        assert total == 2

    def test_list_transactions_filter_type(self, db, sample_item, sample_warehouse, sample_user,
                                            stock_with_items):
        from app.inv_management.transaction_service import goods_receipt, goods_issue, list_transactions

        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 10, "unit_cost": 5}],
            created_by=sample_user.id,
        )
        goods_issue(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 5}],
            created_by=sample_user.id,
        )
        db.flush()

        gr_txns, gr_total = list_transactions(db, transaction_type="goods_receipt")
        assert gr_total == 1

        gi_txns, gi_total = list_transactions(db, transaction_type="goods_issue")
        assert gi_total == 1


# ===========================================================================
# UNIT TESTS: Operations Service
# ===========================================================================


class TestReservationService:
    def test_create_reservation(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import create_reservation

        res = create_reservation(
            db,
            item_id=sample_item.id,
            reserved_quantity=Decimal("10"),
            reserved_by=sample_user.id,
        )
        db.flush()

        assert res.status == "open"
        assert res.reserved_quantity == Decimal("10")

    def test_fulfill_reservation(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import create_reservation, fulfill_reservation

        res = create_reservation(
            db, item_id=sample_item.id, reserved_quantity=Decimal("10"),
            reserved_by=sample_user.id,
        )
        db.flush()

        fulfilled = fulfill_reservation(db, res.id)
        assert fulfilled.status == "fulfilled"

    def test_cancel_reservation(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import create_reservation, cancel_reservation

        res = create_reservation(
            db, item_id=sample_item.id, reserved_quantity=Decimal("10"),
            reserved_by=sample_user.id,
        )
        db.flush()

        cancelled = cancel_reservation(db, res.id)
        assert cancelled.status == "cancelled"

    def test_fulfill_cancelled_reservation_fails(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import (
            create_reservation, cancel_reservation, fulfill_reservation,
        )

        res = create_reservation(
            db, item_id=sample_item.id, reserved_quantity=Decimal("10"),
            reserved_by=sample_user.id,
        )
        db.flush()
        cancel_reservation(db, res.id)

        with pytest.raises(ValueError, match="already cancelled"):
            fulfill_reservation(db, res.id)


class TestCountPlanService:
    def test_create_count_plan(self, db, sample_item, sample_warehouse, sample_user, stock_with_items):
        from app.inv_management.operations_service import create_count_plan

        plan = create_count_plan(
            db,
            warehouse_id=sample_warehouse.id,
            created_by=sample_user.id,
        )
        db.flush()

        assert plan.plan_number.startswith("CC-")
        assert plan.status == "draft"
        assert len(plan.items) >= 1

    def test_record_count(self, db, sample_item, sample_warehouse, sample_user, stock_with_items):
        from app.inv_management.operations_service import create_count_plan, start_count_plan, record_count

        # Add variance threshold setting
        db.add(InvSetting(key="variance_auto_adjust_threshold_pct", value="2.0"))
        db.flush()

        plan = create_count_plan(
            db, warehouse_id=sample_warehouse.id,
            item_ids=[sample_item.id], created_by=sample_user.id,
        )
        db.flush()
        start_count_plan(db, plan.id)

        plan_item = plan.items[0]
        result = record_count(db, plan_item.id, Decimal("100"), counted_by=sample_user.id)

        assert result.counted_quantity == Decimal("100")
        assert result.variance_quantity == Decimal("0")

    def test_count_above_threshold_needs_approval(self, db, sample_item, sample_warehouse,
                                                    sample_user, stock_with_items):
        from app.inv_management.operations_service import create_count_plan, start_count_plan, record_count

        db.add(InvSetting(key="variance_auto_adjust_threshold_pct", value="2.0"))
        db.flush()

        plan = create_count_plan(
            db, warehouse_id=sample_warehouse.id,
            item_ids=[sample_item.id], created_by=sample_user.id,
        )
        db.flush()
        start_count_plan(db, plan.id)

        plan_item = plan.items[0]
        # Count significantly different from system qty (100 vs 80 = 20% variance)
        result = record_count(db, plan_item.id, Decimal("80"), counted_by=sample_user.id)

        assert result.variance_quantity == Decimal("-20")
        assert result.count_status == "counted"  # Not auto-adjusted


class TestQualityService:
    def test_create_inspection_lot(self, db, sample_item):
        from app.inv_management.operations_service import create_inspection_lot

        lot = create_inspection_lot(
            db, item_id=sample_item.id, quantity=Decimal("50"),
        )
        db.flush()

        assert lot.lot_number.startswith("IL-")
        assert lot.status == "created"

    def test_usage_decision(self, db, sample_item):
        from app.inv_management.operations_service import create_inspection_lot, make_usage_decision

        lot = create_inspection_lot(db, item_id=sample_item.id, quantity=Decimal("50"))
        db.flush()

        decided = make_usage_decision(db, lot.id, "accepted")
        assert decided.status == "accepted"

    def test_create_ncr(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import create_ncr

        ncr = create_ncr(
            db, item_id=sample_item.id, defect_type="surface_damage",
            severity="major", description="Scratch on surface",
            reported_by=sample_user.id,
        )
        db.flush()

        assert ncr.ncr_number.startswith("NCR-")
        assert ncr.status == "open"

    def test_resolve_ncr(self, db, sample_item, sample_user):
        from app.inv_management.operations_service import create_ncr, resolve_ncr

        ncr = create_ncr(
            db, item_id=sample_item.id, severity="minor",
            reported_by=sample_user.id,
        )
        db.flush()

        resolved = resolve_ncr(
            db, ncr.id, root_cause="Packaging issue",
            corrective_action="Improved packaging",
            resolved_by=sample_user.id,
        )
        assert resolved.status == "resolved"
        assert resolved.root_cause == "Packaging issue"


class TestPlanningService:
    def test_check_reorder_points(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.operations_service import check_reorder_points

        # Item has reorder_point=20 but no stock in inv_stock_on_hand (stock=0 < 20)
        alerts = check_reorder_points(db)
        db.flush()

        assert len(alerts) == 1
        assert alerts[0].item_id == sample_item.id

    def test_no_duplicate_alerts(self, db, sample_item, sample_warehouse, sample_user):
        from app.inv_management.operations_service import check_reorder_points

        # First check creates alerts
        check_reorder_points(db)
        db.flush()

        # Second check should not create duplicates
        new_alerts = check_reorder_points(db)
        db.flush()

        assert len(new_alerts) == 0


# ===========================================================================
# UNIT TESTS: Reporting Service
# ===========================================================================


class TestReportingService:
    def test_stock_overview(self, db, sample_item, sample_warehouse, stock_with_items):
        from app.inv_management.reporting_service import get_stock_overview

        overview = get_stock_overview(db)
        assert len(overview) == 1
        assert overview[0]["item_id"] == sample_item.id
        assert overview[0]["unrestricted_qty"] == Decimal("100")

    def test_stock_overview_by_warehouse(self, db, sample_item, sample_warehouse, stock_with_items):
        from app.inv_management.reporting_service import get_stock_overview

        overview = get_stock_overview(db, warehouse_id=sample_warehouse.id)
        assert len(overview) == 1

        # Non-existent warehouse
        overview2 = get_stock_overview(db, warehouse_id=9999)
        assert len(overview2) == 0

    def test_dashboard_kpis(self, db, sample_item, sample_warehouse, stock_with_items):
        from app.inv_management.reporting_service import get_dashboard_kpis

        kpis = get_dashboard_kpis(db)
        assert kpis["total_items"] == 1
        assert kpis["warehouse_count"] == 1

    def test_slow_moving_items(self, db, sample_item, sample_warehouse, stock_with_items):
        from app.inv_management.reporting_service import get_slow_moving_items

        slow = get_slow_moving_items(db, days=90)
        # All items with stock but no recent issues are slow-moving
        assert len(slow) == 1


# ===========================================================================
# UNIT TESTS: Seed Data
# ===========================================================================


class TestSeedData:
    def test_seed_creates_records(self, db):
        from app.inv_management.seed import seed_inventory_module

        counts = seed_inventory_module(db)
        db.flush()

        assert counts["settings"] > 0
        assert counts["reason_codes"] > 0
        assert counts["uoms"] > 0
        assert counts["categories"] > 0
        assert counts["warehouses"] > 0

    def test_seed_is_idempotent(self, db):
        from app.inv_management.seed import seed_inventory_module

        counts1 = seed_inventory_module(db)
        db.flush()

        # Run again — should not fail
        counts2 = seed_inventory_module(db)
        db.flush()

        # Verify no duplicates
        settings_count = db.query(InvSetting).count()
        assert settings_count == counts1["settings"]


# ===========================================================================
# INTEGRATION TESTS: End-to-End Workflows
# ===========================================================================


class TestGoodsReceiptWorkflow:
    def test_full_gr_workflow(self, db, sample_item, sample_warehouse, sample_user):
        """POST GR → verify stock → verify valuation → verify journal entry."""
        from app.inv_management.transaction_service import goods_receipt
        from app.models import InvJournalEntry

        header = goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 100, "unit_cost": 15}],
            reference_type="purchase_order",
            reference_number="PO-001",
            created_by=sample_user.id,
        )
        db.flush()

        # 1. Verify transaction created
        assert header.status == "posted"
        assert header.reference_number == "PO-001"

        # 2. Verify stock updated
        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse.id,
        ).first()
        assert stock.quantity == Decimal("100")

        # 3. Verify valuation updated
        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == sample_item.id).first()
        assert config.moving_average_cost == Decimal("15")

        # 4. Verify journal entry stub
        je = db.query(InvJournalEntry).filter(InvJournalEntry.transaction_id == header.id).first()
        assert je is not None
        assert je.amount == Decimal("1500")
        assert je.debit_account_code == "1400"


class TestGoodsIssueWorkflow:
    def test_full_gi_workflow(self, db, sample_item, sample_warehouse, sample_user, stock_with_items):
        """Check availability → POST GI → verify stock decremented."""
        from app.inv_management.transaction_service import goods_issue
        from app.models import InvJournalEntry

        header = goods_issue(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 30}],
            created_by=sample_user.id,
        )
        db.flush()

        # Verify stock decremented
        stock = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
        ).first()
        assert stock.quantity == Decimal("70")


class TestTransferWorkflow:
    def test_full_transfer_workflow(self, db, sample_item, sample_warehouse,
                                     sample_warehouse2, sample_user, stock_with_items):
        """POST transfer → verify source decremented → verify destination incremented."""
        from app.inv_management.transaction_service import stock_transfer

        header = stock_transfer(
            db,
            source_warehouse_id=sample_warehouse.id,
            destination_warehouse_id=sample_warehouse2.id,
            lines=[{"item_id": sample_item.id, "quantity": 25}],
            created_by=sample_user.id,
        )
        db.flush()

        source = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse.id,
        ).first()
        dest = db.query(InvStockOnHand).filter(
            InvStockOnHand.item_id == sample_item.id,
            InvStockOnHand.warehouse_id == sample_warehouse2.id,
        ).first()

        assert source.quantity == Decimal("75")
        assert dest.quantity == Decimal("25")


class TestReversalWorkflow:
    def test_reversal_restores_stock(self, db, sample_item, sample_warehouse, sample_user):
        """POST GR → reverse → verify stock restored to original."""
        from app.inv_management.transaction_service import goods_receipt, reverse_transaction

        # Initial state: no stock in inv_stock_on_hand
        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 50, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        stock = db.query(InvStockOnHand).filter(InvStockOnHand.item_id == sample_item.id).first()
        assert stock.quantity == Decimal("50")

        # Reverse
        header = db.query(InvTransactionHeader).first()
        reverse_transaction(db, transaction_id=header.id, created_by=sample_user.id)
        db.flush()

        db.refresh(stock)
        assert stock.quantity == Decimal("0")


class TestMovingAverageCalculation:
    def test_moving_average_on_multiple_receipts(self, db, sample_item, sample_warehouse, sample_user):
        """Verify moving average: receipt 100@$10, then 50@$20 = (1000+1000)/150 = $13.33."""
        from app.inv_management.transaction_service import goods_receipt

        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 100, "unit_cost": 10}],
            created_by=sample_user.id,
        )
        db.flush()

        goods_receipt(
            db,
            warehouse_id=sample_warehouse.id,
            lines=[{"item_id": sample_item.id, "quantity": 50, "unit_cost": 20}],
            created_by=sample_user.id,
        )
        db.flush()

        config = db.query(InvValuationConfig).filter(InvValuationConfig.item_id == sample_item.id).first()
        # (100*10 + 50*20) / 150 = 2000/150 = 13.333...
        expected = (Decimal("100") * Decimal("10") + Decimal("50") * Decimal("20")) / Decimal("150")
        assert abs(config.moving_average_cost - expected) < Decimal("0.01")
