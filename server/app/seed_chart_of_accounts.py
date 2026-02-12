from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Account
from .seed import (
    CATEGORY_ACCOUNTS,
    NUMBERED_ACCOUNTS,
    ROOT_ACCOUNTS,
    _get_or_create_company,
    _resolve_child_parent,
    _resolve_parent,
    _upsert_numbered_account,
)


def _seed_chart_of_accounts_with_counts(db: Session, company_id: int) -> tuple[int, int]:
    inserted = 0
    updated = 0

    level1_parents: dict[str, Account] = {}
    level2_parents: dict[str, Account] = {}

    for root_name, root_type in ROOT_ACCOUNTS:
        existing = (
            db.query(Account)
            .filter(
                Account.company_id == company_id,
                Account.name == root_name,
                Account.type == root_type,
                Account.code.is_(None),
            )
            .first()
        )
        if not existing:
            existing = (
                db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.name == root_name,
                )
                .first()
            )

        level1_parents[root_name] = _resolve_parent(db, company_id, root_name, root_type)
        if existing:
            updated += 1
        else:
            inserted += 1

    for root_name, categories in CATEGORY_ACCOUNTS.items():
        root_parent = level1_parents[root_name]
        for category_name in categories:
            existing = (
                db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.name == category_name,
                    Account.type == root_parent.type,
                    Account.code.is_(None),
                )
                .first()
            )
            if not existing:
                existing = (
                    db.query(Account)
                    .filter(
                        Account.company_id == company_id,
                        Account.name == category_name,
                    )
                    .first()
                )

            level2_parents[category_name] = _resolve_child_parent(db, company_id, root_parent, category_name)
            if existing:
                updated += 1
            else:
                inserted += 1

    for parent_name, accounts in NUMBERED_ACCOUNTS.items():
        if parent_name == "Other":
            parent = level1_parents["Other"]
            account_type = parent.type
        else:
            parent = level2_parents[parent_name]
            account_type = parent.type

        for code, name in accounts:
            existing = (
                db.query(Account)
                .filter(Account.company_id == company_id, Account.code == code)
                .first()
            )
            if not existing:
                existing = (
                    db.query(Account)
                    .filter(Account.company_id == company_id, Account.name == name)
                    .first()
                )

            _upsert_numbered_account(db, company_id, code, name, parent, account_type)
            if existing:
                updated += 1
            else:
                inserted += 1

    return inserted, updated


def main() -> None:
    db: Session = SessionLocal()
    try:
        company = _get_or_create_company(db)
        inserted, updated = _seed_chart_of_accounts_with_counts(db, company.id)
        db.commit()
        print(f"Chart of Accounts seed complete: inserted={inserted}, updated={updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
