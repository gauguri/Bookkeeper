"""add sales_request_id to invoices

Revision ID: 0006_invoice_sales_request_link
Revises: 0005_sales_request_manual_entry
Create Date: 2026-02-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_invoice_sales_request_link"
down_revision = "0005_sales_request_manual_entry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {col["name"] for col in inspector.get_columns("invoices")}
    if "sales_request_id" not in cols:
        op.add_column(
            "invoices",
            sa.Column(
                "sales_request_id",
                sa.Integer(),
                sa.ForeignKey("sales_requests.id"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("invoices", "sales_request_id")
