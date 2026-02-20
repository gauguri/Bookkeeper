"""add mwb pricing snapshot fields to sales request lines

Revision ID: 0021_sales_request_line_mwb
Revises: 0020_rename_audit_event_metadata_column
Create Date: 2026-02-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_sales_request_line_mwb"
down_revision = "0020_rename_audit_event_metadata_column"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_request_lines", sa.Column("mwb_unit_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("sales_request_lines", sa.Column("mwb_explanation", sa.Text(), nullable=True))
    op.add_column("sales_request_lines", sa.Column("mwb_computed_at", sa.DateTime(), nullable=True))
    op.create_index("ix_sales_request_lines_mwb_computed_at", "sales_request_lines", ["mwb_computed_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_request_lines_mwb_computed_at", table_name="sales_request_lines")
    op.drop_column("sales_request_lines", "mwb_computed_at")
    op.drop_column("sales_request_lines", "mwb_explanation")
    op.drop_column("sales_request_lines", "mwb_unit_price")
