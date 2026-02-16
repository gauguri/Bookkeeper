"""add direct invoice link and notes to payments

Revision ID: 0016_payment_invoice_link
Revises: 0015_inventory_reservations
Create Date: 2026-02-16 00:00:02.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_payment_invoice_link"
down_revision = "0015_inventory_reservations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.add_column(sa.Column("invoice_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_payments_invoice_id", "invoices", ["invoice_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("fk_payments_invoice_id", type_="foreignkey")
        batch_op.drop_column("notes")
        batch_op.drop_column("invoice_id")
