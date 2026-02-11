"""add purchase order extra costs and landed inventory table

Revision ID: 0008_po_costs_inv
Revises: 0007_purchase_order_workflow
Create Date: 2026-02-11 00:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_po_costs_inv"
down_revision = "0007_purchase_order_workflow"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("purchase_orders", sa.Column("freight_cost", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("purchase_orders", sa.Column("tariff_cost", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("purchase_orders", sa.Column("inventory_landed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("purchase_orders", sa.Column("landed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "inventory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("quantity_on_hand", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("landed_unit_cost", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("last_updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("item_id", name="uq_inventory_item_id"),
    )

    op.alter_column("purchase_orders", "freight_cost", server_default=None)
    op.alter_column("purchase_orders", "tariff_cost", server_default=None)
    op.alter_column("purchase_orders", "inventory_landed", server_default=None)
    op.alter_column("inventory", "quantity_on_hand", server_default=None)
    op.alter_column("inventory", "landed_unit_cost", server_default=None)


def downgrade():
    op.drop_table("inventory")
    op.drop_column("purchase_orders", "landed_at")
    op.drop_column("purchase_orders", "inventory_landed")
    op.drop_column("purchase_orders", "tariff_cost")
    op.drop_column("purchase_orders", "freight_cost")
