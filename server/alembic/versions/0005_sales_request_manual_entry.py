"""refactor sales requests for manual entry workflow

Revision ID: 0005_sales_request_manual_entry
Revises: 0004_inventory_and_purchasing
Create Date: 2026-02-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_sales_request_manual_entry"
down_revision = "0004_inventory_and_purchasing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_requests", sa.Column("request_number", sa.String(length=30), nullable=True))
    op.add_column("sales_requests", sa.Column("customer_name", sa.String(length=200), nullable=True))
    op.add_column("sales_requests", sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("sales_requests", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column("sales_requests", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column("sales_requests", sa.Column("requested_fulfillment_date", sa.Date(), nullable=True))
    op.add_column("sales_requests", sa.Column("status_v2", sa.String(length=20), nullable=False, server_default="OPEN"))

    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE sales_request_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS';")

    op.execute(
        """
        UPDATE sales_requests
        SET
          customer_name = (SELECT name FROM customers WHERE customers.id = sales_requests.customer_id),
          created_by_user_id = requested_by_user_id,
          created_at = requested_at,
          updated_at = requested_at,
          status_v2 = CASE
            WHEN status = 'IN_PROGRESS' THEN 'IN_PROGRESS'
            WHEN status = 'OPEN' THEN 'OPEN'
            ELSE 'CLOSED'
          END
        """
    )

    op.drop_column("sales_requests", "requested_by_user_id")
    op.drop_column("sales_requests", "requested_at")
    op.drop_column("sales_requests", "status")
    op.alter_column("sales_requests", "status_v2", new_column_name="status")

    op.add_column("sales_request_lines", sa.Column("item_name", sa.String(length=200), nullable=True))
    op.add_column("sales_request_lines", sa.Column("quantity", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("sales_request_lines", sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("sales_request_lines", sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"))

    op.execute(
        """
        UPDATE sales_request_lines
        SET
          item_name = (SELECT name FROM items WHERE items.id = sales_request_lines.item_id),
          quantity = qty_requested,
          unit_price = COALESCE(unit_price_quote, 0),
          line_total = qty_requested * COALESCE(unit_price_quote, 0)
        """
    )

    op.alter_column("sales_request_lines", "item_name", nullable=False)
    op.drop_column("sales_request_lines", "qty_requested")
    op.drop_column("sales_request_lines", "qty_reserved")
    op.drop_column("sales_request_lines", "unit_price_quote")
    op.drop_column("sales_request_lines", "status")

    op.execute(
        """
        WITH numbered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS seq
          FROM sales_requests
        )
        UPDATE sales_requests
        SET request_number = 'SR-' || strftime('%Y', created_at) || '-' || printf('%04d', numbered.seq)
        FROM numbered
        WHERE sales_requests.id = numbered.id
        """
    )

    op.create_unique_constraint("uq_sales_requests_request_number", "sales_requests", ["request_number"])
    op.alter_column("sales_requests", "request_number", nullable=False)


def downgrade() -> None:
    op.drop_constraint("uq_sales_requests_request_number", "sales_requests", type_="unique")

    op.add_column("sales_request_lines", sa.Column("qty_requested", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("sales_request_lines", sa.Column("qty_reserved", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("sales_request_lines", sa.Column("unit_price_quote", sa.Numeric(14, 2), nullable=True))
    op.add_column("sales_request_lines", sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"))
    op.execute("UPDATE sales_request_lines SET qty_requested = quantity, unit_price_quote = unit_price")
    op.drop_column("sales_request_lines", "line_total")
    op.drop_column("sales_request_lines", "unit_price")
    op.drop_column("sales_request_lines", "quantity")
    op.drop_column("sales_request_lines", "item_name")

    op.add_column("sales_requests", sa.Column("requested_by_user_id", sa.Integer(), nullable=True))
    op.add_column("sales_requests", sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column("sales_requests", sa.Column("status_old", sa.String(length=20), nullable=False, server_default="OPEN"))
    op.execute(
        """
        UPDATE sales_requests
        SET
          requested_by_user_id = created_by_user_id,
          requested_at = created_at,
          status_old = CASE WHEN status = 'OPEN' THEN 'OPEN' ELSE 'FULFILLED' END
        """
    )
    op.drop_column("sales_requests", "status")
    op.alter_column("sales_requests", "status_old", new_column_name="status")
    op.drop_column("sales_requests", "requested_fulfillment_date")
    op.drop_column("sales_requests", "updated_at")
    op.drop_column("sales_requests", "created_at")
    op.drop_column("sales_requests", "created_by_user_id")
    op.drop_column("sales_requests", "customer_name")
    op.drop_column("sales_requests", "request_number")
