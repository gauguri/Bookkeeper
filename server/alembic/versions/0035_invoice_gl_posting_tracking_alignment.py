"""align invoice gl posting tracking columns

Revision ID: 0035_invoice_gl_posting_tracking
Revises: e133219ae15e
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa


revision = "0035_invoice_gl_posting_tracking"
down_revision = "e133219ae15e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("gl_journal_entry_id", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("gl_posted_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE invoices
        SET gl_journal_entry_id = posted_journal_entry_id
        WHERE gl_journal_entry_id IS NULL
          AND posted_journal_entry_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE invoices
        SET gl_posted_at = posted_at
        WHERE gl_posted_at IS NULL
          AND posted_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("invoices", "gl_posted_at")
    op.drop_column("invoices", "gl_journal_entry_id")
