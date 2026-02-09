"""initial

Revision ID: 0001
Revises: 
Create Date: 2024-02-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("base_currency", sa.String(length=10), nullable=False),
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("subtype", sa.String(length=50)),
        sa.Column("normal_balance", sa.String(length=10), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("accounts.id")),
        sa.Column("external_id", sa.String(length=100)),
        sa.Column("source_system", sa.String(length=50)),
    )
    op.create_unique_constraint("uq_account_company_name", "accounts", ["company_id", "name"])
    op.create_table(
        "contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255)),
        sa.Column("phone", sa.String(length=50)),
        sa.Column("external_id", sa.String(length=100)),
        sa.Column("source_system", sa.String(length=50)),
    )
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("description", sa.String(length=255)),
        sa.Column("txn_date", sa.Date(), nullable=False),
        sa.Column("posted_at", sa.DateTime(), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Integer()),
        sa.Column("external_id", sa.String(length=100)),
        sa.Column("source_system", sa.String(length=50)),
    )
    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("journal_entry_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("description", sa.String(length=255)),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("before_hash", sa.String(length=64)),
        sa.Column("after_hash", sa.String(length=64)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("metadata", sa.Text()),
    )
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("source_system", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("summary", sa.Text()),
    )
    op.create_table(
        "import_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("source_system", sa.String(length=50), nullable=False),
        sa.Column("external_type", sa.String(length=50), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("internal_type", sa.String(length=50), nullable=False),
        sa.Column("internal_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint(
        "uq_import_mapping", "import_mappings", ["company_id", "source_system", "external_type", "external_id"]
    )


def downgrade() -> None:
    op.drop_table("import_mappings")
    op.drop_table("import_batches")
    op.drop_table("audit_events")
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_table("contacts")
    op.drop_constraint("uq_account_company_name", "accounts", type_="unique")
    op.drop_table("accounts")
    op.drop_table("users")
    op.drop_table("companies")
