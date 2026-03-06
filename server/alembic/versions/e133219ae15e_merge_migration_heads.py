"""merge migration heads

Revision ID: e133219ae15e
Revises: 0033_operational_backlog_indexes, 0034_invoice_gl_posting_columns
Create Date: 2026-03-06 16:57:09.036364

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e133219ae15e'
down_revision = ('0033_operational_backlog_indexes', '0034_invoice_gl_posting_columns')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
