"""add inventory reservations/movements and on-hand safety constraint

Revision ID: 0015_inventory_reservations
Revises: 0014_invoice_shipped_status
Create Date: 2026-02-16 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_inventory_reservations"
down_revision = "0014_invoice_shipped_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("sales_request_id", sa.Integer(), sa.ForeignKey("sales_requests.id"), nullable=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id"), nullable=True),
        sa.Column("qty_reserved", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("released_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id"), nullable=False),
        sa.Column("qty_delta", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.String(length=50), nullable=False),
        sa.Column("ref_type", sa.String(length=50), nullable=False),
        sa.Column("ref_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.execute(sa.text("UPDATE items SET reserved_qty = 0 WHERE reserved_qty IS NULL"))

    with op.batch_alter_table("inventory") as batch_op:
        batch_op.create_check_constraint(
            "ck_inventory_quantity_on_hand_non_negative",
            "quantity_on_hand >= 0",
        )


def downgrade() -> None:
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.drop_constraint("ck_inventory_quantity_on_hand_non_negative", type_="check")

    op.drop_table("inventory_movements")
    op.drop_table("inventory_reservations")
