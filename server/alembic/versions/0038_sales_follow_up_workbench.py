"""sales follow up workbench

Revision ID: 0038_sales_follow_up_workbench
Revises: 0037_expand_supplier_contact_lengths
Create Date: 2026-03-15 20:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "0038_sales_follow_up_workbench"
down_revision = "0037_expand_supplier_contact_lengths"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_activities", sa.Column("status", sa.String(length=20), nullable=True))
    op.add_column("sales_activities", sa.Column("priority", sa.String(length=20), nullable=True))
    op.add_column("sales_activities", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(None, "sales_activities", "users", ["owner_user_id"], ["id"])
    op.create_index("ix_sales_activities_owner_status", "sales_activities", ["owner_user_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_sales_activities_owner_status", table_name="sales_activities")
    op.drop_constraint(None, "sales_activities", type_="foreignkey")
    op.drop_column("sales_activities", "owner_user_id")
    op.drop_column("sales_activities", "priority")
    op.drop_column("sales_activities", "status")
