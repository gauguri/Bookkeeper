"""expand alembic_version.version_num length

Revision ID: 0019_expand_alembic_ver
Revises: 0018_ar_collections_activity
Create Date: 2026-02-19 00:01:00.000000
"""

from alembic import op


revision = "0019_expand_alembic_ver"
down_revision = "0018_ar_collections_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")


def downgrade() -> None:
    # No-op: shrinking to VARCHAR(32) could truncate existing long revision ids.
    pass
