"""customer master fields for glenrock import

Revision ID: 0039_customer_master_fields
Revises: 0038_sales_follow_up_workbench
Create Date: 2026-04-10 20:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "0039_customer_master_fields"
down_revision = "0038_sales_follow_up_workbench"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("customer_number", sa.String(length=50), nullable=True))
    op.add_column("customers", sa.Column("address_line_1", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("address_line_2", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("city", sa.String(length=120), nullable=True))
    op.add_column("customers", sa.Column("state", sa.String(length=120), nullable=True))
    op.add_column("customers", sa.Column("zip_code", sa.String(length=20), nullable=True))
    op.add_column("customers", sa.Column("fax_number", sa.String(length=50), nullable=True))
    op.add_column("customers", sa.Column("primary_contact", sa.String(length=200), nullable=True))
    op.add_column("customers", sa.Column("credit_limit", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("customers", sa.Column("shipping_method", sa.String(length=120), nullable=True))
    op.add_column("customers", sa.Column("payment_terms", sa.String(length=100), nullable=True))
    op.add_column("customers", sa.Column("upload_to_peach", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("customers", "upload_to_peach", server_default=None)


def downgrade() -> None:
    op.drop_column("customers", "upload_to_peach")
    op.drop_column("customers", "payment_terms")
    op.drop_column("customers", "shipping_method")
    op.drop_column("customers", "credit_limit")
    op.drop_column("customers", "primary_contact")
    op.drop_column("customers", "fax_number")
    op.drop_column("customers", "zip_code")
    op.drop_column("customers", "state")
    op.drop_column("customers", "city")
    op.drop_column("customers", "address_line_2")
    op.drop_column("customers", "address_line_1")
    op.drop_column("customers", "customer_number")
