"""add sales management system tables

Revision ID: 0025_sales_management_system
Revises: 0024_banking_module
Create Date: 2026-02-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_sales_management_system"
down_revision = "0024_banking_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("billing_address", sa.Text(), nullable=True),
        sa.Column("shipping_address", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(length=120), nullable=True),
        sa.Column("tags", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sales_accounts_name", "sales_accounts", ["name"])
    op.create_index("ix_sales_accounts_owner", "sales_accounts", ["owner_user_id"])

    op.create_table(
        "sales_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("sales_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sales_contacts_account", "sales_contacts", ["account_id"])
    op.create_index("ix_sales_contacts_email", "sales_contacts", ["email"])

    op.create_table(
        "opportunity_stage_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False, unique=True),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("probability_default", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "opportunities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("sales_accounts.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("amount_estimate", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("probability", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("expected_close_date", sa.Date(), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("forecast_category", sa.String(length=30), nullable=False, server_default="PIPELINE"),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("next_step", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_opportunities_account", "opportunities", ["account_id"])
    op.create_index("ix_opportunities_stage", "opportunities", ["stage"])
    op.create_index("ix_opportunities_expected_close_date", "opportunities", ["expected_close_date"])

    op.create_table(
        "quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("opportunity_id", sa.Integer(), sa.ForeignKey("opportunities.id"), nullable=False),
        sa.Column("quote_number", sa.String(length=30), nullable=False, unique=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tax_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("approval_status", sa.String(length=20), nullable=False, server_default="NOT_REQUIRED"),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_quotes_opportunity", "quotes", ["opportunity_id"])
    op.create_index("ix_quotes_status", "quotes", ["status"])

    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quote_id", sa.Integer(), sa.ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("qty", sa.Numeric(14, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount_pct", sa.Numeric(7, 4), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )

    op.create_table(
        "sales_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_number", sa.String(length=30), nullable=False, unique=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("sales_accounts.id"), nullable=False),
        sa.Column("opportunity_id", sa.Integer(), sa.ForeignKey("opportunities.id"), nullable=True),
        sa.Column("quote_id", sa.Integer(), sa.ForeignKey("quotes.id"), nullable=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("requested_ship_date", sa.Date(), nullable=True),
        sa.Column("fulfillment_type", sa.String(length=20), nullable=False, server_default="SHIPPING"),
        sa.Column("shipping_address", sa.Text(), nullable=True),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tax_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sales_orders_account", "sales_orders", ["account_id"])
    op.create_index("ix_sales_orders_status", "sales_orders", ["status"])

    op.create_table(
        "sales_order_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_order_id", sa.Integer(), sa.ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=True),
        sa.Column("qty", sa.Numeric(14, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("fulfillment_status", sa.String(length=20), nullable=False, server_default="PENDING"),
    )

    op.create_table(
        "sales_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sales_activities_entity", "sales_activities", ["entity_type", "entity_id"])
    op.create_index("ix_sales_activities_due_date", "sales_activities", ["due_date"])

    op.create_table(
        "price_books",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "price_book_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("price_book_id", sa.Integer(), sa.ForeignKey("price_books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("list_price", sa.Numeric(14, 2), nullable=False),
        sa.UniqueConstraint("price_book_id", "item_id", name="uq_price_book_item"),
    )

    op.create_table(
        "customer_pricing_overrides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("sales_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.UniqueConstraint("account_id", "item_id", name="uq_customer_pricing_override"),
    )

    op.create_table(
        "discount_approval_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_key", sa.String(length=50), nullable=True),
        sa.Column("max_discount_pct", sa.Numeric(7, 4), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.bulk_insert(
        sa.table(
            "opportunity_stage_configs",
            sa.column("name", sa.String()),
            sa.column("stage_order", sa.Integer()),
            sa.column("probability_default", sa.Integer()),
            sa.column("is_active", sa.Boolean()),
        ),
        [
            {"name": "Prospecting", "stage_order": 1, "probability_default": 10, "is_active": True},
            {"name": "Qualification", "stage_order": 2, "probability_default": 25, "is_active": True},
            {"name": "Proposal", "stage_order": 3, "probability_default": 50, "is_active": True},
            {"name": "Negotiation", "stage_order": 4, "probability_default": 75, "is_active": True},
            {"name": "Closed Won", "stage_order": 5, "probability_default": 100, "is_active": True},
            {"name": "Closed Lost", "stage_order": 6, "probability_default": 0, "is_active": True},
        ],
    )
    op.bulk_insert(
        sa.table(
            "discount_approval_rules",
            sa.column("role_key", sa.String()),
            sa.column("max_discount_pct", sa.Numeric(7, 4)),
        ),
        [
            {"role_key": "sales_rep", "max_discount_pct": 0.1},
            {"role_key": "sales_manager", "max_discount_pct": 0.25},
        ],
    )


def downgrade() -> None:
    op.drop_table("discount_approval_rules")
    op.drop_table("customer_pricing_overrides")
    op.drop_table("price_book_items")
    op.drop_table("price_books")
    op.drop_index("ix_sales_activities_due_date", table_name="sales_activities")
    op.drop_index("ix_sales_activities_entity", table_name="sales_activities")
    op.drop_table("sales_activities")
    op.drop_table("sales_order_lines")
    op.drop_index("ix_sales_orders_status", table_name="sales_orders")
    op.drop_index("ix_sales_orders_account", table_name="sales_orders")
    op.drop_table("sales_orders")
    op.drop_table("quote_lines")
    op.drop_index("ix_quotes_status", table_name="quotes")
    op.drop_index("ix_quotes_opportunity", table_name="quotes")
    op.drop_table("quotes")
    op.drop_index("ix_opportunities_expected_close_date", table_name="opportunities")
    op.drop_index("ix_opportunities_stage", table_name="opportunities")
    op.drop_index("ix_opportunities_account", table_name="opportunities")
    op.drop_table("opportunities")
    op.drop_table("opportunity_stage_configs")
    op.drop_index("ix_sales_contacts_email", table_name="sales_contacts")
    op.drop_index("ix_sales_contacts_account", table_name="sales_contacts")
    op.drop_table("sales_contacts")
    op.drop_index("ix_sales_accounts_owner", table_name="sales_accounts")
    op.drop_index("ix_sales_accounts_name", table_name="sales_accounts")
    op.drop_table("sales_accounts")
