from __future__ import annotations

import argparse
import sys
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.db import SessionLocal
from app.models import Item


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Set lead time days for all items."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=100,
        help="Lead time in days to apply to all items. Default: 100",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. If omitted, runs as a dry run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit for testing.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        query = db.query(Item).order_by(Item.id.asc())
        if args.limit > 0:
            query = query.limit(args.limit)
        items = query.all()

        print(
            f"[START] mode={'APPLY' if args.apply else 'DRY-RUN'} items={len(items)} target_days={args.days}"
        )

        updated = 0
        unchanged = 0
        for item in items:
            before = item.lead_time_days
            if before == args.days:
                unchanged += 1
                print(
                    f"[UNCHANGED] item_id={item.id} name={item.name} lead_time_days={before}"
                )
                continue

            item.lead_time_days = args.days
            updated += 1
            print(
                f"[READY] item_id={item.id} name={item.name} before={before} after={args.days}"
            )

        if args.apply:
            db.commit()
        else:
            db.rollback()

        print(
            f"[DONE] mode={'APPLY' if args.apply else 'DRY-RUN'} updated={updated} unchanged={unchanged} scanned={len(items)}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
