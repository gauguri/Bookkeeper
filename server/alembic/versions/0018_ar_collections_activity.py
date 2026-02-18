"""add ar collections activity table

Revision ID: 0018_ar_collections_activity
Revises: 0017_landed_cost_margin_snapshot
Create Date: 2026-02-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_ar_collections_activity"
down_revision = "0017_landed_cost_margin_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ar_collection_activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("activity_type", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("reminder_channel", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ar_collection_activities")
