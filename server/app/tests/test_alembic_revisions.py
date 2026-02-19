from pathlib import Path


def test_alembic_revision_ids_fit_version_table_limit():
    """Postgres alembic_version.version_num is varchar(32) in this project."""
    versions_dir = Path(__file__).resolve().parents[2] / "alembic" / "versions"
    too_long: list[tuple[str, str, int]] = []

    for migration_file in versions_dir.glob("*.py"):
        text = migration_file.read_text(encoding="utf-8")
        marker = 'revision = "'
        idx = text.find(marker)
        if idx == -1:
            continue
        start = idx + len(marker)
        end = text.find('"', start)
        revision = text[start:end]
        if len(revision) > 32:
            too_long.append((migration_file.name, revision, len(revision)))

    assert not too_long, (
        "Alembic revision IDs must be <= 32 chars to fit alembic_version.version_num. "
        f"Found: {too_long}"
    )
