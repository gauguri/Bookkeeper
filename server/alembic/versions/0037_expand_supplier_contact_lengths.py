"""expand supplier contact field lengths

Revision ID: 0037_expand_supplier_contact_lengths
Revises: 5ff5a02187aa
Create Date: 2026-03-11 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0037_expand_supplier_contact_lengths"
down_revision = "5ff5a02187aa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "suppliers",
        "email",
        existing_type=sa.String(length=50),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
    op.alter_column(
        "suppliers",
        "phone",
        existing_type=sa.String(length=50),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "suppliers",
        "phone",
        existing_type=sa.String(length=255),
        type_=sa.String(length=50),
        existing_nullable=True,
    )
