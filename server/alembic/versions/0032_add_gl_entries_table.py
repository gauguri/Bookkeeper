"""add missing gl_entries table used by legacy posting engine

Revision ID: 0032_add_gl_entries_table
Revises: 0031_gl_posting_audit_table
Create Date: 2026-03-05 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0032_add_gl_entries_table"
down_revision = "0031_gl_posting_audit_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gl_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("journal_batch_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("debit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("reference_type", sa.String(length=50), nullable=False),
        sa.Column("reference_id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id"), nullable=True),
        sa.Column("shipment_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id"), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("posting_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_gl_entries_journal_batch", "gl_entries", ["journal_batch_id"])
    op.create_index("ix_gl_entries_reference", "gl_entries", ["reference_type", "reference_id"])


def downgrade() -> None:
    op.drop_index("ix_gl_entries_reference", table_name="gl_entries")
    op.drop_index("ix_gl_entries_journal_batch", table_name="gl_entries")
    op.drop_table("gl_entries")
