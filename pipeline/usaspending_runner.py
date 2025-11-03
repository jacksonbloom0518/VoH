from __future__ import annotations

import argparse
import json
from pipeline.usaspending import fetch_usaspending_awards


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", help="YYYY-MM-DD", default=None)
    parser.add_argument("--end", help="YYYY-MM-DD", default=None)
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument(
        "--no-keywords",
        action="store_true",
        help="Disable keyword filtering to just test connectivity",
    )
    parser.add_argument(
        "--no-geo",
        action="store_true",
        help="Disable geography filters (no PoP/recipient locations)",
    )
    args = parser.parse_args()

    payload = fetch_usaspending_awards(
        start_date=args.start,
        end_date=args.end,
        keywords=[] if args.no_keywords else None,
        record_cap=max(1, args.limit),
        disable_geo=bool(args.no_geo),
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


