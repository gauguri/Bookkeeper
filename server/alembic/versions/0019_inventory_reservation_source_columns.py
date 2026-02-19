"""add source columns to inventory_reservations

Revision ID: 0019_inventory_reservation_source_columns
Revises: 0019_expand_alembic_ver
Create Date: 2026-02-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_inventory_reservation_source_columns"
down_revision = "0019_expand_alembic_ver"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_columns = {column["name"] for column in inspector.get_columns("inventory_reservations")}

    # If DB is in the prior broken state (schema changes applied, version still 0018),
    # this idempotent migration should succeed once alembic_version is widened.
    if "source_type" not in existing_columns:
        op.add_column("inventory_reservations", sa.Column("source_type", sa.String(length=32), nullable=True))
    if "source_id" not in existing_columns:
        op.add_column("inventory_reservations", sa.Column("source_id", sa.Integer(), nullable=True))

    existing_indexes = {index["name"] for index in inspector.get_indexes("inventory_reservations")}
    if "ix_inventory_reservations_item_id_released_at" not in existing_indexes:
        op.create_index(
            "ix_inventory_reservations_item_id_released_at",
            "inventory_reservations",
            ["item_id", "released_at"],
        )

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


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_indexes = {index["name"] for index in inspector.get_indexes("inventory_reservations")}
    if "ix_inventory_reservations_item_id_released_at" in existing_indexes:
        op.drop_index("ix_inventory_reservations_item_id_released_at", table_name="inventory_reservations")

    existing_columns = {column["name"] for column in inspector.get_columns("inventory_reservations")}
    if "source_id" in existing_columns:
        op.drop_column("inventory_reservations", "source_id")
    if "source_type" in existing_columns:
        op.drop_column("inventory_reservations", "source_type")
