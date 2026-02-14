"""control auth access

Revision ID: 0012_control_auth_access
Revises: 0011_sales_request_inventory_deducted
Create Date: 2026-02-14
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "0012_control_auth_access"
down_revision = "0011_sales_request_inventory_deducted"
branch_labels = None
depends_on = None

MODULE_ROWS = [
    ("DASHBOARD", "Dashboard"),
    ("CUSTOMERS", "Customers"),
    ("ITEMS", "Items"),
    ("SALES_REQUESTS", "Sales Requests"),
    ("INVOICES", "Invoices"),
    ("PAYMENTS", "Payments"),
    ("SUPPLIERS", "Suppliers"),
    ("PURCHASE_ORDERS", "Purchase Orders"),
    ("INVENTORY", "Inventory"),
    ("CHART_OF_ACCOUNTS", "Chart of Accounts"),
    ("EXPENSES", "Expenses"),
    ("REPORTS", "Reports"),
    ("IMPORT", "Import"),
    ("BANKING", "Banking"),
    ("CONTROL", "Control"),
]


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("hashed_password", new_column_name="password_hash")

    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=100), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
    )
    op.create_table(
        "user_module_access",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "module_id"),
    )

    now = datetime.utcnow()
    module_table = sa.table("modules", sa.column("key", sa.String), sa.column("name", sa.String))
    op.bulk_insert(module_table, [{"key": key, "name": name} for key, name in MODULE_ROWS])

    op.execute("UPDATE users SET is_admin = TRUE WHERE role = 'admin'")
    op.execute("UPDATE users SET full_name = COALESCE(full_name, 'System Admin') WHERE email = 'admin@bookkeeper.local'")

    op.execute(
        """
        INSERT INTO users (company_id, email, full_name, password_hash, role, is_active, is_admin, created_at, updated_at)
        SELECT c.id, 'admin@bookkeeper.local', 'System Admin',
               '$2b$12$6GKkSL8aAcyfJOLwObA6e.jI8wjYF9l8a6x6owP4VbQJu1WDVYpp6',
               'admin', TRUE, TRUE, now(), now()
        FROM companies c
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = 'admin@bookkeeper.local')
        LIMIT 1
        """
    )

    op.alter_column("users", "is_admin", server_default=None)
    op.alter_column("users", "updated_at", server_default=None)


def downgrade() -> None:
    op.drop_table("user_module_access")
    op.drop_table("modules")

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("password_hash", new_column_name="hashed_password")

    op.drop_column("users", "updated_at")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "full_name")
