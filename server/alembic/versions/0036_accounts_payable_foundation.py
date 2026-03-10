"""accounts payable foundation

Revision ID: 0036_accounts_payable_foundation
Revises: e133219ae15e
Create Date: 2026-03-09 11:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = '0036_accounts_payable_foundation'
down_revision = 'e133219ae15e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('suppliers', sa.Column('ap_default_expense_account_id', sa.Integer(), nullable=True))
    op.add_column('suppliers', sa.Column('ap_default_inventory_clearing_account_id', sa.Integer(), nullable=True))
    op.add_column('suppliers', sa.Column('ap_default_tax_account_id', sa.Integer(), nullable=True))
    op.add_column('suppliers', sa.Column('ap_default_freight_account_id', sa.Integer(), nullable=True))
    op.add_column('suppliers', sa.Column('ap_auto_approve_threshold', sa.Numeric(14, 2), nullable=True))
    op.add_column('suppliers', sa.Column('ap_amount_tolerance', sa.Numeric(14, 2), nullable=True))
    op.add_column('suppliers', sa.Column('ap_quantity_tolerance_pct', sa.Numeric(9, 4), nullable=True))
    op.add_column('suppliers', sa.Column('ap_requires_three_way_match', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('suppliers', sa.Column('ap_duplicate_check_mode', sa.String(length=30), nullable=False, server_default='WARN'))
    op.create_foreign_key(None, 'suppliers', 'accounts', ['ap_default_expense_account_id'], ['id'])
    op.create_foreign_key(None, 'suppliers', 'accounts', ['ap_default_inventory_clearing_account_id'], ['id'])
    op.create_foreign_key(None, 'suppliers', 'accounts', ['ap_default_tax_account_id'], ['id'])
    op.create_foreign_key(None, 'suppliers', 'accounts', ['ap_default_freight_account_id'], ['id'])

    op.create_table(
        'ap_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('default_ap_account_id', sa.Integer(), nullable=True),
        sa.Column('default_inventory_clearing_account_id', sa.Integer(), nullable=True),
        sa.Column('default_tax_account_id', sa.Integer(), nullable=True),
        sa.Column('default_freight_account_id', sa.Integer(), nullable=True),
        sa.Column('auto_approve_threshold', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('amount_tolerance', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('quantity_tolerance_pct', sa.Numeric(9, 4), nullable=False, server_default='0'),
        sa.Column('three_way_match_required', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('require_attachment_for_posting', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('duplicate_invoice_policy', sa.String(length=30), nullable=False, server_default='WARN'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['default_ap_account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['default_inventory_clearing_account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['default_tax_account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['default_freight_account_id'], ['accounts.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'vendor_bills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=False),
        sa.Column('purchase_order_id', sa.Integer(), nullable=True),
        sa.Column('bill_number', sa.String(length=100), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('currency_code', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('subtotal', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('tax_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('freight_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('total_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='RECEIVED'),
        sa.Column('source_type', sa.String(length=30), nullable=False, server_default='MANUAL'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('approved_by_user_id', sa.Integer(), nullable=True),
        sa.Column('posted_journal_entry_id', sa.Integer(), nullable=True),
        sa.Column('received_at', sa.DateTime(), nullable=False),
        sa.Column('extracted_at', sa.DateTime(), nullable=True),
        sa.Column('matched_at', sa.DateTime(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('posted_at', sa.DateTime(), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['approved_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['posted_journal_entry_id'], ['journal_entries.id']),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id']),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('supplier_id', 'bill_number', name='uq_vendor_bill_supplier_bill_number')
    )
    op.create_index('ix_vendor_bills_status', 'vendor_bills', ['status'])
    op.create_index('ix_vendor_bills_supplier', 'vendor_bills', ['supplier_id'])
    op.create_index('ix_vendor_bills_due_date', 'vendor_bills', ['due_date'])

    op.create_table(
        'vendor_bill_lines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('purchase_order_line_id', sa.Integer(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.Column('expense_account_id', sa.Integer(), nullable=True),
        sa.Column('line_type', sa.String(length=30), nullable=False, server_default='EXPENSE'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('quantity', sa.Numeric(14, 2), nullable=False, server_default='1'),
        sa.Column('unit_cost', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('line_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['expense_account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['item_id'], ['items.id']),
        sa.ForeignKeyConstraint(['purchase_order_line_id'], ['purchase_order_lines.id']),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vendor_bill_lines_vendor_bill', 'vendor_bill_lines', ['vendor_bill_id'])

    op.create_table(
        'vendor_bill_attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('storage_key', sa.String(length=255), nullable=True),
        sa.Column('content_type', sa.String(length=120), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'vendor_bill_match_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_line_id', sa.Integer(), nullable=True),
        sa.Column('purchase_order_id', sa.Integer(), nullable=True),
        sa.Column('purchase_order_line_id', sa.Integer(), nullable=True),
        sa.Column('match_type', sa.String(length=20), nullable=False, server_default='TWO_WAY'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='PENDING'),
        sa.Column('variance_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('variance_pct', sa.Numeric(9, 4), nullable=False, server_default='0'),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('matched_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id']),
        sa.ForeignKeyConstraint(['purchase_order_line_id'], ['purchase_order_lines.id']),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vendor_bill_line_id'], ['vendor_bill_lines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'vendor_bill_approvals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('approver_user_id', sa.Integer(), nullable=True),
        sa.Column('step_order', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='PENDING'),
        sa.Column('decision_notes', sa.Text(), nullable=True),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['approver_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vendor_bill_approvals_vendor_bill', 'vendor_bill_approvals', ['vendor_bill_id'])

    op.create_table(
        'vendor_bill_exceptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_line_id', sa.Integer(), nullable=True),
        sa.Column('exception_type', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='warning'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='OPEN'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('exception_metadata', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['resolved_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vendor_bill_line_id'], ['vendor_bill_lines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vendor_bill_exceptions_vendor_bill', 'vendor_bill_exceptions', ['vendor_bill_id'])
    op.create_index('ix_vendor_bill_exceptions_status', 'vendor_bill_exceptions', ['status'])

    op.create_table(
        'vendor_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vendor_bill_id', sa.Integer(), nullable=False),
        sa.Column('bank_account_id', sa.Integer(), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='SCHEDULED'),
        sa.Column('reference_number', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['bank_account_id'], ['bank_accounts.id']),
        sa.ForeignKeyConstraint(['vendor_bill_id'], ['vendor_bills.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_vendor_payments_vendor_bill', 'vendor_payments', ['vendor_bill_id'])
    op.create_index('ix_vendor_payments_status', 'vendor_payments', ['status'])

    op.alter_column('suppliers', 'ap_requires_three_way_match', server_default=None)
    op.alter_column('suppliers', 'ap_duplicate_check_mode', server_default=None)


def downgrade() -> None:
    op.drop_index('ix_vendor_payments_status', table_name='vendor_payments')
    op.drop_index('ix_vendor_payments_vendor_bill', table_name='vendor_payments')
    op.drop_table('vendor_payments')
    op.drop_index('ix_vendor_bill_exceptions_status', table_name='vendor_bill_exceptions')
    op.drop_index('ix_vendor_bill_exceptions_vendor_bill', table_name='vendor_bill_exceptions')
    op.drop_table('vendor_bill_exceptions')
    op.drop_index('ix_vendor_bill_approvals_vendor_bill', table_name='vendor_bill_approvals')
    op.drop_table('vendor_bill_approvals')
    op.drop_table('vendor_bill_match_results')
    op.drop_table('vendor_bill_attachments')
    op.drop_index('ix_vendor_bill_lines_vendor_bill', table_name='vendor_bill_lines')
    op.drop_table('vendor_bill_lines')
    op.drop_index('ix_vendor_bills_due_date', table_name='vendor_bills')
    op.drop_index('ix_vendor_bills_supplier', table_name='vendor_bills')
    op.drop_index('ix_vendor_bills_status', table_name='vendor_bills')
    op.drop_table('vendor_bills')
    op.drop_table('ap_settings')

    op.drop_constraint(None, 'suppliers', type_='foreignkey')
    op.drop_constraint(None, 'suppliers', type_='foreignkey')
    op.drop_constraint(None, 'suppliers', type_='foreignkey')
    op.drop_constraint(None, 'suppliers', type_='foreignkey')
    op.drop_column('suppliers', 'ap_duplicate_check_mode')
    op.drop_column('suppliers', 'ap_requires_three_way_match')
    op.drop_column('suppliers', 'ap_quantity_tolerance_pct')
    op.drop_column('suppliers', 'ap_amount_tolerance')
    op.drop_column('suppliers', 'ap_auto_approve_threshold')
    op.drop_column('suppliers', 'ap_default_freight_account_id')
    op.drop_column('suppliers', 'ap_default_tax_account_id')
    op.drop_column('suppliers', 'ap_default_inventory_clearing_account_id')
    op.drop_column('suppliers', 'ap_default_expense_account_id')
