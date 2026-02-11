"""chart of accounts

Revision ID: 0009_chart_of_accounts
Revises: 0008_po_costs_inventory
Create Date: 2026-02-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_chart_of_accounts"
down_revision = "0008_po_costs_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("code", sa.String(length=50), nullable=True))
    op.add_column("accounts", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("accounts", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("accounts", sa.Column("created_at", sa.DateTime(), nullable=True))
    op.add_column("accounts", sa.Column("updated_at", sa.DateTime(), nullable=True))

    op.execute("UPDATE accounts SET is_active = 1 WHERE is_active IS NULL")
    op.execute("UPDATE accounts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    op.execute("UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")

    op.alter_column("accounts", "is_active", server_default=None)
    op.alter_column("accounts", "created_at", nullable=False)
    op.alter_column("accounts", "updated_at", nullable=False)

    op.create_unique_constraint("uq_account_company_code", "accounts", ["company_id", "code"])
    op.create_index("ix_accounts_type", "accounts", ["type"], unique=False)
    op.create_index("ix_accounts_is_active", "accounts", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_accounts_is_active", table_name="accounts")
    op.drop_index("ix_accounts_type", table_name="accounts")
    op.drop_constraint("uq_account_company_code", "accounts", type_="unique")
    op.drop_column("accounts", "updated_at")
    op.drop_column("accounts", "created_at")
    op.drop_column("accounts", "is_active")
    op.drop_column("accounts", "description")
    op.drop_column("accounts", "code")
