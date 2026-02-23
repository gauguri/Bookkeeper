"""add banking module tables

Revision ID: 0024_banking_module
Revises: 0023_analytics_tables
Create Date: 2026-02-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_banking_module"
down_revision = "0023_analytics_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("institution", sa.String(length=200), nullable=False),
        sa.Column("account_type", sa.String(length=20), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("opening_balance", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("current_balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "bank_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("posted_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("vendor", sa.String(length=200), nullable=True),
        sa.Column("reference", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("excluded_reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_bank_transactions_account_date", "bank_transactions", ["bank_account_id", "posted_date"])
    op.create_index("ix_bank_transactions_status", "bank_transactions", ["status"])

    op.create_table(
        "match_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bank_transaction_id", sa.Integer(), sa.ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("linked_entity_type", sa.String(length=30), nullable=False),
        sa.Column("linked_entity_id", sa.Integer(), nullable=False),
        sa.Column("match_confidence", sa.Numeric(5, 2), nullable=True),
        sa.Column("match_type", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "reconciliation_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("statement_ending_balance", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("reconciled_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("reconciliation_sessions")
    op.drop_table("match_links")
    op.drop_index("ix_bank_transactions_status", table_name="bank_transactions")
    op.drop_index("ix_bank_transactions_account_date", table_name="bank_transactions")
    op.drop_table("bank_transactions")
    op.drop_table("bank_accounts")
