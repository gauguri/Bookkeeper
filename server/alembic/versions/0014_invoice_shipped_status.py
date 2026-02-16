"""add shipped invoice status and shipped timestamp

Revision ID: 0014_invoice_shipped_status
Revises: 0013_bootstrap_cleanup
Create Date: 2026-02-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_invoice_shipped_status"
down_revision = "0013_bootstrap_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'SHIPPED'"))

    op.add_column("invoices", sa.Column("shipped_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_column("invoices", "shipped_at")

    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TYPE invoice_status RENAME TO invoice_status_old"))
        new_type = sa.Enum("DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "VOID", name="invoice_status")
        new_type.create(bind, checkfirst=False)
        op.execute(
            sa.text(
                """
                ALTER TABLE invoices
                ALTER COLUMN status TYPE invoice_status
                USING (
                    CASE
                        WHEN status::text = 'SHIPPED' THEN 'SENT'::invoice_status
                        ELSE status::text::invoice_status
                    END
                )
                """
            )
        )
        op.execute(sa.text("DROP TYPE invoice_status_old"))
