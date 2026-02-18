"""sales request status workflow refresh

Revision ID: 0019_sales_request_status_workflow
Revises: 0018_ar_collections_activity
Create Date: 2026-02-18
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0019_sales_request_status_workflow"
down_revision = "0018_ar_collections_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE sales_requests SET status = 'NEW' WHERE status = 'OPEN'")
    op.execute("UPDATE sales_requests SET status = 'QUOTED' WHERE status = 'IN_PROGRESS'")


def downgrade() -> None:
    op.execute("UPDATE sales_requests SET status = 'OPEN' WHERE status = 'NEW'")
    op.execute("UPDATE sales_requests SET status = 'IN_PROGRESS' WHERE status = 'QUOTED'")
