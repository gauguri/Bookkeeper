from __future__ import annotations

import argparse
import json

from app.db import SessionLocal
from app.suppliers.replacement import replace_suppliers_from_xlsx


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replace a company's suppliers from Glenrock Vendors.xlsx while preserving historical references."
    )
    parser.add_argument("workbook_path", help="Absolute path to Glenrock Vendors.xlsx")
    parser.add_argument("--company-id", type=int, required=True, help="Target company id to replace suppliers for")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the replacement. If omitted, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--allow-delete-unreferenced",
        action="store_true",
        help="Delete unreferenced suppliers instead of archiving them.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = replace_suppliers_from_xlsx(
            db=db,
            workbook_path=args.workbook_path,
            company_id=args.company_id,
            allow_delete_unreferenced=args.allow_delete_unreferenced,
            dry_run=not args.apply,
        )
        if args.apply and result["summary"]["error_rows"] == 0:
            db.commit()
        else:
            db.rollback()
        print(json.dumps(result, indent=2))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
