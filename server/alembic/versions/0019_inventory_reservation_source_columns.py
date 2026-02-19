"""add source columns to inventory_reservations

Revision ID: 0019_inventory_reservation_source_columns
Revises: 0018_ar_collections_activity
Create Date: 2026-02-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_inventory_reservation_source_columns"
down_revision = "0018_ar_collections_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_reservations", sa.Column("source_type", sa.String(length=32), nullable=True))
    op.add_column("inventory_reservations", sa.Column("source_id", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE inventory_reservations
        SET source_type = 'SALES_REQUEST',
            source_id = sales_request_id
        WHERE sales_request_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE inventory_reservations
        SET source_type = 'INVOICE',
            source_id = invoice_id
        WHERE sales_request_id IS NULL
          AND invoice_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE inventory_reservations
        SET source_type = 'UNKNOWN',
            source_id = NULL
        WHERE sales_request_id IS NULL
          AND invoice_id IS NULL
        """
    )

    op.create_index(
        "ix_inventory_reservations_item_id_released_at",
        "inventory_reservations",
        ["item_id", "released_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_reservations_item_id_released_at", table_name="inventory_reservations")
    op.drop_column("inventory_reservations", "source_id")
    op.drop_column("inventory_reservations", "source_type")
