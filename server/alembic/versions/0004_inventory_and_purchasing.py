"""add inventory and purchasing tables

Revision ID: 0004_inventory_and_purchasing
Revises: 0003_suppliers_and_costs
Create Date: 2024-05-12 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_inventory_and_purchasing"
down_revision = "0003_suppliers_and_costs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("items", sa.Column("on_hand_qty", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("items", sa.Column("reserved_qty", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("items", sa.Column("reorder_point", sa.Numeric(14, 2), nullable=True))
    op.alter_column("items", "on_hand_qty", server_default=None)
    op.alter_column("items", "reserved_qty", server_default=None)

    op.create_table(
        "inventory_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column(
            "txn_type",
            sa.Enum("ADJUSTMENT", "RECEIPT", "RESERVATION", "RELEASE", name="inventory_txn_type"),
            nullable=False,
        ),
        sa.Column("qty_delta", sa.Numeric(14, 2), nullable=False),
        sa.Column("reference_type", sa.String(length=50), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "sales_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "OPEN", "FULFILLED", "CANCELLED", name="sales_request_status"),
            nullable=False,
        ),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "sales_request_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sales_request_id", sa.Integer(), sa.ForeignKey("sales_requests.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("qty_requested", sa.Numeric(14, 2), nullable=False),
        sa.Column("qty_reserved", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("unit_price_quote", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "ALLOCATED",
                "BACKORDERED",
                "CANCELLED",
                name="sales_request_line_status",
            ),
            nullable=False,
        ),
    )

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "DRAFT",
                "SENT",
                "PARTIALLY_RECEIVED",
                "RECEIVED",
                "CANCELLED",
                name="purchase_order_status",
            ),
            nullable=False,
        ),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("expected_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "purchase_order_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("qty_ordered", sa.Numeric(14, 2), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("freight_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("tariff_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("landed_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("qty_received", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )
    op.alter_column("sales_request_lines", "qty_reserved", server_default=None)
    op.alter_column("purchase_order_lines", "qty_received", server_default=None)


def downgrade():
    op.drop_table("purchase_order_lines")
    op.drop_table("purchase_orders")
    op.drop_table("sales_request_lines")
    op.drop_table("sales_requests")
    op.drop_table("inventory_transactions")

    op.drop_column("items", "reorder_point")
    op.drop_column("items", "reserved_qty")
    op.drop_column("items", "on_hand_qty")

    op.execute("DROP TYPE IF EXISTS purchase_order_status")
    op.execute("DROP TYPE IF EXISTS sales_request_line_status")
    op.execute("DROP TYPE IF EXISTS sales_request_status")
    op.execute("DROP TYPE IF EXISTS inventory_txn_type")
