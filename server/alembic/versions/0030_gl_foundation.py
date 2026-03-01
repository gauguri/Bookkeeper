"""general ledger foundation and record-to-report mvp

Revision ID: 0030_gl_foundation
Revises: 0029_supplier_workbench_fields
Create Date: 2026-03-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_gl_foundation"
down_revision = "0029_supplier_workbench_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=20), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("base_currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "fiscal_year_variants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("periods_per_year", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("special_periods", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("periods_per_year > 0", name="ck_fyv_periods_positive"),
        sa.CheckConstraint("special_periods >= 0", name="ck_fyv_special_non_negative"),
        sa.CheckConstraint("periods_per_year + special_periods <= 16", name="ck_fyv_total_periods"),
    )

    op.create_table(
        "posting_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fiscal_year_variant_id", sa.Integer(), sa.ForeignKey("fiscal_year_variants.id"), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("is_special", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("fiscal_year_variant_id", "fiscal_year", "period_number", name="uq_posting_period_unique"),
    )

    op.create_table(
        "posting_period_status",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_code_id", sa.Integer(), sa.ForeignKey("company_codes.id"), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("opened_by", sa.String(length=255), nullable=True),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.String(length=255), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("company_code_id", "fiscal_year", "period_number", name="uq_period_status"),
    )

    op.create_table(
        "gl_ledgers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_code_id", sa.Integer(), sa.ForeignKey("company_codes.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("fiscal_year_variant_id", sa.Integer(), sa.ForeignKey("fiscal_year_variants.id"), nullable=False),
        sa.Column("is_leading", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="UTC"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "gl_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_code_id", sa.Integer(), sa.ForeignKey("company_codes.id"), nullable=False),
        sa.Column("account_number", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("account_type", sa.Enum("ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", name="gl_account_type"), nullable=False),
        sa.Column("normal_balance", sa.Enum("DEBIT", "CREDIT", name="gl_normal_balance"), nullable=False),
        sa.Column("is_control_account", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("parent_account_id", sa.Integer(), sa.ForeignKey("gl_accounts.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_code_id", "account_number", name="uq_gl_account_number"),
    )
    op.create_index("ix_gl_accounts_type", "gl_accounts", ["account_type"])

    op.create_table(
        "gl_journal_headers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_code_id", sa.Integer(), sa.ForeignKey("company_codes.id"), nullable=False),
        sa.Column("ledger_id", sa.Integer(), sa.ForeignKey("gl_ledgers.id"), nullable=False),
        sa.Column("document_number", sa.String(length=50), nullable=False),
        sa.Column("document_type", sa.String(length=20), nullable=False, server_default="SA"),
        sa.Column("posting_date", sa.Date(), nullable=False),
        sa.Column("document_date", sa.Date(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("reference", sa.String(length=120), nullable=True),
        sa.Column("header_text", sa.String(length=255), nullable=True),
        sa.Column("source_module", sa.String(length=30), nullable=False, server_default="MANUAL"),
        sa.Column("status", sa.Enum("DRAFT", "POSTED", "REVERSED", "VOID", name="gl_journal_status"), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("posted_by", sa.String(length=255), nullable=True),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("reversed_by", sa.String(length=255), nullable=True),
        sa.Column("reversed_at", sa.DateTime(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.UniqueConstraint("ledger_id", "document_number", "fiscal_year", name="uq_gl_doc_number_year"),
        sa.UniqueConstraint("ledger_id", "idempotency_key", name="uq_gl_idempotency"),
    )

    op.create_table(
        "gl_journal_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("header_id", sa.Integer(), sa.ForeignKey("gl_journal_headers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("gl_account_id", sa.Integer(), sa.ForeignKey("gl_accounts.id"), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("debit_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("credit_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("amount_in_doc_currency", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("profit_center_id", sa.Integer(), nullable=True),
        sa.Column("segment_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=50), nullable=True),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("source_line_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))",
            name="ck_gl_line_debit_xor_credit",
        ),
    )

    op.create_table(
        "gl_balances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ledger_id", sa.Integer(), sa.ForeignKey("gl_ledgers.id"), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("period_number", sa.Integer(), nullable=False),
        sa.Column("gl_account_id", sa.Integer(), sa.ForeignKey("gl_accounts.id"), nullable=False),
        sa.Column("opening_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("period_debits", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("period_credits", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("closing_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ledger_id", "fiscal_year", "period_number", "gl_account_id", name="uq_gl_balance"),
    )

    op.create_table(
        "gl_posting_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ledger_id", sa.Integer(), sa.ForeignKey("gl_ledgers.id"), nullable=False),
        sa.Column("source_module", sa.String(length=40), nullable=False),
        sa.Column("source_batch_key", sa.String(length=120), nullable=False),
        sa.Column("status", sa.Enum("READY", "POSTED", "FAILED", name="gl_posting_batch_status"), nullable=False, server_default="READY"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("ledger_id", "source_module", "source_batch_key", name="uq_gl_batch"),
    )

    op.create_table(
        "gl_posting_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_module", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("gl_journal_header_id", sa.Integer(), sa.ForeignKey("gl_journal_headers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("source_module", "source_id", name="uq_gl_posting_link"),
    )


def downgrade() -> None:
    op.drop_table("gl_posting_links")
    op.drop_table("gl_posting_batches")
    op.drop_table("gl_balances")
    op.drop_table("gl_journal_lines")
    op.drop_table("gl_journal_headers")
    op.drop_index("ix_gl_accounts_type", table_name="gl_accounts")
    op.drop_table("gl_accounts")
    op.drop_table("gl_ledgers")
    op.drop_table("posting_period_status")
    op.drop_table("posting_periods")
    op.drop_table("fiscal_year_variants")
    op.drop_table("company_codes")

    sa.Enum(name="gl_posting_batch_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="gl_journal_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="gl_normal_balance").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="gl_account_type").drop(op.get_bind(), checkfirst=True)
