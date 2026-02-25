"""add inventory planning fields

Revision ID: 0026_inventory_planning_fields
Revises: 0025_sales_management_system
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_inventory_planning_fields"
down_revision = "0025_sales_management_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("items", sa.Column("safety_stock_qty", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("items", sa.Column("target_days_supply", sa.Numeric(14, 2), nullable=False, server_default="30"))


def downgrade() -> None:
    op.drop_column("items", "target_days_supply")
    op.drop_column("items", "safety_stock_qty")
