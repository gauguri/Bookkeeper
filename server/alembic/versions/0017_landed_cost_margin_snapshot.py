"""add landed cost snapshots and pricing metadata

Revision ID: 0017_landed_cost_margin_snapshot
Revises: 0016_payment_invoice_link
Create Date: 2026-02-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_landed_cost_margin_snapshot"
down_revision = "0016_payment_invoice_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("customers") as batch_op:
        batch_op.add_column(sa.Column("tier", sa.String(length=20), nullable=False, server_default="STANDARD"))

    with op.batch_alter_table("inventory") as batch_op:
        batch_op.add_column(sa.Column("total_value", sa.Numeric(14, 2), nullable=False, server_default="0"))

    with op.batch_alter_table("invoice_lines") as batch_op:
        batch_op.add_column(sa.Column("landed_unit_cost", sa.Numeric(14, 2), nullable=False, server_default="0"))

    op.execute("UPDATE inventory SET total_value = quantity_on_hand * landed_unit_cost")
    op.execute(
        "UPDATE invoice_lines SET landed_unit_cost = COALESCE(unit_cost, 0)"
    )

    with op.batch_alter_table("customers") as batch_op:
        batch_op.alter_column("tier", server_default=None)

    with op.batch_alter_table("inventory") as batch_op:
        batch_op.alter_column("total_value", server_default=None)

    with op.batch_alter_table("invoice_lines") as batch_op:
        batch_op.alter_column("landed_unit_cost", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("invoice_lines") as batch_op:
        batch_op.drop_column("landed_unit_cost")

    with op.batch_alter_table("inventory") as batch_op:
        batch_op.drop_column("total_value")

    with op.batch_alter_table("customers") as batch_op:
        batch_op.drop_column("tier")
