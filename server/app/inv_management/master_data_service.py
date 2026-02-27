"""Master data services for warehouses, categories, UoMs, batches, serials, and reason codes."""

from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    InvAisle,
    InvBatch,
    InvBin,
    InvItemCategory,
    InvRack,
    InvReasonCode,
    InvSerial,
    InvShelf,
    InvUom,
    InvUomConversion,
    InvWarehouse,
    InvZone,
    Item,
)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

def create_category(db: Session, *, parent_id: int | None, name: str, code: str,
                    description: str | None = None, sort_order: int = 0,
                    inherited_properties: dict | None = None) -> InvItemCategory:
    """Create a category with materialized path."""
    level = 0
    path = "/"
    if parent_id:
        parent = db.query(InvItemCategory).filter(InvItemCategory.id == parent_id).first()
        if not parent:
            raise ValueError(f"Parent category {parent_id} not found")
        level = parent.level + 1
        path = f"{parent.path}{parent.id}/"

    cat = InvItemCategory(
        parent_id=parent_id,
        name=name,
        code=code,
        description=description,
        level=level,
        sort_order=sort_order,
        inherited_properties=inherited_properties,
        path=path,
    )
    db.add(cat)
    db.flush()
    # Update path to include self
    cat.path = f"{path}{cat.id}/"
    return cat


def list_categories(db: Session, *, parent_id: int | None = None) -> list[InvItemCategory]:
    """List categories, optionally filtered by parent."""
    q = db.query(InvItemCategory).filter(InvItemCategory.is_active.is_(True))
    if parent_id is not None:
        q = q.filter(InvItemCategory.parent_id == parent_id)
    return q.order_by(InvItemCategory.sort_order, InvItemCategory.name).all()


def get_category_tree(db: Session) -> list[InvItemCategory]:
    """Get top-level categories (the full tree is assembled via relationships)."""
    return (
        db.query(InvItemCategory)
        .filter(InvItemCategory.parent_id.is_(None), InvItemCategory.is_active.is_(True))
        .order_by(InvItemCategory.sort_order, InvItemCategory.name)
        .all()
    )


# ---------------------------------------------------------------------------
# UoM
# ---------------------------------------------------------------------------

def create_uom(db: Session, *, code: str, name: str, category: str = "quantity", is_base: bool = False) -> InvUom:
    uom = InvUom(code=code, name=name, category=category, is_base=is_base)
    db.add(uom)
    db.flush()
    return uom


def list_uoms(db: Session) -> list[InvUom]:
    return db.query(InvUom).order_by(InvUom.category, InvUom.code).all()


def create_uom_conversion(db: Session, *, item_id: int | None, from_uom_id: int,
                           to_uom_id: int, conversion_factor: Decimal) -> InvUomConversion:
    conv = InvUomConversion(
        item_id=item_id,
        from_uom_id=from_uom_id,
        to_uom_id=to_uom_id,
        conversion_factor=conversion_factor,
    )
    db.add(conv)
    db.flush()
    return conv


def list_uom_conversions(db: Session) -> list[InvUomConversion]:
    return db.query(InvUomConversion).filter(InvUomConversion.is_active.is_(True)).all()


# ---------------------------------------------------------------------------
# Warehouses & Hierarchy
# ---------------------------------------------------------------------------

def create_warehouse(db: Session, **kwargs) -> InvWarehouse:
    wh = InvWarehouse(**kwargs)
    db.add(wh)
    db.flush()
    return wh


def list_warehouses(db: Session) -> list[InvWarehouse]:
    return db.query(InvWarehouse).filter(InvWarehouse.is_active.is_(True)).order_by(InvWarehouse.name).all()


def get_warehouse(db: Session, warehouse_id: int) -> InvWarehouse | None:
    return db.query(InvWarehouse).filter(InvWarehouse.id == warehouse_id).first()


def create_zone(db: Session, warehouse_id: int, **kwargs) -> InvZone:
    zone = InvZone(warehouse_id=warehouse_id, **kwargs)
    db.add(zone)
    db.flush()
    return zone


def list_zones(db: Session, warehouse_id: int) -> list[InvZone]:
    return db.query(InvZone).filter(InvZone.warehouse_id == warehouse_id, InvZone.is_active.is_(True)).all()


def create_aisle(db: Session, zone_id: int, **kwargs) -> InvAisle:
    aisle = InvAisle(zone_id=zone_id, **kwargs)
    db.add(aisle)
    db.flush()
    return aisle


def create_rack(db: Session, aisle_id: int, **kwargs) -> InvRack:
    rack = InvRack(aisle_id=aisle_id, **kwargs)
    db.add(rack)
    db.flush()
    return rack


def create_shelf(db: Session, rack_id: int, **kwargs) -> InvShelf:
    shelf = InvShelf(rack_id=rack_id, **kwargs)
    db.add(shelf)
    db.flush()
    return shelf


def create_bin(db: Session, shelf_id: int, **kwargs) -> InvBin:
    bin_ = InvBin(shelf_id=shelf_id, **kwargs)
    db.add(bin_)
    db.flush()
    return bin_


def get_bin(db: Session, bin_id: int) -> InvBin | None:
    return db.query(InvBin).filter(InvBin.id == bin_id).first()


def list_bins(db: Session, shelf_id: int) -> list[InvBin]:
    return db.query(InvBin).filter(InvBin.shelf_id == shelf_id, InvBin.is_active.is_(True)).all()


# ---------------------------------------------------------------------------
# Batches
# ---------------------------------------------------------------------------

def _generate_batch_number(db: Session, item_id: int) -> str:
    """Generate batch number like ITEM-YYYYMMDD-001."""
    today = date.today().strftime("%Y%m%d")
    pattern = f"%-{today}-%"
    count = (
        db.query(func.count(InvBatch.id))
        .filter(InvBatch.item_id == item_id, InvBatch.batch_number.like(pattern))
        .scalar()
    )
    item = db.query(Item).filter(Item.id == item_id).first()
    prefix = (item.sku or str(item_id))[:10]
    return f"{prefix}-{today}-{(count or 0) + 1:03d}"


def create_batch(db: Session, *, item_id: int, batch_number: str | None = None,
                 vendor_batch_number: str | None = None, manufacturing_date: date | None = None,
                 expiry_date: date | None = None, received_date: date | None = None,
                 country_of_origin: str | None = None, notes: str | None = None) -> InvBatch:
    if not batch_number:
        batch_number = _generate_batch_number(db, item_id)
    batch = InvBatch(
        item_id=item_id,
        batch_number=batch_number,
        vendor_batch_number=vendor_batch_number,
        manufacturing_date=manufacturing_date,
        expiry_date=expiry_date,
        received_date=received_date or date.today(),
        country_of_origin=country_of_origin,
        notes=notes,
    )
    db.add(batch)
    db.flush()
    return batch


def list_batches(db: Session, item_id: int | None = None) -> list[InvBatch]:
    q = db.query(InvBatch)
    if item_id:
        q = q.filter(InvBatch.item_id == item_id)
    return q.order_by(InvBatch.created_at.desc()).all()


def get_batch(db: Session, batch_id: int) -> InvBatch | None:
    return db.query(InvBatch).filter(InvBatch.id == batch_id).first()


def get_expiring_batches(db: Session, days: int = 30) -> list[InvBatch]:
    cutoff = date.today()
    from datetime import timedelta
    expiry_limit = cutoff + timedelta(days=days)
    return (
        db.query(InvBatch)
        .filter(
            InvBatch.expiry_date.isnot(None),
            InvBatch.expiry_date <= expiry_limit,
            InvBatch.expiry_date >= cutoff,
            InvBatch.status != "expired",
        )
        .order_by(InvBatch.expiry_date.asc())
        .all()
    )


# ---------------------------------------------------------------------------
# Serials
# ---------------------------------------------------------------------------

def create_serial(db: Session, *, item_id: int, serial_number: str,
                  batch_id: int | None = None, current_warehouse_id: int | None = None,
                  notes: str | None = None) -> InvSerial:
    serial = InvSerial(
        item_id=item_id,
        serial_number=serial_number,
        batch_id=batch_id,
        current_warehouse_id=current_warehouse_id,
        notes=notes,
    )
    db.add(serial)
    db.flush()
    return serial


def list_serials(db: Session, item_id: int | None = None) -> list[InvSerial]:
    q = db.query(InvSerial)
    if item_id:
        q = q.filter(InvSerial.item_id == item_id)
    return q.order_by(InvSerial.created_at.desc()).all()


def get_serial(db: Session, serial_id: int) -> InvSerial | None:
    return db.query(InvSerial).filter(InvSerial.id == serial_id).first()


# ---------------------------------------------------------------------------
# Reason Codes
# ---------------------------------------------------------------------------

def list_reason_codes(db: Session) -> list[InvReasonCode]:
    return db.query(InvReasonCode).filter(InvReasonCode.is_active.is_(True)).all()
