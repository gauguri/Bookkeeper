from sqlalchemy import DateTime, cast, func


def days_between(later_date, earlier_date, *, dialect_name: str):
    """Return SQL expression for difference in days between two date/datetime columns."""
    if dialect_name == "postgresql":
        return func.extract(
            "epoch",
            cast(later_date, DateTime) - cast(earlier_date, DateTime),
        ) / 86400.0

    # SQLite/test fallback
    return func.julianday(later_date) - func.julianday(earlier_date)
