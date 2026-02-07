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
            name="Cash",
            type="asset",
            subtype="cash",
            normal_balance="debit",
        )
        ar = Account(
            company_id=company.id,
            name="Accounts Receivable",
            type="asset",
            subtype="receivable",
            normal_balance="debit",
        )
        revenue = Account(
            company_id=company.id,
            name="Sales Revenue",
            type="income",
            subtype="sales",
            normal_balance="credit",
        )
        db.add_all([cash, ar, revenue])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
