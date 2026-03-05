"""add gl_posting_audit table for idempotent GL event posting

Revision ID: 0031_gl_posting_audit_table
Revises: 0030_gl_foundation
Create Date: 2026-03-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0031_gl_posting_audit_table"
down_revision = "0030_gl_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gl_posting_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("journal_batch_id", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("event_type", "event_id", name="uq_gl_posting_event"),
    )


def downgrade() -> None:
    op.drop_table("gl_posting_audit")
