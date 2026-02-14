"""add inventory deduction marker to sales requests

Revision ID: 0011_sales_request_inventory_deducted
Revises: 0010_purchase_order_posted_entry
Create Date: 2026-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_sales_request_inventory_deducted"
down_revision = "0010_purchase_order_posted_entry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_requests", sa.Column("inventory_deducted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("sales_requests", "inventory_deducted_at")
