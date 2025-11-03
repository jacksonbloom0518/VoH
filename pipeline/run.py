from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, List, Literal, Optional, Sequence, TypedDict

from .sam_opportunities import DEFAULT_KEYWORDS, DEFAULT_NAICS, fetch_sam_opportunities
from .settings import get_env_settings


class NormalizedOpportunity(TypedDict, total=False):
    source: Literal["sam", "grants"]
    source_record_url: str
    title: str
    summary: str
    agency: str
    posted_date: str
    response_deadline: Optional[str]
    naics: Optional[str]
    psc: Optional[str]
    set_aside: Optional[str]
    place_of_performance: dict
    point_of_contact: dict
    award_info: dict
    raw: dict


def parse_keywords(value: Optional[str]) -> Optional[List[str]]:
    if not value:
        return None
    return [s.strip() for s in value.split(",") if s.strip()]


def load_grants_json(path: Path) -> List[NormalizedOpportunity]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    # Assume the existing JSON is already normalized
    return data if isinstance(data, list) else []


def dedupe_opportunities(records: Sequence[NormalizedOpportunity]) -> List[NormalizedOpportunity]:
    seen: dict[tuple[str, str, str], NormalizedOpportunity] = {}
    for rec in records:
        key = (
            rec.get("title", "").strip().lower(),
            rec.get("agency", "").strip().lower(),
            rec.get("posted_date", "").strip().lower(),
        )
        existing = seen.get(key)
        if not existing:
            seen[key] = rec
            continue
        # Keep richer summary and earliest response_deadline
        best = existing
        if (len(rec.get("summary", "")) > len(existing.get("summary", ""))):
            best = rec | {"response_deadline": existing.get("response_deadline")}
        deadline_existing = existing.get("response_deadline")
        deadline_new = rec.get("response_deadline")
        if deadline_existing and deadline_new:
            if deadline_new < deadline_existing:
                best = best | {"response_deadline": deadline_new}
        elif deadline_new and not deadline_existing:
            best = best | {"response_deadline": deadline_new}
        seen[key] = best
    return list(seen.values())


def write_json(path: Path, records: Sequence[NormalizedOpportunity]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def write_csv(path: Path, records: Sequence[NormalizedOpportunity]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "source",
        "source_record_url",
        "title",
        "summary",
        "agency",
        "posted_date",
        "response_deadline",
        "naics",
        "psc",
        "set_aside",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow({k: r.get(k, "") for k in fieldnames})


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = argparse.ArgumentParser(prog="pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Run the aggregation pipeline")
    run_p.add_argument(
        "--sources",
        default="grants,sam",
        help="Comma-separated sources to include (grants,sam)",
    )
    run_p.add_argument(
        "--keywords",
        default=",")
    run_p.add_argument(
        "--output-json",
        default=str(Path("grants-scraper/data/opportunities.json").as_posix()),
    )
    run_p.add_argument(
        "--output-csv",
        default=str(Path("grants-scraper/data/opportunities.csv").as_posix()),
    )
    run_p.add_argument("--days", type=int, default=180)
    run_p.add_argument("--limit", type=int, default=1000)
    run_p.add_argument(
        "--no-filters",
        action="store_true",
        help="Disable SAM title/PSC filters to fetch all records",
    )
    run_p.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Maximum number of SAM pages to fetch (testing/quota protection)",
    )
    run_p.add_argument(
        "--no-psc",
        action="store_true",
        help="Disable PSC prefix filter (fetch based only on title/other filters)",
    )

    args = parser.parse_args(argv)

    if args.command == "run":
        sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}
        settings = get_env_settings()

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=max(1, min(args.days, 365)))

        keywords = parse_keywords(args.keywords)

        grants_records: List[NormalizedOpportunity] = []
        if "grants" in sources:
            grants_records = load_grants_json(Path(args.output_json))

        sam_records: List[NormalizedOpportunity] = []
        if "sam" in sources and settings.sam_api_key:
            sam_records = fetch_sam_opportunities(
                start_date=start_date,
                end_date=end_date,
                limit=max(1, min(args.limit, 1000)),
                title_keywords=(keywords or DEFAULT_KEYWORDS) if not args.no_filters else None,
                naics_filter=DEFAULT_NAICS,
                psc_prefixes=None if (args.no_filters or args.no_psc) else ["G"],
                psc_code="G004" if not args.no_filters else None,
                state_filter=settings.state_filter,
                organization_name_contains=None,
                set_aside=settings.set_aside_filter,
                use_header_auth=True,
                disable_filters=bool(args.no_filters),
                max_pages=args.max_pages,
            )

        merged = dedupe_opportunities([*grants_records, *sam_records])
        write_json(Path(args.output_json), merged)
        write_csv(Path(args.output_csv), merged)


if __name__ == "__main__":
    main()



