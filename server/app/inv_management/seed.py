"""Seed data for the SAP-level inventory management module."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    InvBatch,
    InvItemCategory,
    InvReasonCode,
    InvSetting,
    InvUom,
    InvUomConversion,
    InvWarehouse,
    InvZone,
    InvAisle,
    InvRack,
    InvShelf,
    InvBin,
)


def seed_inventory_module(db: Session) -> dict:
    """Seed all inventory module reference data. Returns counts of created records."""
    counts = {}

    # --- Settings ---
    settings = [
        ("default_valuation_method", "moving_average", "Default inventory valuation method"),
        ("auto_generate_batch_numbers", "true", "Auto-generate batch numbers on receipt"),
        ("batch_number_pattern", "{SKU}-{YYYYMMDD}-{SEQ}", "Pattern for batch number generation"),
        ("variance_auto_adjust_threshold_pct", "2.0", "Auto-adjust variance if within this %"),
        ("negative_stock_allowed", "false", "Allow negative stock quantities"),
        ("reservation_expiry_days", "30", "Days before unfulfilled reservations expire"),
        ("default_pick_strategy", "FIFO", "Default picking strategy (FIFO/FEFO/LIFO)"),
        ("fifo_enforcement", "true", "Enforce FIFO for goods issues"),
    ]
    for key, value, desc in settings:
        existing = db.query(InvSetting).filter(InvSetting.key == key).first()
        if not existing:
            db.add(InvSetting(key=key, value=value, description=desc))
    counts["settings"] = len(settings)

    # --- Reason Codes ---
    reason_codes = [
        ("CC_VARIANCE", "Cycle count variance", ["stock_adjustment"], False),
        ("DAMAGE", "Damaged goods", ["stock_adjustment", "goods_issue", "return_inbound"], False),
        ("EXPIRY", "Expired stock", ["stock_adjustment", "goods_issue"], False),
        ("QUALITY_REJECT", "Quality rejection", ["stock_adjustment", "return_outbound"], True),
        ("PROD_SCRAP", "Production scrap", ["stock_adjustment"], False),
        ("CUST_RETURN", "Customer return", ["return_inbound"], False),
        ("MANUAL_CORRECTION", "Manual correction", ["stock_adjustment"], True),
        ("REVALUATION", "Inventory revaluation", ["stock_adjustment"], True),
        ("OPENING_BALANCE", "Opening balance entry", ["stock_adjustment"], False),
        ("CONSUMPTION", "Production consumption", ["goods_issue"], False),
    ]
    for code, desc, txn_types, requires_approval in reason_codes:
        existing = db.query(InvReasonCode).filter(InvReasonCode.code == code).first()
        if not existing:
            db.add(InvReasonCode(
                code=code, description=desc,
                transaction_types=txn_types,
                requires_approval=requires_approval,
            ))
    counts["reason_codes"] = len(reason_codes)

    # --- UoMs ---
    uoms_data = [
        ("PCS", "Pieces", "quantity", True),
        ("EA", "Each", "quantity", False),
        ("BOX", "Box", "quantity", False),
        ("CTN", "Carton", "quantity", False),
        ("PAL", "Pallet", "quantity", False),
        ("KG", "Kilogram", "weight", True),
        ("G", "Gram", "weight", False),
        ("LB", "Pound", "weight", False),
        ("L", "Liter", "volume", True),
        ("ML", "Milliliter", "volume", False),
        ("GAL", "Gallon", "volume", False),
        ("M", "Meter", "length", True),
        ("CM", "Centimeter", "length", False),
        ("IN", "Inch", "length", False),
        ("FT", "Foot", "length", False),
    ]
    uom_map = {}
    for code, name, category, is_base in uoms_data:
        existing = db.query(InvUom).filter(InvUom.code == code).first()
        if not existing:
            uom = InvUom(code=code, name=name, category=category, is_base=is_base)
            db.add(uom)
            db.flush()
            uom_map[code] = uom.id
        else:
            uom_map[code] = existing.id
    counts["uoms"] = len(uoms_data)

    # --- UoM Conversions ---
    conversions = [
        ("BOX", "PCS", Decimal("12")),
        ("CTN", "PCS", Decimal("48")),
        ("PAL", "CTN", Decimal("40")),
        ("KG", "G", Decimal("1000")),
        ("LB", "KG", Decimal("0.4535924")),
        ("L", "ML", Decimal("1000")),
        ("GAL", "L", Decimal("3.785412")),
        ("M", "CM", Decimal("100")),
        ("FT", "IN", Decimal("12")),
        ("M", "FT", Decimal("3.28084")),
    ]
    for from_code, to_code, factor in conversions:
        from_id = uom_map.get(from_code)
        to_id = uom_map.get(to_code)
        if from_id and to_id:
            existing = db.query(InvUomConversion).filter(
                InvUomConversion.from_uom_id == from_id,
                InvUomConversion.to_uom_id == to_id,
                InvUomConversion.item_id.is_(None),
            ).first()
            if not existing:
                db.add(InvUomConversion(from_uom_id=from_id, to_uom_id=to_id, conversion_factor=factor))
    counts["uom_conversions"] = len(conversions)

    # --- Item Categories ---
    categories_data = [
        (None, "Electronics", "ELEC", 0),
        (None, "Hardware", "HW", 0),
        (None, "Consumables", "CONS", 0),
        (None, "Raw Materials", "RAW", 0),
        (None, "Packaging", "PKG", 0),
    ]
    cat_map = {}
    for parent_code, name, code, level in categories_data:
        existing = db.query(InvItemCategory).filter(InvItemCategory.code == code).first()
        if not existing:
            parent_id = cat_map.get(parent_code)
            cat = InvItemCategory(
                parent_id=parent_id, name=name, code=code,
                level=level, path=f"/{code}/",
            )
            db.add(cat)
            db.flush()
            cat_map[code] = cat.id
        else:
            cat_map[code] = existing.id

    # Sub-categories
    sub_cats = [
        ("ELEC", "Semiconductors", "SEMI", 1),
        ("ELEC", "Displays", "DISP", 1),
        ("ELEC", "Cables & Connectors", "CABLE", 1),
        ("HW", "Fasteners", "FAST", 1),
        ("HW", "Tools", "TOOL", 1),
        ("CONS", "Lubricants", "LUBE", 1),
        ("CONS", "Cleaning Supplies", "CLEAN", 1),
        ("RAW", "Metals", "METAL", 1),
        ("RAW", "Plastics", "PLAST", 1),
        ("PKG", "Boxes", "PBOX", 1),
        ("PKG", "Wrapping", "WRAP", 1),
    ]
    for parent_code, name, code, level in sub_cats:
        existing = db.query(InvItemCategory).filter(InvItemCategory.code == code).first()
        if not existing:
            parent_id = cat_map.get(parent_code)
            cat = InvItemCategory(
                parent_id=parent_id, name=name, code=code,
                level=level, path=f"/{parent_code}/{code}/",
            )
            db.add(cat)
            db.flush()
            cat_map[code] = cat.id
    counts["categories"] = len(categories_data) + len(sub_cats)

    # --- Warehouses ---
    warehouses_data = [
        ("WH-MAIN", "Main Warehouse", "standard", "123 Industrial Ave", "Austin", "TX", "US", "78701"),
        ("WH-COLD", "Cold Storage Facility", "cold_storage", "456 Frozen Ln", "Austin", "TX", "US", "78702"),
        ("WH-QA", "Quality Inspection Warehouse", "quarantine", "789 Test Dr", "Austin", "TX", "US", "78703"),
    ]
    wh_map = {}
    for code, name, wh_type, addr, city, state, country, postal in warehouses_data:
        existing = db.query(InvWarehouse).filter(InvWarehouse.code == code).first()
        if not existing:
            wh = InvWarehouse(
                code=code, name=name, warehouse_type=wh_type,
                address_line1=addr, city=city, state=state, country=country, postal_code=postal,
            )
            db.add(wh)
            db.flush()
            wh_map[code] = wh.id
        else:
            wh_map[code] = existing.id
    counts["warehouses"] = len(warehouses_data)

    # --- Zones, Aisles, Racks, Shelves, Bins for Main Warehouse ---
    main_wh_id = wh_map.get("WH-MAIN")
    if main_wh_id:
        zones = [
            ("RCV", "Receiving Zone", "receiving"),
            ("STR-A", "Storage Zone A", "storage"),
            ("STR-B", "Storage Zone B", "storage"),
            ("PKG", "Packing Zone", "packing"),
            ("SHP", "Shipping Zone", "shipping"),
        ]
        zone_map = {}
        for z_code, z_name, z_type in zones:
            existing = db.query(InvZone).filter(InvZone.warehouse_id == main_wh_id, InvZone.code == z_code).first()
            if not existing:
                zone = InvZone(warehouse_id=main_wh_id, code=z_code, name=z_name, zone_type=z_type)
                db.add(zone)
                db.flush()
                zone_map[z_code] = zone.id
            else:
                zone_map[z_code] = existing.id

        # Create bins in storage zones
        bin_count = 0
        for zone_code in ["STR-A", "STR-B"]:
            zone_id = zone_map.get(zone_code)
            if not zone_id:
                continue
            for aisle_num in range(1, 4):
                aisle_code = f"A{aisle_num:02d}"
                existing_aisle = db.query(InvAisle).filter(InvAisle.zone_id == zone_id, InvAisle.code == aisle_code).first()
                if not existing_aisle:
                    aisle = InvAisle(zone_id=zone_id, code=aisle_code, name=f"Aisle {aisle_num}", sort_order=aisle_num)
                    db.add(aisle)
                    db.flush()
                    aisle_id = aisle.id
                else:
                    aisle_id = existing_aisle.id

                for rack_num in range(1, 5):
                    rack_code = f"R{rack_num:02d}"
                    existing_rack = db.query(InvRack).filter(InvRack.aisle_id == aisle_id, InvRack.code == rack_code).first()
                    if not existing_rack:
                        rack = InvRack(aisle_id=aisle_id, code=rack_code, name=f"Rack {rack_num}", sort_order=rack_num)
                        db.add(rack)
                        db.flush()
                        rack_id = rack.id
                    else:
                        rack_id = existing_rack.id

                    for shelf_num in range(1, 4):
                        shelf_code = f"S{shelf_num:02d}"
                        existing_shelf = db.query(InvShelf).filter(InvShelf.rack_id == rack_id, InvShelf.code == shelf_code).first()
                        if not existing_shelf:
                            shelf = InvShelf(rack_id=rack_id, code=shelf_code, name=f"Shelf {shelf_num}", level_number=shelf_num)
                            db.add(shelf)
                            db.flush()
                            shelf_id = shelf.id
                        else:
                            shelf_id = existing_shelf.id

                        for bin_num in range(1, 4):
                            bin_code = f"{zone_code}-{aisle_code}-{rack_code}-{shelf_code}-B{bin_num:02d}"
                            existing_bin = db.query(InvBin).filter(InvBin.shelf_id == shelf_id, InvBin.code == bin_code).first()
                            if not existing_bin:
                                db.add(InvBin(shelf_id=shelf_id, code=bin_code, name=f"Bin {bin_num}", bin_type="standard"))
                                bin_count += 1

        counts["bins"] = bin_count

    db.flush()
    return counts
