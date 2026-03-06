"""add indexes for operational backlog filters

Revision ID: 0033_operational_backlog_indexes
Revises: 0032_add_gl_entries_table
Create Date: 2026-03-06
"""

from alembic import op


revision = "0033_operational_backlog_indexes"
down_revision = "0032_add_gl_entries_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_sales_requests_created_status_customer", "sales_requests", ["created_at", "status", "customer_id"])
    op.create_index("ix_sales_request_lines_item", "sales_request_lines", ["item_id"])
    op.create_index("ix_invoices_status_customer_due", "invoices", ["status", "customer_id", "due_date"])
    op.create_index("ix_purchase_order_lines_item", "purchase_order_lines", ["item_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_order_lines_item", table_name="purchase_order_lines")
    op.drop_index("ix_invoices_status_customer_due", table_name="invoices")
    op.drop_index("ix_sales_request_lines_item", table_name="sales_request_lines")
    op.drop_index("ix_sales_requests_created_status_customer", table_name="sales_requests")
