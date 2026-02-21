"""add mwb confidence fields to sales request lines

Revision ID: 0022_sales_request_line_mwb_confidence
Revises: 0021_sales_request_line_mwb
Create Date: 2026-02-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_sales_request_line_mwb_confidence"
down_revision = "0021_sales_request_line_mwb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_request_lines", sa.Column("mwb_confidence", sa.String(10), nullable=True))
    op.add_column("sales_request_lines", sa.Column("mwb_confidence_score", sa.Numeric(5, 3), nullable=True))


def downgrade() -> None:
    op.drop_column("sales_request_lines", "mwb_confidence_score")
    op.drop_column("sales_request_lines", "mwb_confidence")
