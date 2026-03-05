"""journal batch engine tables

Revision ID: 0033_journal_batch_engine
Revises: 0032_add_gl_entries_table
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0033_journal_batch_engine"
down_revision = "0032_add_gl_entries_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("reference_type", sa.String(length=50), nullable=False),
        sa.Column("reference_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="POSTED"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("event_type", "event_id", name="uq_journal_batch_event"),
    )
    op.create_index("ix_journal_batches_reference", "journal_batches", ["reference_type", "reference_id"])

    op.create_table(
        "journal_batch_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("journal_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("debit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("memo", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))",
            name="ck_journal_batch_line_debit_xor_credit",
        ),
    )


def downgrade() -> None:
    op.drop_table("journal_batch_lines")
    op.drop_index("ix_journal_batches_reference", table_name="journal_batches")
    op.drop_table("journal_batches")
