"""add supplier vendor number

Revision ID: 0041_supplier_vendor_number
Revises: 0040_item_master_fields
Create Date: 2026-04-11 14:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "0041_supplier_vendor_number"
down_revision = "0040_item_master_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("vendor_number", sa.String(length=100), nullable=True))
    op.create_index("ix_suppliers_vendor_number", "suppliers", ["vendor_number"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_suppliers_vendor_number", table_name="suppliers")
    op.drop_column("suppliers", "vendor_number")
