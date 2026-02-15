import os

from sqlalchemy.orm import Session
from passlib.context import CryptContext

from .auth import seed_modules
from .db import SessionLocal
from .models import Company, User, Account

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _truncate_to_bcrypt_limit(password: str) -> str:
    """Truncate to bcrypt's 72-byte limit to avoid backend ValueError."""
    encoded = password.encode("utf-8")
    if len(encoded) <= 72:
        return password

    truncated = encoded[:72]
    while True:
        try:
            return truncated.decode("utf-8")
        except UnicodeDecodeError:
            truncated = truncated[:-1]


ROOT_ACCOUNTS = [
    ("Assets", "ASSET"),
    ("Liabilities", "LIABILITY"),
    ("Equity", "EQUITY"),
    ("Income", "INCOME"),
    ("Expense", "EXPENSE"),
    ("COGS", "COGS"),
    ("Other", "OTHER"),
]

CATEGORY_ACCOUNTS = {
    "Assets": ["Current Assets", "Property, Plant, and Equipment"],
    "Liabilities": ["Current Liabilities", "Long-term Liabilities"],
    "Equity": ["Stockholders’ Equity"],
    "Income": ["Operating Revenues"],
    "COGS": ["Cost of Goods Sold"],
    "Expense": ["Marketing Expenses", "Payroll Dept. Expenses"],
}

NUMBERED_ACCOUNTS = {
    "Current Assets": [
        ("10100", "Cash – Regular Checking"),
        ("10200", "Cash – Payroll Checking"),
        ("10600", "Petty Cash Fund"),
        ("12100", "Accounts Receivable"),
        ("12500", "Allowance for Doubtful Accounts"),
        ("13100", "Inventory"),
        ("14100", "Supplies"),
        ("15300", "Prepaid Insurance"),
    ],
    "Property, Plant, and Equipment": [
        ("17000", "Land"),
        ("17100", "Buildings"),
        ("17300", "Equipment"),
        ("17800", "Vehicles"),
        ("18100", "Accumulated Depreciation – Buildings"),
        ("18300", "Accumulated Depreciation – Equipment"),
        ("18800", "Accumulated Depreciation – Vehicles"),
    ],
    "Current Liabilities": [
        ("20100", "Notes Payable – Credit Line #1"),
        ("20200", "Notes Payable – Credit Line #2"),
        ("21000", "Accounts Payable"),
        ("22100", "Wages Payable"),
        ("23100", "Interest Payable"),
        ("24500", "Unearned Revenues"),
    ],
    "Long-term Liabilities": [
        ("25100", "Mortgage Loan Payable"),
        ("25600", "Bonds Payable"),
        ("25650", "Discount on Bonds Payable"),
    ],
    "Stockholders’ Equity": [
        ("27100", "Common Stock, No Par"),
        ("27500", "Retained Earnings"),
        ("29500", "Treasury Stock"),
    ],
    "Operating Revenues": [
        ("31010", "Sales – Division #1, Product Line 010"),
        ("31022", "Sales – Division #1, Product Line 022"),
        ("32015", "Sales – Division #2, Product Line 015"),
        ("33110", "Sales – Division #3, Product Line 110"),
    ],
    "Cost of Goods Sold": [
        ("41010", "COGS – Division #1, Product Line 010"),
        ("41022", "COGS – Division #1, Product Line 022"),
        ("42015", "COGS – Division #2, Product Line 015"),
        ("43110", "COGS – Division #3, Product Line 110"),
    ],
    "Marketing Expenses": [
        ("50100", "Marketing Dept. Salaries"),
        ("50150", "Marketing Dept. Payroll Taxes"),
        ("50200", "Marketing Dept. Supplies"),
        ("50600", "Marketing Dept. Telephone"),
    ],
    "Payroll Dept. Expenses": [
        ("59100", "Payroll Dept. Salaries"),
        ("59150", "Payroll Dept. Payroll Taxes"),
        ("59200", "Payroll Dept. Supplies"),
        ("59600", "Payroll Dept. Telephone"),
    ],
    "Other": [
        ("91800", "Gain on Sale of Assets"),
        ("96100", "Loss on Sale of Assets"),
    ],
}


def _normal_balance(account_type: str) -> str:
    return "debit" if account_type in {"ASSET", "EXPENSE", "COGS"} else "credit"


def _get_or_create_company(db: Session) -> Company:
    company = db.query(Company).order_by(Company.id.asc()).first()
    if company:
        return company

    company = Company(name="Demo Company", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()
    return company


def _get_or_create_user(db: Session, company_id: int) -> User:
    user = db.query(User).filter(User.email == "admin@bookkeeper.local").first()
    if user:
        if user.company_id != company_id:
            user.company_id = company_id
        user.full_name = user.full_name or "System Admin"
        if not user.is_active:
            user.is_active = True
        user.is_admin = True
        return user

    seed_password = _truncate_to_bcrypt_limit("password123")

    user = User(
        company_id=company_id,
        email="admin@bookkeeper.local",
        full_name="System Admin",
        # passlib+bcrypt enforces bcrypt's 72-byte input limit.
        password_hash=pwd_context.hash(seed_password),
        role="admin",
        is_admin=True,
    )
    db.add(user)
    db.flush()
    return user


def _resolve_parent(db: Session, company_id: int, name: str, account_type: str) -> Account:
    parent = (
        db.query(Account)
        .filter(
            Account.company_id == company_id,
            Account.name == name,
            Account.type == account_type,
            Account.code.is_(None),
        )
        .first()
    )
    if not parent:
        # Legacy data may have the same account name with a stale/missing type.
        parent = (
            db.query(Account)
            .filter(
                Account.company_id == company_id,
                Account.name == name,
            )
            .first()
        )
    if parent:
        parent.code = None
        parent.type = account_type
        parent.parent_id = None
        parent.is_active = True
        parent.normal_balance = _normal_balance(account_type)
        return parent

    parent = Account(
        company_id=company_id,
        code=None,
        name=name,
        type=account_type,
        subtype=None,
        description=None,
        is_active=True,
        normal_balance=_normal_balance(account_type),
        parent_id=None,
    )
    db.add(parent)
    db.flush()
    return parent


def _resolve_child_parent(db: Session, company_id: int, parent: Account, name: str) -> Account:
    child_parent = (
        db.query(Account)
        .filter(
            Account.company_id == company_id,
            Account.name == name,
            Account.type == parent.type,
            Account.code.is_(None),
        )
        .first()
    )
    if not child_parent:
        # Legacy rows can exist with matching name but outdated type/code values.
        child_parent = (
            db.query(Account)
            .filter(
                Account.company_id == company_id,
                Account.name == name,
            )
            .first()
        )
    if child_parent:
        child_parent.code = None
        child_parent.type = parent.type
        child_parent.parent_id = parent.id
        child_parent.is_active = True
        child_parent.normal_balance = _normal_balance(parent.type)
        return child_parent

    child_parent = Account(
        company_id=company_id,
        code=None,
        name=name,
        type=parent.type,
        subtype=None,
        description=None,
        is_active=True,
        normal_balance=_normal_balance(parent.type),
        parent_id=parent.id,
    )
    db.add(child_parent)
    db.flush()
    return child_parent


def _upsert_numbered_account(
    db: Session,
    company_id: int,
    code: str,
    name: str,
    parent: Account,
    account_type: str,
) -> Account:
    account = db.query(Account).filter(Account.company_id == company_id, Account.code == code).first()
    if not account:
        # Reconcile pre-existing chart rows that were seeded before account codes were introduced.
        account = db.query(Account).filter(Account.company_id == company_id, Account.name == name).first()
    if account:
        account.code = code
        account.name = name
        account.type = account_type
        account.parent_id = parent.id
        account.is_active = True
        account.normal_balance = _normal_balance(account_type)
        return account

    account = Account(
        company_id=company_id,
        code=code,
        name=name,
        type=account_type,
        subtype=None,
        description=None,
        is_active=True,
        normal_balance=_normal_balance(account_type),
        parent_id=parent.id,
    )
    db.add(account)
    db.flush()
    return account


def _seed_chart_of_accounts(db: Session, company_id: int):
    level1_parents = {}
    level2_parents = {}

    for root_name, root_type in ROOT_ACCOUNTS:
        level1_parents[root_name] = _resolve_parent(db, company_id, root_name, root_type)

    for root_name, categories in CATEGORY_ACCOUNTS.items():
        root_parent = level1_parents[root_name]
        for category_name in categories:
            level2_parents[category_name] = _resolve_child_parent(db, company_id, root_parent, category_name)

    for parent_name, accounts in NUMBERED_ACCOUNTS.items():
        if parent_name == "Other":
            parent = level1_parents["Other"]
            account_type = parent.type
        else:
            parent = level2_parents[parent_name]
            account_type = parent.type

        for code, name in accounts:
            _upsert_numbered_account(db, company_id, code, name, parent, account_type)


def run_seed():
    db: Session = SessionLocal()
    try:
        company = _get_or_create_company(db)

        if os.getenv("SEED_SKIP_AUTH", "1") not in {"1", "true", "TRUE", "yes", "YES"}:
            try:
                _get_or_create_user(db, company.id)
            except Exception as exc:
                print(f"Skipping auth seed user creation due to error: {exc}")

        _seed_chart_of_accounts(db, company.id)
        seed_modules(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
