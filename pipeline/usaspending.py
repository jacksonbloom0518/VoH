from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx


USASPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/"


KEYWORDS_DEFAULT: List[str] = [
    "trafficking",
    "sex trafficking",
    "human trafficking",
    "victim services",
    "sexual assault",
    "domestic violence",
    "survivor services",
    "shelter",
    "transitional housing",
    "case management",
    "legal aid",
    "counseling",
    "workforce reentry",
]


NE_FL_POPS: List[Dict[str, str]] = [
    {"country": "USA", "state": "FL", "county": "Duval", "city": "Jacksonville"},
]

NE_FL_POPS_EXPANDED: List[Dict[str, str]] = [
    {"country": "USA", "state": "FL", "county": "Duval"},
    {"country": "USA", "state": "FL", "county": "Clay"},
    {"country": "USA", "state": "FL", "county": "St. Johns"},
    {"country": "USA", "state": "FL", "county": "Nassau"},
    {"country": "USA", "state": "FL", "county": "Baker"},
]


def _fy_window_last_3() -> Tuple[str, str]:
    today = date.today()
    # Determine current FY start
    fy_start_year = today.year if today >= date(today.year, 10, 1) else today.year - 1
    # Three FYs back start date
    start = date(fy_start_year - 2, 10, 1)
    end = today
    return (start.isoformat(), end.isoformat())


def _post_with_backoff(client: httpx.Client, url: str, json_body: Dict[str, Any], max_tries: int = 6) -> httpx.Response:
    backoff = 0.6
    for attempt in range(max_tries):
        try:
            resp = client.post(url, json=json_body, timeout=httpx.Timeout(60.0))
            if resp.status_code < 400:
                return resp
            if resp.status_code in (429, 500, 502, 503, 504):
                # Respect basic Retry-After if present
                ra = resp.headers.get("Retry-After")
                wait_s = float(ra) if (ra and ra.isdigit()) else backoff
                time.sleep(wait_s)
                backoff = min(backoff * 2, 15.0)
                continue
            resp.raise_for_status()
        except (httpx.HTTPError) as e:
            time.sleep(backoff)
            backoff = min(backoff * 2, 15.0)
            if attempt == max_tries - 1:
                raise
    raise RuntimeError("USAspending request failed after retries")


def _build_filters(
    start_date: str,
    end_date: str,
    keywords: Optional[List[str]],
    pops: Optional[List[Dict[str, str]]],
    use_recipient_location: bool = False,
    award_type_codes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    filters: Dict[str, Any] = {
        "award_type_codes": award_type_codes or ["02", "03", "04", "05"],
        "time_period": [{"start_date": start_date, "end_date": end_date}],
    }
    if keywords:
        filters["keywords"] = keywords
    if pops:
        key = "recipient_locations" if use_recipient_location else "place_of_performance_locations"
        filters[key] = pops
    return filters


FIELDS = [
    "Award ID",
    "Recipient Name",
    "Start Date",
    "End Date",
    "Awarding Agency",
    "Funding Agency",
    "Award Amount",
    "Recipient UEI",
    "CFDA Number",
    "Assistance Listings",
    "pop_city_name",
    "pop_state_code",
    "Description",
]


def _keyword_hits(texts: List[str], keywords: List[str]) -> List[str]:
    blob = "\n".join(t.lower() for t in texts if t)
    return [k for k in keywords if k.lower() in blob]


def _score_relevance(hits: List[str]) -> float:
    if not hits:
        return 0.0
    weight = 1.0
    if any("traffick" in h for h in (x.lower() for x in hits)):
        weight = 1.5
    return min(1.0, weight * (len(hits) / 6.0))


def _map_row(row: Dict[str, Any], keywords: List[str]) -> Dict[str, Any]:
    award_id = row.get("Award ID") or row.get("generated_internal_id") or row.get("generated_unique_award_id")
    fain = row.get("FAIN") or row.get("fain")
    uri = row.get("URI") or row.get("uri")
    title = row.get("Award Title") or row.get("title") or None
    desc = row.get("Description") or row.get("Award Description") or row.get("description") or ""
    aln = row.get("CFDA Number") or row.get("cfda_number")
    # 'Assistance Listings' may be a string or list; also support cfda_program_title
    aln_title = row.get("Assistance Listings") or row.get("cfda_program_title")
    awarding_agency = row.get("Awarding Agency")
    funding_agency = row.get("Funding Agency")
    recipient_name = row.get("Recipient Name")
    recipient_uei = row.get("Recipient UEI")
    action_date = row.get("Start Date")
    perf_start = row.get("Start Date")
    perf_end = row.get("End Date")
    pop_city = row.get("pop_city_name")
    pop_county = None
    pop_state = row.get("pop_state_code")
    latest_amt = row.get("Award Amount")

    hits = _keyword_hits([title or "", desc], keywords)
    score = _score_relevance(hits)

    award_url = f"https://www.usaspending.gov/award/{award_id}" if award_id else None
    recip_url = f"https://www.usaspending.gov/recipient/{recipient_uei}" if recipient_uei else None

    return {
        "award_id": award_id or "",
        "fain": fain or None,
        "piid": None,
        "uri": uri or None,
        "title": title or None,
        "description": (desc or "").strip(),
        "assistance_listing": {"aln": aln or None, "title": aln_title or None},
        "awarding_agency": {"toptier": awarding_agency or None, "subtier": None},
        "funding_agency": {"toptier": funding_agency or None, "subtier": None},
        "recipient": {"uei": recipient_uei or None, "name": recipient_name or None, "type": None},
        "place_of_performance": {
            "city": pop_city or None,
            "county": pop_county or None,
            "state": pop_state or None,
            "zip": None,
        },
        "action_date": action_date or None,
        "period_of_performance": {"start": perf_start or None, "end": perf_end or None},
        "amounts": {
            "latest_transaction_obligation": latest_amt if isinstance(latest_amt, (int, float)) else None,
            "total_obligated": None,
            "potential_total_value": None,
        },
        "usaspending_links": {"award_page": award_url, "recipient_page": recip_url},
        "topic_hits": hits,
        "relevance_score": round(score, 3),
        "notes": None,
    }


def _aggregate_funders(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    buckets: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in records:
        agency = r.get("awarding_agency", {}).get("toptier") or ""
        aln = (r.get("assistance_listing", {}) or {}).get("aln") or ""
        key = (agency, aln)
        b = buckets.setdefault(key, {"agency": agency, "aln": aln, "aln_title": None, "count": 0, "total_obligated": 0.0})
        b["count"] += 1
        amt = r.get("amounts", {}).get("latest_transaction_obligation")
        if isinstance(amt, (int, float)):
            b["total_obligated"] += float(amt)
        if not b["aln_title"]:
            b["aln_title"] = (r.get("assistance_listing", {}) or {}).get("title")
    # Sort by total desc
    result = list(buckets.values())
    result.sort(key=lambda x: x["total_obligated"], reverse=True)
    return result


def fetch_usaspending_awards(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    keywords: Optional[List[str]] = None,
    award_type_codes: Optional[List[str]] = None,
    record_cap: int = 1000,
    disable_geo: bool = False,
) -> Dict[str, Any]:
    start, end = (start_date, end_date) if (start_date and end_date) else _fy_window_last_3()
    kw = KEYWORDS_DEFAULT if keywords is None else keywords
    apply_keyword_filter = not (keywords is not None and len(keywords) == 0)

    def run_variant(pops: Optional[List[Dict[str, str]]], use_recipient: bool) -> List[Dict[str, Any]]:
        page = 1
        limit = 100
        out: List[Dict[str, Any]] = []
        with httpx.Client(timeout=httpx.Timeout(60.0)) as client:
            while True:
                # Query without keyword filter to avoid under-matching; filter client-side
                filters = _build_filters(start, end, None, pops, use_recipient_location=use_recipient, award_type_codes=award_type_codes)
                body = {
                    "filters": filters,
                    "fields": FIELDS,
                    "page": page,
                    "limit": limit,
                    "sort": "Start Date",
                    "order": "desc",
                    "subawards": False,
                }
                resp = _post_with_backoff(client, USASPENDING_URL, body)
                data = resp.json()
                results = data.get("results") or []
                mapped = [_map_row(r, kw) for r in results]
                # Keep only keyword-matching rows unless explicitly disabled
                if apply_keyword_filter:
                    mapped = [m for m in mapped if m.get("topic_hits")]
                out.extend(mapped)
                if len(out) >= record_cap:
                    return out[:record_cap]
                meta = data.get("page_metadata") or {}
                has_next = meta.get("hasNext")
                if has_next is True:
                    page += 1
                else:
                    break
        return out

    if disable_geo:
        # No geography filters at all
        records = run_variant(None, use_recipient=False)
    else:
        # Preferred: PoP city match
        records = run_variant(NE_FL_POPS, use_recipient=False)
        if not records:
            # Expand to counties
            records = run_variant(NE_FL_POPS_EXPANDED, use_recipient=False)
        if not records:
            # Fallback: recipient location
            records = run_variant(NE_FL_POPS, use_recipient=True)
            if not records:
                records = run_variant(NE_FL_POPS_EXPANDED, use_recipient=True)

    payload = {
        "source": "usaspending",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            "geo_scope": "NE Florida (PoP preferred, recipient fallback)",
            "timeframe": f"{start}..{end}",
            "award_type_codes": (award_type_codes or ["02","03","04","05"]),
            "keywords": kw,
        },
        "awards": records,
        "funders_to_track": _aggregate_funders(records),
    }
    return payload


