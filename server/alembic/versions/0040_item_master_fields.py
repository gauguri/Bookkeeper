"""item master fields for glenrock inventory import

Revision ID: 0040_item_master_fields
Revises: 0039_customer_master_fields
Create Date: 2026-04-10 23:10:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "0040_item_master_fields"
down_revision = "0039_customer_master_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("items", sa.Column("item_code", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("color", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("monument_type", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("lr_feet", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("lr_inches", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("fb_feet", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("fb_inches", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("tb_feet", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("tb_inches", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("shape", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("finish", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("category", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("sales_description", sa.Text(), nullable=True))
    op.add_column("items", sa.Column("purchase_description", sa.Text(), nullable=True))
    op.add_column("items", sa.Column("cost_price", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("weight_lbs", sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column("items", sa.Column("location", sa.String(length=255), nullable=True))
    op.add_column("items", sa.Column("peach_id", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("new_code", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("exclude_from_price_list", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("items", sa.Column("upload_to_peach", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("items", sa.Column("item_type", sa.String(length=100), nullable=True))
    op.add_column("items", sa.Column("inventory_check", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("items", "exclude_from_price_list", server_default=None)
    op.alter_column("items", "upload_to_peach", server_default=None)
    op.alter_column("items", "inventory_check", server_default=None)


def downgrade() -> None:
    op.drop_column("items", "inventory_check")
    op.drop_column("items", "item_type")
    op.drop_column("items", "upload_to_peach")
    op.drop_column("items", "exclude_from_price_list")
    op.drop_column("items", "new_code")
    op.drop_column("items", "peach_id")
    op.drop_column("items", "location")
    op.drop_column("items", "weight_lbs")
    op.drop_column("items", "cost_price")
    op.drop_column("items", "purchase_description")
    op.drop_column("items", "sales_description")
    op.drop_column("items", "category")
    op.drop_column("items", "finish")
    op.drop_column("items", "shape")
    op.drop_column("items", "tb_inches")
    op.drop_column("items", "tb_feet")
    op.drop_column("items", "fb_inches")
    op.drop_column("items", "fb_feet")
    op.drop_column("items", "lr_inches")
    op.drop_column("items", "lr_feet")
    op.drop_column("items", "monument_type")
    op.drop_column("items", "color")
    op.drop_column("items", "item_code")
