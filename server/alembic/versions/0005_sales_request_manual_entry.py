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


def _get_columns(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _get_unique_constraints(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {uc["name"] for uc in inspector.get_unique_constraints(table_name) if uc.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    sales_request_cols = _get_columns(inspector, "sales_requests")

    if "request_number" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("request_number", sa.String(length=30), nullable=True))
        sales_request_cols.add("request_number")
    if "customer_name" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("customer_name", sa.String(length=200), nullable=True))
        sales_request_cols.add("customer_name")
    if "created_by_user_id" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
        sales_request_cols.add("created_by_user_id")
    if "created_at" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
        sales_request_cols.add("created_at")
    if "updated_at" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
        sales_request_cols.add("updated_at")
    if "requested_fulfillment_date" not in sales_request_cols:
        op.add_column("sales_requests", sa.Column("requested_fulfillment_date", sa.Date(), nullable=True))
        sales_request_cols.add("requested_fulfillment_date")
    if "status_v2" not in sales_request_cols and "status" in sales_request_cols:
        op.add_column("sales_requests", sa.Column("status_v2", sa.String(length=20), nullable=False, server_default="OPEN"))
        sales_request_cols.add("status_v2")

    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE sales_request_status ADD VALUE IF NOT EXISTS 'IN_PROGRESS';")

    sales_request_cols = _get_columns(sa.inspect(bind), "sales_requests")
    if {
        "customer_id",
        "requested_by_user_id",
        "requested_at",
        "customer_name",
        "created_by_user_id",
        "created_at",
        "updated_at",
        "status_v2",
        "status",
    }.issubset(sales_request_cols):
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

    sales_request_cols = _get_columns(sa.inspect(bind), "sales_requests")
    if "requested_by_user_id" in sales_request_cols:
        op.drop_column("sales_requests", "requested_by_user_id")
    if "requested_at" in sales_request_cols:
        op.drop_column("sales_requests", "requested_at")
    if "status" in sales_request_cols and "status_v2" in sales_request_cols:
        op.drop_column("sales_requests", "status")
        sales_request_cols.remove("status")
    if "status_v2" in _get_columns(sa.inspect(bind), "sales_requests") and "status" not in _get_columns(sa.inspect(bind), "sales_requests"):
        op.alter_column("sales_requests", "status_v2", new_column_name="status")

    sales_request_line_cols = _get_columns(sa.inspect(bind), "sales_request_lines")
    if "item_name" not in sales_request_line_cols:
        op.add_column("sales_request_lines", sa.Column("item_name", sa.String(length=200), nullable=True))
        sales_request_line_cols.add("item_name")
    if "quantity" not in sales_request_line_cols:
        op.add_column("sales_request_lines", sa.Column("quantity", sa.Numeric(14, 2), nullable=False, server_default="0"))
        sales_request_line_cols.add("quantity")
    if "unit_price" not in sales_request_line_cols:
        op.add_column("sales_request_lines", sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"))
        sales_request_line_cols.add("unit_price")
    if "line_total" not in sales_request_line_cols:
        op.add_column("sales_request_lines", sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"))
        sales_request_line_cols.add("line_total")

    sales_request_line_cols = _get_columns(sa.inspect(bind), "sales_request_lines")
    if {"item_id", "item_name", "qty_requested", "quantity", "unit_price_quote", "unit_price", "line_total"}.issubset(
        sales_request_line_cols
    ):
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

    sales_request_line_cols = _get_columns(sa.inspect(bind), "sales_request_lines")
    if "item_name" in sales_request_line_cols:
        op.alter_column("sales_request_lines", "item_name", nullable=False)
    if "qty_requested" in sales_request_line_cols:
        op.drop_column("sales_request_lines", "qty_requested")
    if "qty_reserved" in sales_request_line_cols:
        op.drop_column("sales_request_lines", "qty_reserved")
    if "unit_price_quote" in sales_request_line_cols:
        op.drop_column("sales_request_lines", "unit_price_quote")
    if "status" in sales_request_line_cols:
        op.drop_column("sales_request_lines", "status")

    sales_request_cols = _get_columns(sa.inspect(bind), "sales_requests")
    if "request_number" in sales_request_cols and "created_at" in sales_request_cols:
        if bind.dialect.name == "postgresql":
            op.execute(
                """
                WITH numbered AS (
                  SELECT
                    id,
                    ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS seq,
                    COALESCE(created_at, NOW()) AS dt
                  FROM sales_requests
                )
                UPDATE sales_requests AS sr
                SET request_number = 'SR-' || to_char(numbered.dt, 'YYYY') || '-' || lpad(numbered.seq::text, 4, '0')
                FROM numbered
                WHERE sr.id = numbered.id
                  AND sr.request_number IS NULL
                """
            )
        else:
            op.execute(
                """
                WITH numbered AS (
                  SELECT
                    id,
                    ROW_NUMBER() OVER (ORDER BY created_at IS NULL, created_at, id) AS seq,
                    COALESCE(created_at, CURRENT_TIMESTAMP) AS dt
                  FROM sales_requests
                )
                UPDATE sales_requests
                SET request_number = 'SR-' || strftime('%Y', dt) || '-' || printf('%04d', seq)
                FROM numbered
                WHERE sales_requests.id = numbered.id
                  AND sales_requests.request_number IS NULL
                """
            )

    inspector = sa.inspect(bind)
    unique_constraints = _get_unique_constraints(inspector, "sales_requests")
    if "uq_sales_requests_request_number" not in unique_constraints:
        op.create_unique_constraint("uq_sales_requests_request_number", "sales_requests", ["request_number"])

    if "request_number" in _get_columns(sa.inspect(bind), "sales_requests"):
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
