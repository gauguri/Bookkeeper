from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.postgresql import JSONB

from app.db import Base
from app.models import Inventory, InventoryReservation, Item, SalesRequest
from app.routers.inventory import get_inventory_overview


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(_element, _compiler, **_kwargs):
    return "JSON"


def create_session():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_inventory_overview_uses_inventory_total_value_and_quantities():
    db = create_session()
    item = Item(name="Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add(item)
    db.flush()

    db.add(
        Inventory(
            item_id=item.id,
            quantity_on_hand=Decimal("10.00"),
            landed_unit_cost=Decimal("0.00"),
            total_value=Decimal("11414.00"),
        )
    )

    sales_request = SalesRequest(request_number="SR-INV-1", customer_id=None, status="NEW")
    db.add(sales_request)
    db.flush()
    db.add(
        InventoryReservation(
            item_id=item.id,
            source_type="sales_request",
            source_id=sales_request.id,
            sales_request_id=sales_request.id,
            qty_reserved=Decimal("2.00"),
        )
    )
    db.commit()

    response = get_inventory_overview(limit=10, db=db)

    assert response.totals.total_inventory_value == Decimal("11414.00")
    assert response.totals.total_on_hand_qty == Decimal("10.00")
    assert response.totals.total_reserved_qty == Decimal("2.00")
    assert response.totals.total_available_qty == Decimal("8.00")

    assert len(response.items) == 1
    row = response.items[0]
    assert row.item_name == "Widget"
    assert row.on_hand_qty == Decimal("10.00")
    assert row.reserved_qty == Decimal("2.00")
    assert row.available_qty == Decimal("8.00")
    assert row.total_value == Decimal("11414.00")


def test_inventory_overview_excludes_zero_quantity_rows_from_value_totals():
    db = create_session()
    stocked_item = Item(name="Stocked Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    zero_qty_item = Item(name="Zero Widget", unit_price=Decimal("10.00"), on_hand_qty=Decimal("0"), reserved_qty=Decimal("0"))
    db.add_all([stocked_item, zero_qty_item])
    db.flush()

    db.add_all(
        [
            Inventory(
                item_id=stocked_item.id,
                quantity_on_hand=Decimal("5.00"),
                landed_unit_cost=Decimal("20.00"),
                total_value=Decimal("100.00"),
            ),
            Inventory(
                item_id=zero_qty_item.id,
                quantity_on_hand=Decimal("0.00"),
                landed_unit_cost=Decimal("5000.00"),
                total_value=Decimal("999999.00"),
            ),
        ]
    )
    db.commit()

    response = get_inventory_overview(limit=10, db=db)

    assert response.totals.total_on_hand_qty == Decimal("5.00")
    assert response.totals.total_inventory_value == Decimal("100.00")
    assert len(response.items) == 1
    assert response.items[0].item_name == "Stocked Widget"
