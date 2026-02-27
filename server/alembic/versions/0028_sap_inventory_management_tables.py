"""SAP-level inventory management tables

Revision ID: 0028_sap_inventory_management_tables
Revises: 0027_inventory_item_lead_time_days
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0028_sap_inventory_management_tables"
down_revision = "0027_inventory_item_lead_time_days"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Item Categories ---
    op.create_table(
        "inv_item_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("inv_item_categories.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("inherited_properties", JSONB(), nullable=True),
        sa.Column("path", sa.String(500), nullable=False, server_default="/"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inv_item_categories_parent", "inv_item_categories", ["parent_id"])
    op.create_index("ix_inv_item_categories_path", "inv_item_categories", ["path"])
    op.create_index("ix_inv_item_categories_code", "inv_item_categories", ["code"])

    # --- UoM ---
    op.create_table(
        "inv_uom",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="quantity"),
        sa.Column("is_base", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_inv_uom_category", "inv_uom", ["category"])

    # --- UoM Conversions ---
    op.create_table(
        "inv_uom_conversions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=True),
        sa.Column("from_uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=False),
        sa.Column("to_uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=False),
        sa.Column("conversion_factor", sa.Numeric(20, 10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("item_id", "from_uom_id", "to_uom_id", name="uq_inv_uom_conversion"),
    )

    # --- Warehouses ---
    op.create_table(
        "inv_warehouses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("warehouse_type", sa.String(30), nullable=False, server_default="standard"),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("contact_person", sa.String(200), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("operating_hours", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inv_warehouses_type", "inv_warehouses", ["warehouse_type"])

    # --- Zones ---
    op.create_table(
        "inv_zones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("zone_type", sa.String(30), nullable=False, server_default="storage"),
        sa.Column("temperature_min", sa.Numeric(6, 2), nullable=True),
        sa.Column("temperature_max", sa.Numeric(6, 2), nullable=True),
        sa.Column("humidity_min", sa.Numeric(5, 2), nullable=True),
        sa.Column("humidity_max", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("warehouse_id", "code", name="uq_inv_zone_code"),
    )
    op.create_index("ix_inv_zones_warehouse", "inv_zones", ["warehouse_id"])

    # --- Aisles ---
    op.create_table(
        "inv_aisles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("inv_zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("zone_id", "code", name="uq_inv_aisle_code"),
    )

    # --- Racks ---
    op.create_table(
        "inv_racks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("aisle_id", sa.Integer(), sa.ForeignKey("inv_aisles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("max_weight", sa.Numeric(10, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("aisle_id", "code", name="uq_inv_rack_code"),
    )

    # --- Shelves ---
    op.create_table(
        "inv_shelves",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rack_id", sa.Integer(), sa.ForeignKey("inv_racks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("level_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_weight", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("rack_id", "code", name="uq_inv_shelf_code"),
    )

    # --- Bins ---
    op.create_table(
        "inv_bins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shelf_id", sa.Integer(), sa.ForeignKey("inv_shelves.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("bin_type", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("max_weight", sa.Numeric(10, 2), nullable=True),
        sa.Column("max_volume", sa.Numeric(10, 2), nullable=True),
        sa.Column("length", sa.Numeric(10, 2), nullable=True),
        sa.Column("width", sa.Numeric(10, 2), nullable=True),
        sa.Column("height", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_occupied", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_restricted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("restricted_to_category_id", sa.Integer(), sa.ForeignKey("inv_item_categories.id"), nullable=True),
        sa.Column("restricted_to_item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=True),
        sa.Column("current_utilization_pct", sa.Numeric(5, 2), nullable=True, server_default="0"),
        sa.UniqueConstraint("shelf_id", "code", name="uq_inv_bin_code"),
    )
    op.create_index("ix_inv_bins_type", "inv_bins", ["bin_type"])
    op.create_index("ix_inv_bins_occupied", "inv_bins", ["is_occupied"])

    # --- Batches ---
    op.create_table(
        "inv_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("batch_number", sa.String(100), nullable=False),
        sa.Column("vendor_batch_number", sa.String(100), nullable=True),
        sa.Column("manufacturing_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("received_date", sa.Date(), nullable=True),
        sa.Column("country_of_origin", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="unrestricted"),
        sa.Column("custom_attributes", JSONB(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "batch_number", name="uq_inv_batch_item"),
    )
    op.create_index("ix_inv_batches_item", "inv_batches", ["item_id"])
    op.create_index("ix_inv_batches_expiry", "inv_batches", ["expiry_date"])
    op.create_index("ix_inv_batches_status", "inv_batches", ["status"])

    # --- Serials ---
    op.create_table(
        "inv_serials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("serial_number", sa.String(200), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="in_stock"),
        sa.Column("current_warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("current_bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("warranty_start_date", sa.Date(), nullable=True),
        sa.Column("warranty_end_date", sa.Date(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "serial_number", name="uq_inv_serial_item"),
    )
    op.create_index("ix_inv_serials_item", "inv_serials", ["item_id"])
    op.create_index("ix_inv_serials_status", "inv_serials", ["status"])

    # --- Reason Codes ---
    op.create_table(
        "inv_reason_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(30), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("transaction_types", JSONB(), nullable=False, server_default="[]"),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    # --- Stock On Hand ---
    op.create_table(
        "inv_stock_on_hand",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=False),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("inv_zones.id"), nullable=True),
        sa.Column("bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("serial_id", sa.Integer(), sa.ForeignKey("inv_serials.id"), nullable=True),
        sa.Column("stock_type", sa.String(30), nullable=False, server_default="unrestricted"),
        sa.Column("quantity", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=True),
        sa.Column("last_count_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "warehouse_id", "bin_id", "batch_id", "serial_id", "stock_type", name="uq_inv_stock_on_hand"),
        sa.CheckConstraint("quantity >= 0", name="ck_inv_stock_non_negative"),
    )
    op.create_index("ix_inv_stock_item", "inv_stock_on_hand", ["item_id"])
    op.create_index("ix_inv_stock_warehouse", "inv_stock_on_hand", ["warehouse_id"])
    op.create_index("ix_inv_stock_type", "inv_stock_on_hand", ["stock_type"])
    op.create_index("ix_inv_stock_item_warehouse", "inv_stock_on_hand", ["item_id", "warehouse_id"])

    # --- Transaction Headers ---
    op.create_table(
        "inv_transaction_headers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_number", sa.String(30), nullable=False, unique=True),
        sa.Column("transaction_type", sa.String(30), nullable=False),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("reference_number", sa.String(50), nullable=True),
        sa.Column("source_warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("destination_warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("posting_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("reversal_of_id", sa.Integer(), sa.ForeignKey("inv_transaction_headers.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inv_txn_number", "inv_transaction_headers", ["transaction_number"])
    op.create_index("ix_inv_txn_type", "inv_transaction_headers", ["transaction_type"])
    op.create_index("ix_inv_txn_status", "inv_transaction_headers", ["status"])
    op.create_index("ix_inv_txn_date", "inv_transaction_headers", ["transaction_date"])
    op.create_index("ix_inv_txn_posting_date", "inv_transaction_headers", ["posting_date"])
    op.create_index("ix_inv_txn_reference", "inv_transaction_headers", ["reference_type", "reference_id"])

    # --- Transaction Lines ---
    op.create_table(
        "inv_transaction_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_header_id", sa.Integer(), sa.ForeignKey("inv_transaction_headers.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("serial_id", sa.Integer(), sa.ForeignKey("inv_serials.id"), nullable=True),
        sa.Column("source_bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("destination_bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("source_stock_type", sa.String(30), nullable=True),
        sa.Column("destination_stock_type", sa.String(30), nullable=True),
        sa.Column("unit_cost", sa.Numeric(20, 6), nullable=True, server_default="0"),
        sa.Column("total_cost", sa.Numeric(20, 6), nullable=True, server_default="0"),
        sa.Column("currency_code", sa.String(10), nullable=True, server_default="USD"),
        sa.Column("reason_code_id", sa.Integer(), sa.ForeignKey("inv_reason_codes.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_inv_txn_line_header", "inv_transaction_lines", ["transaction_header_id"])
    op.create_index("ix_inv_txn_line_item", "inv_transaction_lines", ["item_id"])

    # --- Valuation Config ---
    op.create_table(
        "inv_valuation_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=True, unique=True),
        sa.Column("valuation_method", sa.String(30), nullable=False, server_default="moving_average"),
        sa.Column("standard_cost", sa.Numeric(20, 6), nullable=True),
        sa.Column("moving_average_cost", sa.Numeric(20, 6), nullable=True),
        sa.Column("currency_code", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("last_valuation_date", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    # --- Valuation History ---
    op.create_table(
        "inv_valuation_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("opening_qty", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("opening_value", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("received_qty", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("received_value", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("issued_qty", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("issued_value", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("adjustment_qty", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("adjustment_value", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("closing_qty", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("closing_value", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("valuation_method", sa.String(30), nullable=False),
        sa.Column("unit_cost", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("currency_code", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "warehouse_id", "period_year", "period_month", name="uq_inv_valuation_period"),
    )
    op.create_index("ix_inv_valuation_item", "inv_valuation_history", ["item_id"])
    op.create_index("ix_inv_valuation_period", "inv_valuation_history", ["period_year", "period_month"])

    # --- Landing Costs ---
    op.create_table(
        "inv_landing_costs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_line_id", sa.Integer(), sa.ForeignKey("inv_transaction_lines.id"), nullable=False),
        sa.Column("cost_type", sa.String(30), nullable=False),
        sa.Column("amount", sa.Numeric(20, 6), nullable=False),
        sa.Column("currency_code", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("allocated_to_items", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- Reservations ---
    op.create_table(
        "inv_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("serial_id", sa.Integer(), sa.ForeignKey("inv_serials.id"), nullable=True),
        sa.Column("reservation_type", sa.String(10), nullable=False, server_default="soft"),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("reserved_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("fulfilled_quantity", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="open"),
        sa.Column("reserved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reserved_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expiry_date", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_inv_reservations_item", "inv_reservations", ["item_id"])
    op.create_index("ix_inv_reservations_status", "inv_reservations", ["status"])
    op.create_index("ix_inv_reservations_ref", "inv_reservations", ["reference_type", "reference_id"])

    # --- Putaway Rules ---
    op.create_table(
        "inv_putaway_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("rule_type", sa.String(30), nullable=False),
        sa.Column("criteria", JSONB(), nullable=True),
        sa.Column("target_zone_id", sa.Integer(), sa.ForeignKey("inv_zones.id"), nullable=True),
        sa.Column("target_bin_type", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    # --- Pick Lists ---
    op.create_table(
        "inv_pick_lists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pick_list_number", sa.String(30), nullable=False, unique=True),
        sa.Column("pick_type", sa.String(20), nullable=False, server_default="discrete"),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="created"),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("priority", sa.String(10), nullable=False, server_default="normal"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_inv_pick_lists_status", "inv_pick_lists", ["status"])

    # --- Pick List Lines ---
    op.create_table(
        "inv_pick_list_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pick_list_id", sa.Integer(), sa.ForeignKey("inv_pick_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("serial_id", sa.Integer(), sa.ForeignKey("inv_serials.id"), nullable=True),
        sa.Column("from_bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("quantity_requested", sa.Numeric(20, 6), nullable=False),
        sa.Column("quantity_picked", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("uom_id", sa.Integer(), sa.ForeignKey("inv_uom.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("picked_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("picked_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # --- Count Plans ---
    op.create_table(
        "inv_count_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_number", sa.String(30), nullable=False, unique=True),
        sa.Column("plan_type", sa.String(20), nullable=False, server_default="cycle_count"),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("scheduled_date", sa.Date(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("freeze_stock", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_inv_count_plans_status", "inv_count_plans", ["status"])

    # --- Count Plan Items ---
    op.create_table(
        "inv_count_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("count_plan_id", sa.Integer(), sa.ForeignKey("inv_count_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("bin_id", sa.Integer(), sa.ForeignKey("inv_bins.id"), nullable=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("serial_id", sa.Integer(), sa.ForeignKey("inv_serials.id"), nullable=True),
        sa.Column("system_quantity", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("counted_quantity", sa.Numeric(20, 6), nullable=True),
        sa.Column("variance_quantity", sa.Numeric(20, 6), nullable=True),
        sa.Column("variance_pct", sa.Numeric(10, 4), nullable=True),
        sa.Column("variance_value", sa.Numeric(20, 6), nullable=True),
        sa.Column("count_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("counted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("counted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("adjustment_transaction_id", sa.Integer(), sa.ForeignKey("inv_transaction_headers.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_inv_count_items_plan", "inv_count_plan_items", ["count_plan_id"])
    op.create_index("ix_inv_count_items_status", "inv_count_plan_items", ["count_status"])

    # --- Inspection Lots ---
    op.create_table(
        "inv_inspection_lots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lot_number", sa.String(30), nullable=False, unique=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("inv_transaction_headers.id"), nullable=True),
        sa.Column("inspection_type", sa.String(20), nullable=False, server_default="goods_receipt"),
        sa.Column("status", sa.String(20), nullable=False, server_default="created"),
        sa.Column("quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("sample_size", sa.Numeric(20, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_inv_inspection_lots_status", "inv_inspection_lots", ["status"])
    op.create_index("ix_inv_inspection_lots_item", "inv_inspection_lots", ["item_id"])

    # --- Inspection Parameters ---
    op.create_table(
        "inv_inspection_parameters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("inspection_lot_id", sa.Integer(), sa.ForeignKey("inv_inspection_lots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parameter_name", sa.String(200), nullable=False),
        sa.Column("parameter_type", sa.String(20), nullable=False, server_default="quantitative"),
        sa.Column("target_value", sa.String(200), nullable=True),
        sa.Column("min_value", sa.Numeric(20, 6), nullable=True),
        sa.Column("max_value", sa.Numeric(20, 6), nullable=True),
        sa.Column("actual_value", sa.String(200), nullable=True),
        sa.Column("result", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # --- Non-Conformance Reports ---
    op.create_table(
        "inv_non_conformance_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ncr_number", sa.String(30), nullable=False, unique=True),
        sa.Column("inspection_lot_id", sa.Integer(), sa.ForeignKey("inv_inspection_lots.id"), nullable=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("inv_batches.id"), nullable=True),
        sa.Column("defect_type", sa.String(100), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default="minor"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("root_cause", sa.Text(), nullable=True),
        sa.Column("corrective_action", sa.Text(), nullable=True),
        sa.Column("preventive_action", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("reported_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_inv_ncr_status", "inv_non_conformance_reports", ["status"])
    op.create_index("ix_inv_ncr_item", "inv_non_conformance_reports", ["item_id"])

    # --- Reorder Alerts ---
    op.create_table(
        "inv_reorder_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("current_stock", sa.Numeric(20, 6), nullable=False),
        sa.Column("reorder_level", sa.Numeric(20, 6), nullable=False),
        sa.Column("suggested_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("generated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("acknowledged_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_inv_reorder_alerts_status", "inv_reorder_alerts", ["status"])
    op.create_index("ix_inv_reorder_alerts_item", "inv_reorder_alerts", ["item_id"])

    # --- Demand Forecasts ---
    op.create_table(
        "inv_demand_forecasts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("inv_warehouses.id"), nullable=True),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("forecast_method", sa.String(40), nullable=False, server_default="simple_moving_average"),
        sa.Column("forecast_quantity", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("actual_quantity", sa.Numeric(20, 6), nullable=True),
        sa.Column("forecast_accuracy_pct", sa.Numeric(8, 4), nullable=True),
        sa.Column("parameters", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("item_id", "warehouse_id", "period_year", "period_month", name="uq_inv_forecast_period"),
    )
    op.create_index("ix_inv_forecast_item", "inv_demand_forecasts", ["item_id"])

    # --- Settings ---
    op.create_table(
        "inv_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(100), nullable=False, unique=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # --- Inventory Journal Entries ---
    op.create_table(
        "inv_journal_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("inv_transaction_headers.id"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("debit_account_code", sa.String(50), nullable=False),
        sa.Column("credit_account_code", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(20, 6), nullable=False),
        sa.Column("currency_code", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inv_journal_entries_txn", "inv_journal_entries", ["transaction_id"])
    op.create_index("ix_inv_journal_entries_status", "inv_journal_entries", ["status"])


def downgrade() -> None:
    op.drop_table("inv_journal_entries")
    op.drop_table("inv_settings")
    op.drop_table("inv_demand_forecasts")
    op.drop_table("inv_reorder_alerts")
    op.drop_table("inv_non_conformance_reports")
    op.drop_table("inv_inspection_parameters")
    op.drop_table("inv_inspection_lots")
    op.drop_table("inv_count_plan_items")
    op.drop_table("inv_count_plans")
    op.drop_table("inv_pick_list_lines")
    op.drop_table("inv_pick_lists")
    op.drop_table("inv_putaway_rules")
    op.drop_table("inv_reservations")
    op.drop_table("inv_landing_costs")
    op.drop_table("inv_valuation_history")
    op.drop_table("inv_valuation_configs")
    op.drop_table("inv_transaction_lines")
    op.drop_table("inv_transaction_headers")
    op.drop_table("inv_stock_on_hand")
    op.drop_table("inv_reason_codes")
    op.drop_table("inv_serials")
    op.drop_table("inv_batches")
    op.drop_table("inv_bins")
    op.drop_table("inv_shelves")
    op.drop_table("inv_racks")
    op.drop_table("inv_aisles")
    op.drop_table("inv_zones")
    op.drop_table("inv_warehouses")
    op.drop_table("inv_uom_conversions")
    op.drop_table("inv_uom")
    op.drop_table("inv_item_categories")
