from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
from pathlib import Path


def deterministic_id(prefix: str, parts: list[str]) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update((p or "").encode("utf-8"))
        m.update(b"|")
    return f"{prefix}-{m.hexdigest()[:16]}"


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    csv_path = repo_root / "grants-scraper" / "data" / "opportunities.csv"
    db_path = repo_root / "grants-web-app" / "data" / "grants.db"

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    if not db_path.exists():
        raise FileNotFoundError(
            f"App database not found: {db_path}. Run the sync once to initialize it."
        )

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        # Ensure table exists with expected schema (no destructive changes)
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS opportunities (
              id TEXT PRIMARY KEY,
              source TEXT NOT NULL,
              source_record_url TEXT,
              title TEXT NOT NULL,
              summary TEXT,
              agency TEXT,
              posted_date TEXT,
              response_deadline TEXT,
              naics TEXT,
              psc TEXT,
              set_aside TEXT,
              pop_city TEXT,
              pop_state TEXT,
              pop_zip TEXT,
              pop_country TEXT,
              poc_name TEXT,
              poc_email TEXT,
              poc_phone TEXT,
              award_number TEXT,
              award_amount REAL,
              award_date TEXT,
              award_awardee TEXT,
              relevance_score REAL,
              topic_hits TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              raw_data TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_source ON opportunities(source);
            CREATE INDEX IF NOT EXISTS idx_agency ON opportunities(agency);
            CREATE INDEX IF NOT EXISTS idx_posted_date ON opportunities(posted_date);
            CREATE INDEX IF NOT EXISTS idx_deadline ON opportunities(response_deadline);
            CREATE INDEX IF NOT EXISTS idx_relevance ON opportunities(relevance_score);
            """
        )

        insert_sql = (
            "INSERT OR REPLACE INTO opportunities ("
            "id, source, source_record_url, title, summary, agency, "
            "posted_date, response_deadline, naics, psc, set_aside, "
            "raw_data"
            ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
        )

        count = 0
        for r in rows:
            # CSV columns expected: source, source_record_url, title, summary, agency, posted_date, response_deadline, naics, psc, set_aside
            src = (r.get("source") or "csv").strip() or "csv"
            url = (r.get("source_record_url") or "").strip() or None
            title = (r.get("title") or "Untitled").strip() or "Untitled"
            summary = (r.get("summary") or "").strip()
            agency = (r.get("agency") or None)
            posted = (r.get("posted_date") or None)
            deadline = (r.get("response_deadline") or None)
            naics = (r.get("naics") or None)
            psc = (r.get("psc") or None)
            set_aside = (r.get("set_aside") or None)

            rid = deterministic_id("csv", [src, url or "", title, posted or "", deadline or ""])

            cur.execute(
                insert_sql,
                (
                    rid,
                    src,
                    url,
                    title,
                    summary,
                    agency,
                    posted,
                    deadline,
                    naics,
                    psc,
                    set_aside,
                    json.dumps(r, ensure_ascii=False),
                ),
            )
            count += 1

        conn.commit()
        print(f"Inserted/updated {count} CSV rows into {db_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

