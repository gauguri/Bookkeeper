"""rename audit_events.metadata to event_metadata

Revision ID: 0020_rename_audit_event_metadata_column
Revises: 0019_inventory_reservation_source_columns
Create Date: 2026-02-20 00:00:00.000000
"""

from alembic import op


revision = "0020_rename_audit_event_metadata_column"
down_revision = "0019_inventory_reservation_source_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "audit_events",
        "metadata",
        new_column_name="event_metadata",
    )


def downgrade() -> None:
    op.alter_column(
        "audit_events",
        "event_metadata",
        new_column_name="metadata",
    )
