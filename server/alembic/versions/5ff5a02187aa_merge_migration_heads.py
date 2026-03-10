"""merge migration heads

Revision ID: 5ff5a02187aa
Revises: 0035_invoice_gl_posting_tracking, 0036_accounts_payable_foundation
Create Date: 2026-03-09 21:37:37.645500

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5ff5a02187aa'
down_revision = ('0035_invoice_gl_posting_tracking', '0036_accounts_payable_foundation')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
