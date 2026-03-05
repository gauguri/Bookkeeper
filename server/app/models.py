from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import relationship

from .db import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    base_currency = Column(String(10), nullable=False, default="USD")
    fiscal_year_start_month = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="company")
    accounts = relationship("Account", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="admin")
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="users")
    module_access = relationship("UserModuleAccess", back_populates="user", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), nullable=False, unique=True)
    name = Column(String(200), nullable=False)

    user_access = relationship("UserModuleAccess", back_populates="module", cascade="all, delete-orphan")


class UserModuleAccess(Base):
    __tablename__ = "user_module_access"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    module_id = Column(Integer, ForeignKey("modules.id", ondelete="CASCADE"), primary_key=True)

    user = relationship("User", back_populates="module_access")
    module = relationship("Module", back_populates="user_access")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    code = Column(String(50), nullable=True)
    name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)
    subtype = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    normal_balance = Column(String(10), nullable=False)
    parent_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    external_id = Column(String(100), nullable=True)
    source_system = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="accounts")
    parent = relationship("Account", remote_side=[id])

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_account_company_name"),
        UniqueConstraint("company_id", "code", name="uq_account_company_code"),
        Index("ix_accounts_type", "type"),
        Index("ix_accounts_is_active", "is_active"),
    )


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    type = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    external_id = Column(String(100), nullable=True)
    source_system = Column(String(50), nullable=True)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    description = Column(String(255), nullable=True)
    txn_date = Column(Date, nullable=False)
    posted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    source_type = Column(String(50), nullable=False)
    source_id = Column(Integer, nullable=True)
    external_id = Column(String(100), nullable=True)
    source_system = Column(String(50), nullable=True)

    lines = relationship("JournalLine", back_populates="journal_entry", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    description = Column(String(255), nullable=True)
    debit = Column(Numeric(14, 2), nullable=False, default=0)
    credit = Column(Numeric(14, 2), nullable=False, default=0)

    journal_entry = relationship("JournalEntry", back_populates="lines")


class GLEntry(Base):
    __tablename__ = "gl_entries"

    id = Column(Integer, primary_key=True)
    journal_batch_id = Column(Integer, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    debit_amount = Column(Numeric(14, 2), nullable=False, default=0)
    credit_amount = Column(Numeric(14, 2), nullable=False, default=0)
    reference_type = Column(String(50), nullable=False)
    reference_id = Column(Integer, nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    shipment_id = Column(Integer, nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    event_id = Column(String(120), nullable=False)
    posting_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_gl_entries_journal_batch", "journal_batch_id"),
        Index("ix_gl_entries_reference", "reference_type", "reference_id"),
    )


class GLPostingAudit(Base):
    __tablename__ = "gl_posting_audit"

    id = Column(Integer, primary_key=True)
    event_type = Column(String(50), nullable=False)
    event_id = Column(String(120), nullable=False)
    journal_batch_id = Column(Integer, nullable=False)
    payload = Column(JSONB().with_variant(Text, "sqlite"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_type", "event_id", name="uq_gl_posting_event"),
    )


class CompanyCode(Base):
    __tablename__ = "company_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    base_currency = Column(String(10), nullable=False, default="USD")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class FiscalYearVariant(Base):
    __tablename__ = "fiscal_year_variants"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    periods_per_year = Column(Integer, nullable=False, default=12)
    special_periods = Column(Integer, nullable=False, default=4)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("periods_per_year > 0", name="ck_fyv_periods_positive"),
        CheckConstraint("special_periods >= 0", name="ck_fyv_special_non_negative"),
        CheckConstraint("periods_per_year + special_periods <= 16", name="ck_fyv_total_periods"),
    )


class PostingPeriod(Base):
    __tablename__ = "posting_periods"

    id = Column(Integer, primary_key=True)
    fiscal_year_variant_id = Column(Integer, ForeignKey("fiscal_year_variants.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    period_number = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_special = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("fiscal_year_variant_id", "fiscal_year", "period_number", name="uq_posting_period_unique"),
    )


class PostingPeriodStatus(Base):
    __tablename__ = "posting_period_status"

    id = Column(Integer, primary_key=True)
    company_code_id = Column(Integer, ForeignKey("company_codes.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    period_number = Column(Integer, nullable=False)
    is_open = Column(Boolean, nullable=False, default=False)
    opened_by = Column(String(255), nullable=True)
    opened_at = Column(DateTime, nullable=True)
    closed_by = Column(String(255), nullable=True)
    closed_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("company_code_id", "fiscal_year", "period_number", name="uq_period_status"),)


class GLLedger(Base):
    __tablename__ = "gl_ledgers"

    id = Column(Integer, primary_key=True)
    company_code_id = Column(Integer, ForeignKey("company_codes.id"), nullable=False)
    name = Column(String(120), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    fiscal_year_variant_id = Column(Integer, ForeignKey("fiscal_year_variants.id"), nullable=False)
    is_leading = Column(Boolean, nullable=False, default=False)
    timezone = Column(String(50), nullable=False, default="UTC")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class GLAccount(Base):
    __tablename__ = "gl_accounts"

    id = Column(Integer, primary_key=True)
    company_code_id = Column(Integer, ForeignKey("company_codes.id"), nullable=False)
    account_number = Column(String(40), nullable=False)
    name = Column(String(200), nullable=False)
    account_type = Column(Enum("ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", name="gl_account_type"), nullable=False)
    normal_balance = Column(Enum("DEBIT", "CREDIT", name="gl_normal_balance"), nullable=False)
    is_control_account = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    parent_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_code_id", "account_number", name="uq_gl_account_number"),
        Index("ix_gl_accounts_type", "account_type"),
    )


class GLJournalHeader(Base):
    __tablename__ = "gl_journal_headers"

    id = Column(Integer, primary_key=True)
    company_code_id = Column(Integer, ForeignKey("company_codes.id"), nullable=False)
    ledger_id = Column(Integer, ForeignKey("gl_ledgers.id"), nullable=False)
    document_number = Column(String(50), nullable=False)
    document_type = Column(String(20), nullable=False, default="SA")
    posting_date = Column(Date, nullable=False)
    document_date = Column(Date, nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    period_number = Column(Integer, nullable=False)
    currency = Column(String(10), nullable=False)
    reference = Column(String(120), nullable=True)
    header_text = Column(String(255), nullable=True)
    source_module = Column(String(30), nullable=False, default="MANUAL")
    status = Column(Enum("DRAFT", "POSTED", "REVERSED", "VOID", name="gl_journal_status"), nullable=False, default="DRAFT")
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_by = Column(String(255), nullable=True)
    posted_at = Column(DateTime, nullable=True)
    reversed_by = Column(String(255), nullable=True)
    reversed_at = Column(DateTime, nullable=True)
    idempotency_key = Column(String(255), nullable=True)

    lines = relationship("GLJournalLine", back_populates="header", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("ledger_id", "document_number", "fiscal_year", name="uq_gl_doc_number_year"),
        UniqueConstraint("ledger_id", "idempotency_key", name="uq_gl_idempotency"),
    )


class GLJournalLine(Base):
    __tablename__ = "gl_journal_lines"

    id = Column(Integer, primary_key=True)
    header_id = Column(Integer, ForeignKey("gl_journal_headers.id", ondelete="CASCADE"), nullable=False)
    line_number = Column(Integer, nullable=False)
    gl_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=False)
    description = Column(String(255), nullable=True)
    debit_amount = Column(Numeric(18, 2), nullable=False, default=0)
    credit_amount = Column(Numeric(18, 2), nullable=False, default=0)
    amount_in_doc_currency = Column(Numeric(18, 2), nullable=False, default=0)
    currency = Column(String(10), nullable=False)
    cost_center_id = Column(Integer, nullable=True)
    profit_center_id = Column(Integer, nullable=True)
    segment_id = Column(Integer, nullable=True)
    source_type = Column(String(50), nullable=True)
    source_id = Column(Integer, nullable=True)
    source_line_id = Column(Integer, nullable=True)

    header = relationship("GLJournalHeader", back_populates="lines")

    __table_args__ = (
        CheckConstraint(
            "((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))",
            name="ck_gl_line_debit_xor_credit",
        ),
    )


class GLBalance(Base):
    __tablename__ = "gl_balances"

    id = Column(Integer, primary_key=True)
    ledger_id = Column(Integer, ForeignKey("gl_ledgers.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    period_number = Column(Integer, nullable=False)
    gl_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=False)
    opening_balance = Column(Numeric(18, 2), nullable=False, default=0)
    period_debits = Column(Numeric(18, 2), nullable=False, default=0)
    period_credits = Column(Numeric(18, 2), nullable=False, default=0)
    closing_balance = Column(Numeric(18, 2), nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("ledger_id", "fiscal_year", "period_number", "gl_account_id", name="uq_gl_balance"),)


class GLPostingBatch(Base):
    __tablename__ = "gl_posting_batches"

    id = Column(Integer, primary_key=True)
    ledger_id = Column(Integer, ForeignKey("gl_ledgers.id"), nullable=False)
    source_module = Column(String(40), nullable=False)
    source_batch_key = Column(String(120), nullable=False)
    status = Column(Enum("READY", "POSTED", "FAILED", name="gl_posting_batch_status"), nullable=False, default="READY")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("ledger_id", "source_module", "source_batch_key", name="uq_gl_batch"),)


class GLPostingLink(Base):
    __tablename__ = "gl_posting_links"

    id = Column(Integer, primary_key=True)
    source_module = Column(String(40), nullable=False)
    source_id = Column(Integer, nullable=False)
    gl_journal_header_id = Column(Integer, ForeignKey("gl_journal_headers.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("source_module", "source_id", name="uq_gl_posting_link"),)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    before_hash = Column(String(64), nullable=True)
    after_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    event_metadata = Column(Text, nullable=True)


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    source_system = Column(String(50), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(50), nullable=False, default="running")
    summary = Column(Text, nullable=True)


class ImportMapping(Base):
    __tablename__ = "import_mappings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    source_system = Column(String(50), nullable=False)
    external_type = Column(String(50), nullable=False)
    external_id = Column(String(100), nullable=False)
    internal_type = Column(String(50), nullable=False)
    internal_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "source_system", "external_type", "external_id", name="uq_import_mapping"),
    )


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    billing_address = Column(Text, nullable=True)
    shipping_address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    tier = Column(String(20), nullable=False, default="STANDARD")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    invoices = relationship("Invoice", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")
    ar_activities = relationship("ARCollectionActivity", back_populates="customer", cascade="all, delete-orphan")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    name = Column(String(200), nullable=False)
    legal_name = Column(String(200), nullable=True)
    website = Column(String(255), nullable=True)
    tax_id = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    contact_name = Column(String(200), nullable=True)
    address = Column(Text, nullable=True)
    remit_to_address = Column(Text, nullable=True)
    ship_from_address = Column(Text, nullable=True)
    default_lead_time_days = Column(Integer, nullable=True)
    payment_terms = Column(String(100), nullable=True)
    currency = Column(String(10), nullable=False, default="USD")
    shipping_terms = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    supplier_items = relationship("SupplierItem", back_populates="supplier", cascade="all, delete-orphan")
    items = relationship("Item", secondary="supplier_items", viewonly=True)


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    sku = Column(String(100), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    unit_price = Column(Numeric(14, 2), nullable=False)
    on_hand_qty = Column(Numeric(14, 2), nullable=False, default=0)
    reserved_qty = Column(Numeric(14, 2), nullable=False, default=0)
    reorder_point = Column(Numeric(14, 2), nullable=True)
    safety_stock_qty = Column(Numeric(14, 2), nullable=False, default=0)
    lead_time_days = Column(Integer, nullable=False, default=14)
    target_days_supply = Column(Numeric(14, 2), nullable=False, default=30)
    income_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    income_account = relationship("Account")
    invoice_lines = relationship("InvoiceLine", back_populates="item")
    supplier_items = relationship("SupplierItem", back_populates="item", cascade="all, delete-orphan")
    suppliers = relationship("Supplier", secondary="supplier_items", viewonly=True)

    @property
    def available_qty(self):
        return Decimal(self.on_hand_qty or 0) - Decimal(self.reserved_qty or 0)

    @property
    def preferred_supplier_link(self):
        return next((link for link in self.supplier_items if link.is_preferred), None)

    @property
    def preferred_supplier_id(self):
        link = self.preferred_supplier_link
        return link.supplier_id if link else None

    @property
    def preferred_supplier_name(self):
        link = self.preferred_supplier_link
        if link and link.supplier:
            return link.supplier.name
        return None

    @property
    def preferred_landed_cost(self):
        link = self.preferred_supplier_link
        return link.landed_cost if link else None


class SupplierItem(Base):
    __tablename__ = "supplier_items"

    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    supplier_cost = Column(Numeric(14, 2), nullable=False, default=0)
    freight_cost = Column(Numeric(14, 2), nullable=False, default=0)
    tariff_cost = Column(Numeric(14, 2), nullable=False, default=0)
    is_preferred = Column(Boolean, nullable=False, default=False)
    supplier_sku = Column(String(100), nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    min_order_qty = Column(Numeric(14, 2), nullable=True)
    notes = Column(Text, nullable=True)
    default_unit_cost = Column(Numeric(14, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier", back_populates="supplier_items")
    item = relationship("Item", back_populates="supplier_items")

    __table_args__ = (
        UniqueConstraint("supplier_id", "item_id", name="uq_supplier_item"),
    )

    @property
    def landed_cost(self):
        return (
            Decimal(self.supplier_cost or 0)
            + Decimal(self.freight_cost or 0)
            + Decimal(self.tariff_cost or 0)
        )


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    invoice_number = Column(String(20), nullable=False, unique=True)
    status = Column(
        Enum("DRAFT", "SENT", "SHIPPED", "PARTIALLY_PAID", "PAID", "VOID", name="invoice_status"),
        nullable=False,
        default="DRAFT",
    )
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    terms = Column(Text, nullable=True)
    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    tax_total = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    amount_due = Column(Numeric(14, 2), nullable=False, default=0)
    sales_request_id = Column(Integer, ForeignKey("sales_requests.id"), nullable=True)
    shipped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="invoices")
    sales_request = relationship("SalesRequest", back_populates="invoice")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payment_applications = relationship("PaymentApplication", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(Text, nullable=True)
    quantity = Column(Numeric(14, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False)
    unit_cost = Column(Numeric(14, 2), nullable=True)
    landed_unit_cost = Column(Numeric(14, 2), nullable=False, default=0)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    discount = Column(Numeric(14, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 4), nullable=False, default=0)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)

    invoice = relationship("Invoice", back_populates="lines")
    item = relationship("Item", back_populates="invoice_lines")
    supplier = relationship("Supplier")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=False)
    method = Column(String(50), nullable=True)
    reference = Column(String(100), nullable=True)
    memo = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="payments")
    invoice = relationship("Invoice", back_populates="payments")
    applications = relationship("PaymentApplication", back_populates="payment", cascade="all, delete-orphan")


class PaymentApplication(Base):
    __tablename__ = "payment_applications"

    id = Column(Integer, primary_key=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    applied_amount = Column(Numeric(14, 2), nullable=False)

    payment = relationship("Payment", back_populates="applications")
    invoice = relationship("Invoice", back_populates="payment_applications")


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    institution = Column(String(200), nullable=False)
    account_type = Column(String(20), nullable=False)
    last4 = Column(String(4), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    opening_balance = Column(Numeric(14, 2), nullable=False, default=0)
    current_balance = Column(Numeric(14, 2), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id = Column(Integer, primary_key=True)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    posted_date = Column(Date, nullable=False)
    description = Column(String(300), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    direction = Column(String(10), nullable=False)
    category = Column(String(120), nullable=True)
    vendor = Column(String(200), nullable=True)
    reference = Column(String(120), nullable=True)
    source = Column(String(50), nullable=False, default="manual")
    status = Column(String(20), nullable=False, default="new")
    excluded_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    bank_account = relationship("BankAccount")

    __table_args__ = (
        Index("ix_bank_transactions_account_date", "bank_account_id", "posted_date"),
        Index("ix_bank_transactions_status", "status"),
    )


class MatchLink(Base):
    __tablename__ = "match_links"

    id = Column(Integer, primary_key=True)
    bank_transaction_id = Column(Integer, ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False)
    linked_entity_type = Column(String(30), nullable=False)
    linked_entity_id = Column(Integer, nullable=False)
    match_confidence = Column(Numeric(5, 2), nullable=True)
    match_type = Column(String(20), nullable=False, default="manual")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    bank_transaction = relationship("BankTransaction")


class ReconciliationSession(Base):
    __tablename__ = "reconciliation_sessions"

    id = Column(Integer, primary_key=True)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    statement_ending_balance = Column(Numeric(14, 2), nullable=False)
    status = Column(String(20), nullable=False, default="open")
    reconciled_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    bank_account = relationship("BankAccount")
    creator = relationship("User")


class ARCollectionActivity(Base):
    __tablename__ = "ar_collection_activities"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    activity_type = Column(String(20), nullable=False)
    note = Column(Text, nullable=True)
    follow_up_date = Column(Date, nullable=True)
    reminder_channel = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="ar_activities")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    txn_type = Column(
        Enum("ADJUSTMENT", "RECEIPT", "RESERVATION", "RELEASE", name="inventory_txn_type"),
        nullable=False,
    )
    qty_delta = Column(Numeric(14, 2), nullable=False)
    reference_type = Column(String(50), nullable=True)
    reference_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    item = relationship("Item")


class SalesRequest(Base):
    __tablename__ = "sales_requests"

    id = Column(Integer, primary_key=True)
    request_number = Column(String(30), nullable=False, unique=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    customer_name = Column(String(200), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), nullable=False, default="NEW")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    requested_fulfillment_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    inventory_deducted_at = Column(DateTime, nullable=True)

    customer = relationship("Customer")
    created_by = relationship("User")
    lines = relationship("SalesRequestLine", back_populates="sales_request", cascade="all, delete-orphan")
    invoice = relationship("Invoice", back_populates="sales_request", uselist=False)


class SalesRequestLine(Base):
    __tablename__ = "sales_request_lines"

    id = Column(Integer, primary_key=True)
    sales_request_id = Column(Integer, ForeignKey("sales_requests.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    item_name = Column(String(200), nullable=False)
    quantity = Column(Numeric(14, 2), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)
    mwb_unit_price = Column(Numeric(14, 2), nullable=True)
    mwb_confidence = Column(String(10), nullable=True)
    mwb_confidence_score = Column(Numeric(5, 3), nullable=True)
    mwb_explanation = Column(Text, nullable=True)
    mwb_computed_at = Column(DateTime, nullable=True)

    sales_request = relationship("SalesRequest", back_populates="lines")
    item = relationship("Item")




class SalesAccount(Base):
    __tablename__ = "sales_accounts"

    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    name = Column(String(200), nullable=False)
    website = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    billing_address = Column(Text, nullable=True)
    shipping_address = Column(Text, nullable=True)
    industry = Column(String(120), nullable=True)
    tags = Column(Text, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    customer = relationship("Customer")
    owner = relationship("User", foreign_keys=[owner_user_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    contacts = relationship("SalesContact", back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sales_accounts_name", "name"),
        Index("ix_sales_accounts_owner", "owner_user_id"),
    )


class SalesContact(Base):
    __tablename__ = "sales_contacts"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("sales_accounts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    title = Column(String(120), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    account = relationship("SalesAccount", back_populates="contacts")

    __table_args__ = (
        Index("ix_sales_contacts_account", "account_id"),
        Index("ix_sales_contacts_email", "email"),
    )


class OpportunityStageConfig(Base):
    __tablename__ = "opportunity_stage_configs"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), nullable=False, unique=True)
    stage_order = Column(Integer, nullable=False)
    probability_default = Column(Integer, nullable=False, default=10)
    is_active = Column(Boolean, nullable=False, default=True)


class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("sales_accounts.id"), nullable=False)
    name = Column(String(255), nullable=False)
    stage = Column(String(80), nullable=False)
    amount_estimate = Column(Numeric(14, 2), nullable=False, default=0)
    probability = Column(Integer, nullable=False, default=10)
    expected_close_date = Column(Date, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    forecast_category = Column(String(30), nullable=False, default="PIPELINE")
    source = Column(String(80), nullable=True)
    next_step = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    account = relationship("SalesAccount")
    owner = relationship("User", foreign_keys=[owner_user_id])

    __table_args__ = (
        Index("ix_opportunities_account", "account_id"),
        Index("ix_opportunities_stage", "stage"),
        Index("ix_opportunities_expected_close_date", "expected_close_date"),
    )


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=False)
    quote_number = Column(String(30), nullable=False, unique=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="DRAFT")
    valid_until = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    discount_total = Column(Numeric(14, 2), nullable=False, default=0)
    tax_total = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    approval_status = Column(String(20), nullable=False, default="NOT_REQUIRED")
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    opportunity = relationship("Opportunity")
    lines = relationship("QuoteLine", back_populates="quote", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_quotes_opportunity", "opportunity_id"),
        Index("ix_quotes_status", "status"),
    )


class QuoteLine(Base):
    __tablename__ = "quote_lines"

    id = Column(Integer, primary_key=True)
    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(Text, nullable=True)
    qty = Column(Numeric(14, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    discount_pct = Column(Numeric(7, 4), nullable=False, default=0)
    discount_amount = Column(Numeric(14, 2), nullable=False, default=0)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)

    quote = relationship("Quote", back_populates="lines")
    item = relationship("Item")


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id = Column(Integer, primary_key=True)
    order_number = Column(String(30), nullable=False, unique=True)
    account_id = Column(Integer, ForeignKey("sales_accounts.id"), nullable=False)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=True)
    quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    status = Column(String(20), nullable=False, default="DRAFT")
    order_date = Column(Date, nullable=False)
    requested_ship_date = Column(Date, nullable=True)
    fulfillment_type = Column(String(20), nullable=False, default="SHIPPING")
    shipping_address = Column(Text, nullable=True)
    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    tax_total = Column(Numeric(14, 2), nullable=False, default=0)
    total = Column(Numeric(14, 2), nullable=False, default=0)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    account = relationship("SalesAccount")
    opportunity = relationship("Opportunity")
    quote = relationship("Quote")
    invoice = relationship("Invoice")
    lines = relationship("SalesOrderLine", back_populates="sales_order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sales_orders_account", "account_id"),
        Index("ix_sales_orders_status", "status"),
    )


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id = Column(Integer, primary_key=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    qty = Column(Numeric(14, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    discount = Column(Numeric(14, 2), nullable=False, default=0)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)
    fulfillment_status = Column(String(20), nullable=False, default="PENDING")

    sales_order = relationship("SalesOrder", back_populates="lines")
    item = relationship("Item")


class SalesActivity(Base):
    __tablename__ = "sales_activities"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(20), nullable=False)
    entity_id = Column(Integer, nullable=False)
    type = Column(String(20), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_sales_activities_entity", "entity_type", "entity_id"),
        Index("ix_sales_activities_due_date", "due_date"),
    )


class PriceBook(Base):
    __tablename__ = "price_books"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, unique=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    items = relationship("PriceBookItem", back_populates="price_book", cascade="all, delete-orphan")


class PriceBookItem(Base):
    __tablename__ = "price_book_items"

    id = Column(Integer, primary_key=True)
    price_book_id = Column(Integer, ForeignKey("price_books.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    list_price = Column(Numeric(14, 2), nullable=False)

    price_book = relationship("PriceBook", back_populates="items")
    item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("price_book_id", "item_id", name="uq_price_book_item"),
    )


class CustomerPricingOverride(Base):
    __tablename__ = "customer_pricing_overrides"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("sales_accounts.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    price = Column(Numeric(14, 2), nullable=False)

    __table_args__ = (
        UniqueConstraint("account_id", "item_id", name="uq_customer_pricing_override"),
    )


class DiscountApprovalRule(Base):
    __tablename__ = "discount_approval_rules"

    id = Column(Integer, primary_key=True)
    role_key = Column(String(50), nullable=True)
    max_discount_pct = Column(Numeric(7, 4), nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True)
    po_number = Column(String(30), nullable=False, unique=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    status = Column(
        Enum(
            "DRAFT",
            "SENT",
            "PARTIALLY_RECEIVED",
            "RECEIVED",
            "CANCELLED",
            name="purchase_order_status",
        ),
        nullable=False,
        default="DRAFT",
    )
    order_date = Column(Date, nullable=False)
    expected_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    freight_cost = Column(Numeric(14, 2), nullable=False, default=0)
    tariff_cost = Column(Numeric(14, 2), nullable=False, default=0)
    inventory_landed = Column(Boolean, nullable=False, default=False)
    landed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    posted_journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)

    supplier = relationship("Supplier")
    lines = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")
    posted_journal_entry = relationship("JournalEntry")


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, unique=True)
    quantity_on_hand = Column(Numeric(14, 2), nullable=False, default=0)
    landed_unit_cost = Column(Numeric(14, 2), nullable=False, default=0)
    total_value = Column(Numeric(14, 2), nullable=False, default=0)
    last_updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    item = relationship("Item")


class InventoryReservation(Base):
    __tablename__ = "inventory_reservations"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    source_type = Column(String(32), nullable=True)
    source_id = Column(Integer, nullable=True)
    sales_request_id = Column(Integer, ForeignKey("sales_requests.id"), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    qty_reserved = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    released_at = Column(DateTime, nullable=True)

    item = relationship("Item")

    __table_args__ = (
        Index("ix_inventory_reservations_item_id", "item_id"),
        Index("ix_inventory_reservations_source", "source_type", "source_id"),
        Index("ix_inventory_reservations_item_id_released_at", "item_id", "released_at"),
    )


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    qty_delta = Column(Numeric(14, 2), nullable=False)
    reason = Column(String(50), nullable=False)
    ref_type = Column(String(50), nullable=False)
    ref_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    item = relationship("Item")


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    qty_ordered = Column(Numeric(14, 2), nullable=False)
    unit_cost = Column(Numeric(14, 2), nullable=False)
    freight_cost = Column(Numeric(14, 2), nullable=False, default=0)
    tariff_cost = Column(Numeric(14, 2), nullable=False, default=0)
    landed_cost = Column(Numeric(14, 2), nullable=False)
    qty_received = Column(Numeric(14, 2), nullable=False, default=0)

    purchase_order = relationship("PurchaseOrder", back_populates="lines")
    item = relationship("Item")


class PurchaseOrderSendLog(Base):
    __tablename__ = "purchase_order_send_log"

    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    payload = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    purchase_order = relationship("PurchaseOrder")
    supplier = relationship("Supplier")


# ---------------------------------------------------------------------------
# Analytics Models
# ---------------------------------------------------------------------------


class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id = Column(Integer, primary_key=True)
    kpi_key = Column(String(100), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    granularity = Column(String(20), nullable=False)
    value = Column(Numeric(18, 4), nullable=True)
    previous_value = Column(Numeric(18, 4), nullable=True)
    target_value = Column(Numeric(18, 4), nullable=True)
    metadata_json = Column(JSONB, nullable=True)
    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("kpi_key", "period_start", "granularity", name="uq_analytics_snapshot"),
        Index("ix_analytics_snapshots_kpi_key", "kpi_key"),
    )


class BudgetTarget(Base):
    __tablename__ = "budget_targets"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    target_amount = Column(Numeric(18, 4), nullable=False)
    target_type = Column(String(20), nullable=False, default="budget")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DashboardConfig(Base):
    __tablename__ = "dashboard_configs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    layout = Column(JSONB, nullable=False, default=dict)
    pinned_kpis = Column(JSONB, nullable=True, default=list)
    default_period = Column(String(30), nullable=False, default="current_month")
    theme = Column(String(20), nullable=False, default="light")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")


class KpiAlert(Base):
    __tablename__ = "kpi_alerts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kpi_key = Column(String(100), nullable=False)
    condition = Column(String(20), nullable=False)
    threshold = Column(Numeric(18, 4), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    notification_method = Column(String(20), nullable=False, default="in_app")

    user = relationship("User")


# ---------------------------------------------------------------------------
# SAP-Level Inventory Management Models
# ---------------------------------------------------------------------------


class InvItemCategory(Base):
    """Hierarchical item category tree with materialized path."""
    __tablename__ = "inv_item_categories"

    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("inv_item_categories.id"), nullable=True)
    name = Column(String(200), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    level = Column(Integer, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    inherited_properties = Column(JSONB, nullable=True)
    path = Column(String(500), nullable=False, default="/")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    parent = relationship("InvItemCategory", remote_side=[id], backref="children")

    __table_args__ = (
        Index("ix_inv_item_categories_parent", "parent_id"),
        Index("ix_inv_item_categories_path", "path"),
        Index("ix_inv_item_categories_code", "code"),
    )


class InvUom(Base):
    """Unit of Measure master."""
    __tablename__ = "inv_uom"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    category = Column(String(20), nullable=False, default="quantity")
    is_base = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_inv_uom_category", "category"),
    )


class InvUomConversion(Base):
    """UoM conversion factors, global or item-specific."""
    __tablename__ = "inv_uom_conversions"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    from_uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=False)
    to_uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=False)
    conversion_factor = Column(Numeric(20, 10), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    item = relationship("Item")
    from_uom = relationship("InvUom", foreign_keys=[from_uom_id])
    to_uom = relationship("InvUom", foreign_keys=[to_uom_id])

    __table_args__ = (
        UniqueConstraint("item_id", "from_uom_id", "to_uom_id", name="uq_inv_uom_conversion"),
    )


class InvWarehouse(Base):
    """Warehouse master."""
    __tablename__ = "inv_warehouses"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    warehouse_type = Column(String(30), nullable=False, default="standard")
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    contact_person = Column(String(200), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    contact_email = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    operating_hours = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    zones = relationship("InvZone", back_populates="warehouse", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_inv_warehouses_type", "warehouse_type"),
    )


class InvZone(Base):
    """Zone within a warehouse."""
    __tablename__ = "inv_zones"

    id = Column(Integer, primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    zone_type = Column(String(30), nullable=False, default="storage")
    temperature_min = Column(Numeric(6, 2), nullable=True)
    temperature_max = Column(Numeric(6, 2), nullable=True)
    humidity_min = Column(Numeric(5, 2), nullable=True)
    humidity_max = Column(Numeric(5, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    warehouse = relationship("InvWarehouse", back_populates="zones")
    aisles = relationship("InvAisle", back_populates="zone", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("warehouse_id", "code", name="uq_inv_zone_code"),
        Index("ix_inv_zones_warehouse", "warehouse_id"),
    )


class InvAisle(Base):
    """Aisle within a zone."""
    __tablename__ = "inv_aisles"

    id = Column(Integer, primary_key=True)
    zone_id = Column(Integer, ForeignKey("inv_zones.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    zone = relationship("InvZone", back_populates="aisles")
    racks = relationship("InvRack", back_populates="aisle", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("zone_id", "code", name="uq_inv_aisle_code"),
    )


class InvRack(Base):
    """Rack within an aisle."""
    __tablename__ = "inv_racks"

    id = Column(Integer, primary_key=True)
    aisle_id = Column(Integer, ForeignKey("inv_aisles.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    max_weight = Column(Numeric(10, 2), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    aisle = relationship("InvAisle", back_populates="racks")
    shelves = relationship("InvShelf", back_populates="rack", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("aisle_id", "code", name="uq_inv_rack_code"),
    )


class InvShelf(Base):
    """Shelf within a rack."""
    __tablename__ = "inv_shelves"

    id = Column(Integer, primary_key=True)
    rack_id = Column(Integer, ForeignKey("inv_racks.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    level_number = Column(Integer, nullable=False, default=1)
    max_weight = Column(Numeric(10, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    rack = relationship("InvRack", back_populates="shelves")
    bins = relationship("InvBin", back_populates="shelf", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("rack_id", "code", name="uq_inv_shelf_code"),
    )


class InvBin(Base):
    """Storage bin — the most granular location."""
    __tablename__ = "inv_bins"

    id = Column(Integer, primary_key=True)
    shelf_id = Column(Integer, ForeignKey("inv_shelves.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(30), nullable=False)
    name = Column(String(200), nullable=False)
    bin_type = Column(String(20), nullable=False, default="standard")
    max_weight = Column(Numeric(10, 2), nullable=True)
    max_volume = Column(Numeric(10, 2), nullable=True)
    length = Column(Numeric(10, 2), nullable=True)
    width = Column(Numeric(10, 2), nullable=True)
    height = Column(Numeric(10, 2), nullable=True)
    is_occupied = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    is_restricted = Column(Boolean, nullable=False, default=False)
    restricted_to_category_id = Column(Integer, ForeignKey("inv_item_categories.id"), nullable=True)
    restricted_to_item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    current_utilization_pct = Column(Numeric(5, 2), nullable=True, default=0)

    shelf = relationship("InvShelf", back_populates="bins")

    __table_args__ = (
        UniqueConstraint("shelf_id", "code", name="uq_inv_bin_code"),
        Index("ix_inv_bins_type", "bin_type"),
        Index("ix_inv_bins_occupied", "is_occupied"),
    )


class InvBatch(Base):
    """Batch / Lot tracking."""
    __tablename__ = "inv_batches"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    batch_number = Column(String(100), nullable=False)
    vendor_batch_number = Column(String(100), nullable=True)
    manufacturing_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    received_date = Column(Date, nullable=True)
    country_of_origin = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="unrestricted")
    custom_attributes = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("item_id", "batch_number", name="uq_inv_batch_item"),
        Index("ix_inv_batches_item", "item_id"),
        Index("ix_inv_batches_expiry", "expiry_date"),
        Index("ix_inv_batches_status", "status"),
    )


class InvSerial(Base):
    """Serial number tracking."""
    __tablename__ = "inv_serials"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    serial_number = Column(String(200), nullable=False)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    status = Column(String(20), nullable=False, default="in_stock")
    current_warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    current_bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    warranty_start_date = Column(Date, nullable=True)
    warranty_end_date = Column(Date, nullable=True)
    purchase_date = Column(Date, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    item = relationship("Item")
    batch = relationship("InvBatch")

    __table_args__ = (
        UniqueConstraint("item_id", "serial_number", name="uq_inv_serial_item"),
        Index("ix_inv_serials_item", "item_id"),
        Index("ix_inv_serials_status", "status"),
    )


class InvReasonCode(Base):
    """Reason codes for inventory transactions."""
    __tablename__ = "inv_reason_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), nullable=False, unique=True)
    description = Column(String(255), nullable=False)
    transaction_types = Column(JSONB, nullable=False, default=list)
    requires_approval = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)


class InvStockOnHand(Base):
    """Granular stock ledger: stock by item x warehouse x bin x batch x serial x stock_type."""
    __tablename__ = "inv_stock_on_hand"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=False)
    zone_id = Column(Integer, ForeignKey("inv_zones.id"), nullable=True)
    bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    serial_id = Column(Integer, ForeignKey("inv_serials.id"), nullable=True)
    stock_type = Column(String(30), nullable=False, default="unrestricted")
    quantity = Column(Numeric(20, 6), nullable=False, default=0)
    uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=True)
    last_count_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    item = relationship("Item")
    warehouse = relationship("InvWarehouse")
    batch = relationship("InvBatch")
    serial = relationship("InvSerial")

    __table_args__ = (
        UniqueConstraint("item_id", "warehouse_id", "bin_id", "batch_id", "serial_id", "stock_type", name="uq_inv_stock_on_hand"),
        CheckConstraint("quantity >= 0", name="ck_inv_stock_non_negative"),
        Index("ix_inv_stock_item", "item_id"),
        Index("ix_inv_stock_warehouse", "warehouse_id"),
        Index("ix_inv_stock_type", "stock_type"),
        Index("ix_inv_stock_item_warehouse", "item_id", "warehouse_id"),
    )


class InvTransactionHeader(Base):
    """Immutable transaction header — never update or delete posted records."""
    __tablename__ = "inv_transaction_headers"

    id = Column(Integer, primary_key=True)
    transaction_number = Column(String(30), nullable=False, unique=True)
    transaction_type = Column(String(30), nullable=False)
    reference_type = Column(String(30), nullable=True)
    reference_id = Column(Integer, nullable=True)
    reference_number = Column(String(50), nullable=True)
    source_warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    destination_warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    transaction_date = Column(Date, nullable=False)
    posting_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    reversal_of_id = Column(Integer, ForeignKey("inv_transaction_headers.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    lines = relationship("InvTransactionLine", back_populates="header", cascade="all, delete-orphan")
    source_warehouse = relationship("InvWarehouse", foreign_keys=[source_warehouse_id])
    destination_warehouse = relationship("InvWarehouse", foreign_keys=[destination_warehouse_id])
    creator = relationship("User", foreign_keys=[created_by])
    approver = relationship("User", foreign_keys=[approved_by])
    reversal_of = relationship("InvTransactionHeader", remote_side=[id])

    __table_args__ = (
        Index("ix_inv_txn_number", "transaction_number"),
        Index("ix_inv_txn_type", "transaction_type"),
        Index("ix_inv_txn_status", "status"),
        Index("ix_inv_txn_date", "transaction_date"),
        Index("ix_inv_txn_posting_date", "posting_date"),
        Index("ix_inv_txn_reference", "reference_type", "reference_id"),
    )


class InvTransactionLine(Base):
    """Immutable transaction line."""
    __tablename__ = "inv_transaction_lines"

    id = Column(Integer, primary_key=True)
    transaction_header_id = Column(Integer, ForeignKey("inv_transaction_headers.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    line_number = Column(Integer, nullable=False, default=1)
    quantity = Column(Numeric(20, 6), nullable=False)
    uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    serial_id = Column(Integer, ForeignKey("inv_serials.id"), nullable=True)
    source_bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    destination_bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    source_stock_type = Column(String(30), nullable=True)
    destination_stock_type = Column(String(30), nullable=True)
    unit_cost = Column(Numeric(20, 6), nullable=True, default=0)
    total_cost = Column(Numeric(20, 6), nullable=True, default=0)
    currency_code = Column(String(10), nullable=True, default="USD")
    reason_code_id = Column(Integer, ForeignKey("inv_reason_codes.id"), nullable=True)
    notes = Column(Text, nullable=True)

    header = relationship("InvTransactionHeader", back_populates="lines")
    item = relationship("Item")
    batch = relationship("InvBatch")
    serial = relationship("InvSerial")
    reason_code = relationship("InvReasonCode")

    __table_args__ = (
        Index("ix_inv_txn_line_header", "transaction_header_id"),
        Index("ix_inv_txn_line_item", "item_id"),
    )


class InvValuationConfig(Base):
    """Valuation method configuration per item or global."""
    __tablename__ = "inv_valuation_configs"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True, unique=True)
    valuation_method = Column(String(30), nullable=False, default="moving_average")
    standard_cost = Column(Numeric(20, 6), nullable=True)
    moving_average_cost = Column(Numeric(20, 6), nullable=True)
    currency_code = Column(String(10), nullable=False, default="USD")
    last_valuation_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    item = relationship("Item")


class InvValuationHistory(Base):
    """Period-end valuation snapshot."""
    __tablename__ = "inv_valuation_history"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    opening_qty = Column(Numeric(20, 6), nullable=False, default=0)
    opening_value = Column(Numeric(20, 6), nullable=False, default=0)
    received_qty = Column(Numeric(20, 6), nullable=False, default=0)
    received_value = Column(Numeric(20, 6), nullable=False, default=0)
    issued_qty = Column(Numeric(20, 6), nullable=False, default=0)
    issued_value = Column(Numeric(20, 6), nullable=False, default=0)
    adjustment_qty = Column(Numeric(20, 6), nullable=False, default=0)
    adjustment_value = Column(Numeric(20, 6), nullable=False, default=0)
    closing_qty = Column(Numeric(20, 6), nullable=False, default=0)
    closing_value = Column(Numeric(20, 6), nullable=False, default=0)
    valuation_method = Column(String(30), nullable=False)
    unit_cost = Column(Numeric(20, 6), nullable=False, default=0)
    currency_code = Column(String(10), nullable=False, default="USD")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("item_id", "warehouse_id", "period_year", "period_month", name="uq_inv_valuation_period"),
        Index("ix_inv_valuation_item", "item_id"),
        Index("ix_inv_valuation_period", "period_year", "period_month"),
    )


class InvLandingCost(Base):
    """Landed cost allocation on transaction lines."""
    __tablename__ = "inv_landing_costs"

    id = Column(Integer, primary_key=True)
    transaction_line_id = Column(Integer, ForeignKey("inv_transaction_lines.id"), nullable=False)
    cost_type = Column(String(30), nullable=False)
    amount = Column(Numeric(20, 6), nullable=False)
    currency_code = Column(String(10), nullable=False, default="USD")
    allocated_to_items = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    transaction_line = relationship("InvTransactionLine")


class InvReservation(Base):
    """Formal inventory reservation with expiry."""
    __tablename__ = "inv_reservations"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    serial_id = Column(Integer, ForeignKey("inv_serials.id"), nullable=True)
    reservation_type = Column(String(10), nullable=False, default="soft")
    reference_type = Column(String(30), nullable=True)
    reference_id = Column(Integer, nullable=True)
    reserved_quantity = Column(Numeric(20, 6), nullable=False)
    fulfilled_quantity = Column(Numeric(20, 6), nullable=False, default=0)
    uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=True)
    status = Column(String(30), nullable=False, default="open")
    reserved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reserved_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expiry_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    item = relationship("Item")

    __table_args__ = (
        Index("ix_inv_reservations_item", "item_id"),
        Index("ix_inv_reservations_status", "status"),
        Index("ix_inv_reservations_ref", "reference_type", "reference_id"),
    )


class InvPutawayRule(Base):
    """Putaway rules for goods receipt."""
    __tablename__ = "inv_putaway_rules"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    priority = Column(Integer, nullable=False, default=100)
    rule_type = Column(String(30), nullable=False)
    criteria = Column(JSONB, nullable=True)
    target_zone_id = Column(Integer, ForeignKey("inv_zones.id"), nullable=True)
    target_bin_type = Column(String(20), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class InvPickList(Base):
    """Pick list header."""
    __tablename__ = "inv_pick_lists"

    id = Column(Integer, primary_key=True)
    pick_list_number = Column(String(30), nullable=False, unique=True)
    pick_type = Column(String(20), nullable=False, default="discrete")
    reference_type = Column(String(30), nullable=True)
    reference_id = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="created")
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    priority = Column(String(10), nullable=False, default="normal")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    lines = relationship("InvPickListLine", back_populates="pick_list", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_inv_pick_lists_status", "status"),
    )


class InvPickListLine(Base):
    """Pick list line item."""
    __tablename__ = "inv_pick_list_lines"

    id = Column(Integer, primary_key=True)
    pick_list_id = Column(Integer, ForeignKey("inv_pick_lists.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    serial_id = Column(Integer, ForeignKey("inv_serials.id"), nullable=True)
    from_bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    quantity_requested = Column(Numeric(20, 6), nullable=False)
    quantity_picked = Column(Numeric(20, 6), nullable=False, default=0)
    uom_id = Column(Integer, ForeignKey("inv_uom.id"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    picked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    picked_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    pick_list = relationship("InvPickList", back_populates="lines")
    item = relationship("Item")


class InvCountPlan(Base):
    """Cycle count / physical inventory plan."""
    __tablename__ = "inv_count_plans"

    id = Column(Integer, primary_key=True)
    plan_number = Column(String(30), nullable=False, unique=True)
    plan_type = Column(String(20), nullable=False, default="cycle_count")
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    scheduled_date = Column(Date, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    freeze_stock = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    items = relationship("InvCountPlanItem", back_populates="count_plan", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_inv_count_plans_status", "status"),
    )


class InvCountPlanItem(Base):
    """Individual item to count in a count plan."""
    __tablename__ = "inv_count_plan_items"

    id = Column(Integer, primary_key=True)
    count_plan_id = Column(Integer, ForeignKey("inv_count_plans.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    bin_id = Column(Integer, ForeignKey("inv_bins.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    serial_id = Column(Integer, ForeignKey("inv_serials.id"), nullable=True)
    system_quantity = Column(Numeric(20, 6), nullable=False, default=0)
    counted_quantity = Column(Numeric(20, 6), nullable=True)
    variance_quantity = Column(Numeric(20, 6), nullable=True)
    variance_pct = Column(Numeric(10, 4), nullable=True)
    variance_value = Column(Numeric(20, 6), nullable=True)
    count_status = Column(String(20), nullable=False, default="pending")
    counted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    counted_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    adjustment_transaction_id = Column(Integer, ForeignKey("inv_transaction_headers.id"), nullable=True)
    notes = Column(Text, nullable=True)

    count_plan = relationship("InvCountPlan", back_populates="items")
    item = relationship("Item")

    __table_args__ = (
        Index("ix_inv_count_items_plan", "count_plan_id"),
        Index("ix_inv_count_items_status", "count_status"),
    )


class InvInspectionLot(Base):
    """Quality inspection lot."""
    __tablename__ = "inv_inspection_lots"

    id = Column(Integer, primary_key=True)
    lot_number = Column(String(30), nullable=False, unique=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    transaction_id = Column(Integer, ForeignKey("inv_transaction_headers.id"), nullable=True)
    inspection_type = Column(String(20), nullable=False, default="goods_receipt")
    status = Column(String(20), nullable=False, default="created")
    quantity = Column(Numeric(20, 6), nullable=False)
    sample_size = Column(Numeric(20, 6), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    item = relationship("Item")
    batch = relationship("InvBatch")
    parameters = relationship("InvInspectionParameter", back_populates="inspection_lot", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_inv_inspection_lots_status", "status"),
        Index("ix_inv_inspection_lots_item", "item_id"),
    )


class InvInspectionParameter(Base):
    """Inspection parameters for a lot."""
    __tablename__ = "inv_inspection_parameters"

    id = Column(Integer, primary_key=True)
    inspection_lot_id = Column(Integer, ForeignKey("inv_inspection_lots.id", ondelete="CASCADE"), nullable=False)
    parameter_name = Column(String(200), nullable=False)
    parameter_type = Column(String(20), nullable=False, default="quantitative")
    target_value = Column(String(200), nullable=True)
    min_value = Column(Numeric(20, 6), nullable=True)
    max_value = Column(Numeric(20, 6), nullable=True)
    actual_value = Column(String(200), nullable=True)
    result = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)

    inspection_lot = relationship("InvInspectionLot", back_populates="parameters")


class InvNonConformanceReport(Base):
    """NCR for quality defects."""
    __tablename__ = "inv_non_conformance_reports"

    id = Column(Integer, primary_key=True)
    ncr_number = Column(String(30), nullable=False, unique=True)
    inspection_lot_id = Column(Integer, ForeignKey("inv_inspection_lots.id"), nullable=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inv_batches.id"), nullable=True)
    defect_type = Column(String(100), nullable=True)
    severity = Column(String(20), nullable=False, default="minor")
    description = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)
    preventive_action = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="open")
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    item = relationship("Item")
    inspection_lot = relationship("InvInspectionLot")

    __table_args__ = (
        Index("ix_inv_ncr_status", "status"),
        Index("ix_inv_ncr_item", "item_id"),
    )


class InvReorderAlert(Base):
    """Automated reorder point alerts."""
    __tablename__ = "inv_reorder_alerts"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    current_stock = Column(Numeric(20, 6), nullable=False)
    reorder_level = Column(Numeric(20, 6), nullable=False)
    suggested_quantity = Column(Numeric(20, 6), nullable=False)
    status = Column(String(20), nullable=False, default="new")
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)

    item = relationship("Item")

    __table_args__ = (
        Index("ix_inv_reorder_alerts_status", "status"),
        Index("ix_inv_reorder_alerts_item", "item_id"),
    )


class InvDemandForecast(Base):
    """Demand forecast records."""
    __tablename__ = "inv_demand_forecasts"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("inv_warehouses.id"), nullable=True)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)
    forecast_method = Column(String(40), nullable=False, default="simple_moving_average")
    forecast_quantity = Column(Numeric(20, 6), nullable=False, default=0)
    actual_quantity = Column(Numeric(20, 6), nullable=True)
    forecast_accuracy_pct = Column(Numeric(8, 4), nullable=True)
    parameters = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    item = relationship("Item")

    __table_args__ = (
        UniqueConstraint("item_id", "warehouse_id", "period_year", "period_month", name="uq_inv_forecast_period"),
        Index("ix_inv_forecast_item", "item_id"),
    )


class InvSetting(Base):
    """Key-value configuration for inventory module."""
    __tablename__ = "inv_settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class InvJournalEntry(Base):
    """Inventory-specific journal entry stubs for accounting integration."""
    __tablename__ = "inv_journal_entries"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("inv_transaction_headers.id"), nullable=False)
    entry_date = Column(Date, nullable=False)
    debit_account_code = Column(String(50), nullable=False)
    credit_account_code = Column(String(50), nullable=False)
    amount = Column(Numeric(20, 6), nullable=False)
    currency_code = Column(String(10), nullable=False, default="USD")
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    posted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    transaction = relationship("InvTransactionHeader")

    __table_args__ = (
        Index("ix_inv_journal_entries_txn", "transaction_id"),
        Index("ix_inv_journal_entries_status", "status"),
    )
