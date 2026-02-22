"""add analytics tables

Revision ID: 0023_analytics_tables
Revises: 0022_sales_request_line_mwb_confidence
Create Date: 2026-02-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0023_analytics_tables"
down_revision = "0022_sales_request_line_mwb_confidence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analytics_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kpi_key", sa.String(100), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("granularity", sa.String(20), nullable=False),
        sa.Column("value", sa.Numeric(18, 4), nullable=True),
        sa.Column("previous_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("target_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("metadata_json", JSONB(), nullable=True),
        sa.Column("computed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("kpi_key", "period_start", "granularity", name="uq_analytics_snapshot"),
    )
    op.create_index("ix_analytics_snapshots_kpi_key", "analytics_snapshots", ["kpi_key"])

    op.create_table(
        "budget_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("target_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False, server_default="budget"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "dashboard_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("layout", JSONB(), nullable=False, server_default="{}"),
        sa.Column("pinned_kpis", JSONB(), nullable=True, server_default="[]"),
        sa.Column("default_period", sa.String(30), nullable=False, server_default="current_month"),
        sa.Column("theme", sa.String(20), nullable=False, server_default="light"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "kpi_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kpi_key", sa.String(100), nullable=False),
        sa.Column("condition", sa.String(20), nullable=False),
        sa.Column("threshold", sa.Numeric(18, 4), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("notification_method", sa.String(20), nullable=False, server_default="in_app"),
    )


def downgrade() -> None:
    op.drop_table("kpi_alerts")
    op.drop_table("dashboard_configs")
    op.drop_table("budget_targets")
    op.drop_index("ix_analytics_snapshots_kpi_key", table_name="analytics_snapshots")
    op.drop_table("analytics_snapshots")
