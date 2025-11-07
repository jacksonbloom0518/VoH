from __future__ import annotations

import csv
import sqlite3
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    csv_path = repo_root / "grants-scraper" / "data" / "opportunities.csv"
    db_path = repo_root / "grants-scraper" / "data" / "opportunities.db"

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    # Read CSV rows and headers
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        if not headers:
            raise ValueError("CSV has no headers/columns")

        rows = list(reader)

    # Normalize column names to safe SQLite identifiers (keep original order)
    def norm(col: str) -> str:
        return (
            col.strip()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("/", "_")
            .lower()
        )

    columns = [norm(h) for h in headers]

    # Create DB and table (drop/recreate for simplicity)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous=NORMAL;")

        cur.execute("DROP TABLE IF EXISTS opportunities;")

        cols_sql = ", ".join(f"{c} TEXT" for c in columns)
        create_sql = (
            "CREATE TABLE opportunities ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            f"{cols_sql}"
            ");"
        )
        cur.execute(create_sql)

        placeholders = ", ".join(["?"] * len(columns))
        insert_sql = (
            f"INSERT INTO opportunities ({', '.join(columns)}) VALUES ({placeholders})"
        )

        def row_to_tuple(r: dict[str, str]):
            return tuple(r.get(h, "") for h in headers)

        cur.executemany(insert_sql, (row_to_tuple(r) for r in rows))
        conn.commit()

        print(
            f"Created {db_path} with table 'opportunities' (rows: {len(rows)}, columns: {len(columns)})"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()

