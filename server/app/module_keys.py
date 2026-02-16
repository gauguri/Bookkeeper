from enum import Enum


class ModuleKey(str, Enum):
    DASHBOARD = "DASHBOARD"
    CUSTOMERS = "CUSTOMERS"
    ITEMS = "ITEMS"
    SALES_REQUESTS = "SALES_REQUESTS"
    INVOICES = "INVOICES"
    PAYMENTS = "PAYMENTS"
    SUPPLIERS = "SUPPLIERS"
    PURCHASE_ORDERS = "PURCHASE_ORDERS"
    INVENTORY = "INVENTORY"
    CHART_OF_ACCOUNTS = "CHART_OF_ACCOUNTS"
    EXPENSES = "EXPENSES"
    REPORTS = "REPORTS"
    IMPORT = "IMPORT"
    BANKING = "BANKING"
    CONTROL = "CONTROL"


MODULE_DEFINITIONS: list[tuple[ModuleKey, str]] = [
    (ModuleKey.DASHBOARD, "Dashboard"),
    (ModuleKey.CUSTOMERS, "Customers"),
    (ModuleKey.ITEMS, "Items"),
    (ModuleKey.SALES_REQUESTS, "Sales Requests"),
    (ModuleKey.INVOICES, "Invoices"),
    (ModuleKey.PAYMENTS, "Payments"),
    (ModuleKey.SUPPLIERS, "Suppliers"),
    (ModuleKey.PURCHASE_ORDERS, "Purchase Orders"),
    (ModuleKey.INVENTORY, "Inventory"),
    (ModuleKey.CHART_OF_ACCOUNTS, "Chart of Accounts"),
    (ModuleKey.EXPENSES, "Expenses"),
    (ModuleKey.REPORTS, "Reports"),
    (ModuleKey.IMPORT, "Import"),
    (ModuleKey.BANKING, "Banking"),
    (ModuleKey.CONTROL, "Control"),
]

MODULE_KEYS: list[str] = [module_key.value for module_key, _ in MODULE_DEFINITIONS]
MODULE_KEY_SET: set[str] = set(MODULE_KEYS)
