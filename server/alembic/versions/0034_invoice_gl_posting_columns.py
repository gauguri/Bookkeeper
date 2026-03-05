"""add invoice gl posting columns

Revision ID: 0034_invoice_gl_posting_columns
Revises: 0033_journal_batch_engine
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa


revision = "0034_invoice_gl_posting_columns"
down_revision = "0033_journal_batch_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("posted_to_gl", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("invoices", sa.Column("posted_journal_entry_id", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("posted_at", sa.DateTime(), nullable=True))
    op.add_column("invoices", sa.Column("gl_posting_last_error", sa.Text(), nullable=True))

    op.alter_column("invoices", "posted_to_gl", server_default=None)


def downgrade() -> None:
    op.drop_column("invoices", "gl_posting_last_error")
    op.drop_column("invoices", "posted_at")
    op.drop_column("invoices", "posted_journal_entry_id")
    op.drop_column("invoices", "posted_to_gl")
