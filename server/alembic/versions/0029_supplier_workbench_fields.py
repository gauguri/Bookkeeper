"""expand suppliers for workbench and catalog mapping

Revision ID: 0029_supplier_workbench_fields
Revises: 0028_sap_inventory_management_tables
Create Date: 2026-02-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_supplier_workbench_fields"
down_revision = "0028_sap_inventory_management_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("legal_name", sa.String(length=200), nullable=True))
    op.add_column("suppliers", sa.Column("website", sa.String(length=255), nullable=True))
    op.add_column("suppliers", sa.Column("tax_id", sa.String(length=100), nullable=True))
    op.add_column("suppliers", sa.Column("status", sa.String(length=20), nullable=False, server_default="active"))
    op.add_column("suppliers", sa.Column("contact_name", sa.String(length=200), nullable=True))
    op.add_column("suppliers", sa.Column("remit_to_address", sa.Text(), nullable=True))
    op.add_column("suppliers", sa.Column("ship_from_address", sa.Text(), nullable=True))
    op.add_column("suppliers", sa.Column("default_lead_time_days", sa.Integer(), nullable=True))
    op.add_column("suppliers", sa.Column("payment_terms", sa.String(length=100), nullable=True))
    op.add_column("suppliers", sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"))
    op.add_column("suppliers", sa.Column("shipping_terms", sa.String(length=100), nullable=True))
    op.add_column("suppliers", sa.Column("notes", sa.Text(), nullable=True))

    op.add_column("supplier_items", sa.Column("default_unit_cost", sa.Numeric(14, 2), nullable=True))
    op.add_column("supplier_items", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("supplier_items", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column("supplier_items", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_column("supplier_items", "updated_at")
    op.drop_column("supplier_items", "created_at")
    op.drop_column("supplier_items", "is_active")
    op.drop_column("supplier_items", "default_unit_cost")

    op.drop_column("suppliers", "notes")
    op.drop_column("suppliers", "shipping_terms")
    op.drop_column("suppliers", "currency")
    op.drop_column("suppliers", "payment_terms")
    op.drop_column("suppliers", "default_lead_time_days")
    op.drop_column("suppliers", "ship_from_address")
    op.drop_column("suppliers", "remit_to_address")
    op.drop_column("suppliers", "contact_name")
    op.drop_column("suppliers", "status")
    op.drop_column("suppliers", "tax_id")
    op.drop_column("suppliers", "website")
    op.drop_column("suppliers", "legal_name")
