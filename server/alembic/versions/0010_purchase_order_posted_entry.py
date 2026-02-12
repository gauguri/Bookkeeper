"""purchase order posted journal entry link

Revision ID: 0010_purchase_order_posted_entry
Revises: 0009_chart_of_accounts
Create Date: 2026-02-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_purchase_order_posted_entry"
down_revision = "0009_chart_of_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("purchase_orders", sa.Column("posted_journal_entry_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_purchase_orders_posted_journal_entry_id",
        "purchase_orders",
        "journal_entries",
        ["posted_journal_entry_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_purchase_orders_posted_journal_entry_id", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "posted_journal_entry_id")
