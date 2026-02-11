"""extend purchase orders for create/edit/send workflow

Revision ID: 0007_purchase_order_workflow
Revises: 0006_invoice_sales_request_link
Create Date: 2026-02-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_purchase_order_workflow"
down_revision = "0006_invoice_sales_request_link"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("purchase_orders", sa.Column("po_number", sa.String(length=30), nullable=True))
    op.add_column("purchase_orders", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("purchase_orders", sa.Column("sent_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE purchase_orders
        SET po_number = 'PO-' || LPAD(CAST(id AS TEXT), 5, '0')
        WHERE po_number IS NULL
        """
    )
    op.execute(
        """
        UPDATE purchase_orders
        SET updated_at = created_at
        WHERE updated_at IS NULL
        """
    )

    op.alter_column("purchase_orders", "po_number", nullable=False)
    op.alter_column("purchase_orders", "updated_at", nullable=False)
    op.create_unique_constraint("uq_purchase_orders_po_number", "purchase_orders", ["po_number"])

    op.create_table(
        "purchase_order_send_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("purchase_order_send_log")
    op.drop_constraint("uq_purchase_orders_po_number", "purchase_orders", type_="unique")
    op.drop_column("purchase_orders", "sent_at")
    op.drop_column("purchase_orders", "updated_at")
    op.drop_column("purchase_orders", "po_number")
