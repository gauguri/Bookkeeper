"""add suppliers and item costs

Revision ID: 0003_suppliers_and_costs
Revises: 0002_sales_management
Create Date: 2024-08-22 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_suppliers_and_costs"
down_revision = "0002_sales_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "supplier_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_cost", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("freight_cost", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tariff_cost", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("is_preferred", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("supplier_sku", sa.String(length=100), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("min_order_qty", sa.Numeric(14, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("supplier_id", "item_id", name="uq_supplier_item"),
    )

    op.add_column("invoice_lines", sa.Column("unit_cost", sa.Numeric(14, 2), nullable=True))
    op.add_column("invoice_lines", sa.Column("supplier_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_invoice_lines_supplier_id",
        "invoice_lines",
        "suppliers",
        ["supplier_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_invoice_lines_supplier_id", "invoice_lines", type_="foreignkey")
    op.drop_column("invoice_lines", "supplier_id")
    op.drop_column("invoice_lines", "unit_cost")
    op.drop_table("supplier_items")
    op.drop_table("suppliers")
