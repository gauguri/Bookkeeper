from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
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
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="admin")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="users")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)
    subtype = Column(String(50), nullable=True)
    normal_balance = Column(String(10), nullable=False)
    parent_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    external_id = Column(String(100), nullable=True)
    source_system = Column(String(50), nullable=True)

    company = relationship("Company", back_populates="accounts")
    parent = relationship("Account", remote_side=[id])

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_account_company_name"),
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
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    invoices = relationship("Invoice", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
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
        Enum("DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "VOID", name="invoice_status"),
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payment_applications = relationship("PaymentApplication", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(Text, nullable=True)
    quantity = Column(Numeric(14, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False)
    unit_cost = Column(Numeric(14, 2), nullable=True)
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
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=False)
    method = Column(String(50), nullable=True)
    reference = Column(String(100), nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="payments")
    applications = relationship("PaymentApplication", back_populates="payment", cascade="all, delete-orphan")


class PaymentApplication(Base):
    __tablename__ = "payment_applications"

    id = Column(Integer, primary_key=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    applied_amount = Column(Numeric(14, 2), nullable=False)

    payment = relationship("Payment", back_populates="applications")
    invoice = relationship("Invoice", back_populates="payment_applications")


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
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(
        Enum("DRAFT", "OPEN", "FULFILLED", "CANCELLED", name="sales_request_status"),
        nullable=False,
        default="DRAFT",
    )
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)

    customer = relationship("Customer")
    requested_by = relationship("User")
    lines = relationship("SalesRequestLine", back_populates="sales_request", cascade="all, delete-orphan")


class SalesRequestLine(Base):
    __tablename__ = "sales_request_lines"

    id = Column(Integer, primary_key=True)
    sales_request_id = Column(Integer, ForeignKey("sales_requests.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    qty_requested = Column(Numeric(14, 2), nullable=False)
    qty_reserved = Column(Numeric(14, 2), nullable=False, default=0)
    unit_price_quote = Column(Numeric(14, 2), nullable=True)
    status = Column(
        Enum("PENDING", "ALLOCATED", "BACKORDERED", "CANCELLED", name="sales_request_line_status"),
        nullable=False,
        default="PENDING",
    )

    sales_request = relationship("SalesRequest", back_populates="lines")
    item = relationship("Item")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True)
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier")
    lines = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")


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
