"""remove forced seeded admin for bootstrap

Revision ID: 0013_bootstrap_cleanup
Revises: 0012_control_auth_access
Create Date: 2026-02-15
"""

from alembic import op


revision = "0013_bootstrap_cleanup"
down_revision = "0012_control_auth_access"
branch_labels = None
depends_on = None


LEGACY_HASH = "$2b$12$6GKkSL8aAcyfJOLwObA6e.jI8wjYF9l8a6x6owP4VbQJu1WDVYpp6"


def upgrade() -> None:
    op.execute(
        f"""
        DELETE FROM users
        WHERE id IN (
            SELECT id
            FROM users
            WHERE email = 'admin@bookkeeper.local'
              AND role = 'admin'
              AND is_admin = TRUE
              AND password_hash = '{LEGACY_HASH}'
              AND (full_name = 'System Admin' OR full_name IS NULL)
            ORDER BY id
            LIMIT 1
        )
          AND (SELECT COUNT(*) FROM users) = 1
        """
    )


def downgrade() -> None:
    # No-op: bootstrap flow creates first admin interactively.
    pass
