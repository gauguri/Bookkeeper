"""add item lead time days planning field

Revision ID: 0027_inventory_item_lead_time_days
Revises: 0026_inventory_planning_fields
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0027_inventory_item_lead_time_days"
down_revision = "0026_inventory_planning_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("items", sa.Column("lead_time_days", sa.Integer(), nullable=False, server_default="14"))


def downgrade() -> None:
    op.drop_column("items", "lead_time_days")
