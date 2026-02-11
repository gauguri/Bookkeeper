from sqlalchemy.orm import Session
from passlib.context import CryptContext

from .db import SessionLocal
from .models import Company, User, Account

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def run_seed():
    db: Session = SessionLocal()
    try:
        company = Company(name="Demo Company", base_currency="USD", fiscal_year_start_month=1)
        db.add(company)
        db.flush()

        user = User(
            company_id=company.id,
            email="demo@bookkeeper.local",
            hashed_password=pwd_context.hash("password123"),
            role="admin",
        )
        db.add(user)

        cash = Account(
            company_id=company.id,
            code="1000",
            name="Cash",
            type="ASSET",
            subtype="Cash",
            description="Cash on hand and bank balances",
            normal_balance="debit",
        )
        ar = Account(
            company_id=company.id,
            code="1100",
            name="Accounts Receivable",
            type="ASSET",
            subtype="Accounts Receivable",
            description="Outstanding customer invoices",
            normal_balance="debit",
        )
        ap = Account(
            company_id=company.id,
            code="2000",
            name="Accounts Payable",
            type="LIABILITY",
            subtype="Accounts Payable",
            description="Amounts owed to suppliers",
            normal_balance="credit",
        )
        revenue = Account(
            company_id=company.id,
            code="4000",
            name="Sales",
            type="INCOME",
            subtype="Sales",
            description="Primary sales revenue",
            normal_balance="credit",
        )
        supplies = Account(
            company_id=company.id,
            code="6100",
            name="Supplies Expense",
            type="EXPENSE",
            subtype="Supplies",
            description="Office and operational supplies",
            normal_balance="debit",
        )
        db.add_all([cash, ar, ap, revenue, supplies])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
