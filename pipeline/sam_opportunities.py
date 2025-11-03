from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

import httpx
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

SAM_SEARCH_URL = "https://api.sam.gov/opportunities/v2/search"

DEFAULT_KEYWORDS: List[str] = [
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

DEFAULT_NAICS: List[str] = [
    "624190",
    "624110",
    "624120",
]


class ThrottledError(Exception):
    def __init__(self, message: str, next_access_epoch: Optional[float] = None):
        super().__init__(message)
        self.next_access_epoch = next_access_epoch


class Link(BaseModel):
    href: Optional[str] = None


class PointOfContact(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class PlaceOfPerformance(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    model_config = ConfigDict(extra="allow")


class SamRecord(BaseModel):
    solicitationNumber: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    postedDate: Optional[str] = None
    # Handle both possible spellings
    responseDeadline: Optional[str] = None
    responseDeadLine: Optional[str] = None
    uiLink: Optional[str] = None
    organizationName: Optional[str] = None
    fullParentPathName: Optional[str] = None
    naicsCode: Optional[str] = None
    classificationCode: Optional[str] = None
    setAside: Optional[str] = None
    setAsideCode: Optional[str] = None
    links: Optional[List[Link]] = None
    # API may return list of contacts; allow any and normalize later
    pointOfContact: Optional[Any] = None
    # API may return nested dicts for city/state/country; allow any
    placeOfPerformance: Optional[Any] = None
    model_config = ConfigDict(extra="allow")


class SamSearchResponse(BaseModel):
    totalRecords: int
    opportunitiesData: List[SamRecord]
    model_config = ConfigDict(extra="allow")


def _fmt_date_mdy(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%m/%d/%Y")


def _validate_window(start_date: datetime, end_date: datetime) -> None:
    if end_date < start_date:
        raise ValueError("end_date must be >= start_date")
    if (end_date - start_date) > timedelta(days=365):
        raise ValueError("Date window must be <= 1 year for SAM API")


def _build_headers(use_header_auth: bool, api_key: Optional[str]) -> Dict[str, str]:
    headers: Dict[str, str] = {"Accept": "application/json"}
    if use_header_auth and api_key:
        headers["X-Api-Key"] = api_key
    return headers


def _append_key_to_url(url: str, api_key: Optional[str]) -> str:
    if not api_key or not url:
        return url
    separator = "&" if ("?" in url) else "?"
    return f"{url}{separator}api_key={api_key}"


def _title_matches(title: Optional[str], keywords: Sequence[str]) -> bool:
    if not title:
        return False
    t = title.lower()
    return any(kw.lower() in t for kw in keywords)


def _psc_matches(psc: Optional[str], prefixes: Optional[Sequence[str]]) -> bool:
    if not psc or not prefixes:
        return False
    return any(psc.upper().startswith(pref.upper()) for pref in prefixes)


def _choose_agency(rec: SamRecord) -> str:
    return (rec.organizationName or rec.fullParentPathName or "").strip()


def _choose_url(rec: SamRecord, api_key: Optional[str]) -> str:
    if rec.links:
        for l in rec.links:
            if l.href:
                return _append_key_to_url(l.href, api_key)
    if rec.uiLink:
        return _append_key_to_url(rec.uiLink, api_key)
    return ""


def _coerce_name_or_code(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("name") or value.get("code") or "")
    return str(value)


def _extract_pop(pop_raw: Any) -> Dict[str, str]:
    if not isinstance(pop_raw, dict):
        return {"city": "", "state": "", "zip": "", "country": ""}
    return {
        "city": _coerce_name_or_code(pop_raw.get("city")),
        "state": _coerce_name_or_code(pop_raw.get("state")),
        "zip": _coerce_name_or_code(pop_raw.get("zip") or pop_raw.get("zipCode")),
        "country": _coerce_name_or_code(pop_raw.get("country")),
    }


def _extract_poc(poc_raw: Any) -> Dict[str, str]:
    def normalize_entry(entry: Any) -> Dict[str, str]:
        if not isinstance(entry, dict):
            return {}
        # Try common keys; tolerate case/variations
        keys = {k.lower(): v for k, v in entry.items()}
        name = keys.get("name") or keys.get("fullname") or ""
        email = keys.get("email") or keys.get("emailaddress") or keys.get("email address") or ""
        phone = keys.get("phone") or keys.get("telephone") or keys.get("phone number") or ""
        # If some values are dict-like, coerce to strings
        return {
            "name": _coerce_name_or_code(name),
            "email": _coerce_name_or_code(email),
            "phone": _coerce_name_or_code(phone),
        }

    if isinstance(poc_raw, list) and poc_raw:
        # Prefer an entry with email or phone
        normalized = [normalize_entry(e) for e in poc_raw]
        chosen = next((e for e in normalized if e.get("email") or e.get("phone")), normalized[0])
        return {
            "name": chosen.get("name", ""),
            "email": chosen.get("email", ""),
            "phone": chosen.get("phone", ""),
        }
    if isinstance(poc_raw, dict):
        e = normalize_entry(poc_raw)
        return {"name": e.get("name", ""), "email": e.get("email", ""), "phone": e.get("phone", "")}
    return {"name": "", "email": "", "phone": ""}


def _normalize_record(rec: SamRecord, api_key: Optional[str]) -> Dict[str, Any]:
    pop = _extract_pop(rec.placeOfPerformance)
    poc = _extract_poc(rec.pointOfContact)

    set_aside = rec.setAsideCode or rec.setAside
    posted_iso = rec.postedDate or ""
    deadline = rec.responseDeadline or rec.responseDeadLine

    return {
        "source": "sam",
        "source_record_url": _choose_url(rec, api_key),
        "title": rec.title or "",
        "summary": (rec.description or ""),
        "agency": _choose_agency(rec),
        "posted_date": posted_iso,
        "response_deadline": deadline or None,
        "naics": rec.naicsCode or None,
        "psc": rec.classificationCode or None,
        "set_aside": set_aside or None,
        "place_of_performance": pop,
        "point_of_contact": poc,
        "award_info": {
            "number": rec.solicitationNumber or "",
            "amount": None,
            "date": None,
            "awardee": "",
        },
        "raw": rec.model_dump(by_alias=True),
    }


def _http_get(
    client: httpx.Client,
    url: str,
    params: Dict[str, Any],
    max_retries: int = 5,
    initial_backoff: float = 0.5,
) -> httpx.Response:
    backoff = initial_backoff
    for attempt in range(max_retries):
        try:
            resp = client.get(url, params=params, timeout=httpx.Timeout(90.0))
            if resp.status_code < 400:
                return resp
            if resp.status_code in (429, 500, 502, 503, 504):
                detail: Any
                try:
                    detail = resp.json()
                except Exception:
                    detail = resp.text[:200]

                # Handle explicit throttle window if provided
                if resp.status_code == 429 and isinstance(detail, dict):
                    nxt = detail.get("nextAccessTime") or detail.get("next_access_time")
                    if isinstance(nxt, str):
                        next_epoch: Optional[float] = None
                        try:
                            # Example: 2025-Oct-31 00:00:00+0000 UTC
                            nxt_dt = datetime.strptime(nxt, "%Y-%b-%d %H:%M:%S%z %Z")
                            next_epoch = nxt_dt.timestamp()
                        except Exception:
                            next_epoch = None
                        if next_epoch is not None:
                            now = datetime.now(timezone.utc).timestamp()
                            wait_s = max(0, int(next_epoch - now))
                            # If long wait, surface to caller immediately
                            if wait_s > 900:
                                raise ThrottledError(
                                    f"SAM API quota exceeded. Next access at {nxt}",
                                    next_access_epoch=next_epoch,
                                )
                            # Short wait: sleep then retry
                            print(
                                f"SAM API throttled. Waiting {wait_s}s until {nxt}",
                                file=sys.stderr,  # type: ignore[name-defined]
                            )
                            time.sleep(wait_s)
                            continue

                print(
                    f"SAM API error {resp.status_code} attempt {attempt+1}/{max_retries}: {detail}",
                    file=sys.stderr,  # type: ignore[name-defined]
                )
                time.sleep(backoff)
                backoff *= 2
                continue
            resp.raise_for_status()
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.WriteTimeout, httpx.TransportError) as exc:  # type: ignore[attr-defined]
            print(
                f"SAM API timeout/transport issue on attempt {attempt+1}/{max_retries}: {exc}",
                file=sys.stderr,  # type: ignore[name-defined]
            )
            time.sleep(backoff)
            backoff *= 2
            continue
    resp.raise_for_status()
    return resp


def fetch_sam_opportunities(
    start_date: datetime,
    end_date: datetime,
    limit: int = 1000,
    title_keywords: Optional[List[str]] = DEFAULT_KEYWORDS,
    naics_filter: Optional[List[str]] = DEFAULT_NAICS,
    psc_prefixes: Optional[List[str]] = None,
    psc_code: Optional[str] = None,
    state_filter: Optional[List[str]] = None,
    organization_name_contains: Optional[List[str]] = None,
    set_aside: Optional[List[str]] = None,
    use_header_auth: bool = True,
    disable_filters: bool = False,
    max_pages: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Fetch and normalize SAM.gov opportunities.

    Returns list of normalized dicts ready to merge with Grants.gov output.
    """
    _validate_window(start_date, end_date)

    if limit <= 0 or limit > 1000:
        limit = 1000

    api_key = os.getenv("SAM_API_KEY")
    params_base: Dict[str, Any] = {
        "postedFrom": _fmt_date_mdy(start_date),
        "postedTo": _fmt_date_mdy(end_date),
        "limit": limit,
    }

    if not use_header_auth and api_key:
        params_base["api_key"] = api_key

    headers = _build_headers(use_header_auth, api_key)

    results: List[Dict[str, Any]] = []
    offset = 0

    with httpx.Client(headers=headers, timeout=httpx.Timeout(90.0)) as client:
        total = None
        pages_fetched = 0
        while True:
            params = dict(params_base)
            params["offset"] = offset

            # Optional filters (only when specified)
            if state_filter:
                # SAM accepts a single state per query; if multiple, we query separately
                # To keep within one request per page, only pass when one value
                if len(state_filter) == 1:
                    params["state"] = state_filter[0]
            if organization_name_contains and len(organization_name_contains) == 1:
                params["organizationName"] = organization_name_contains[0]
            if set_aside and len(set_aside) == 1:
                params["typeOfSetAside"] = set_aside[0]
            if psc_code:
                params["ccode"] = psc_code

            try:
                resp = _http_get(client, SAM_SEARCH_URL, params)
            except ThrottledError as te:
                # Log and return what we have so far without raising
                msg = str(te)
                print(msg, file=sys.stderr)  # type: ignore[name-defined]
                break
            data = SamSearchResponse.model_validate(resp.json())

            total = data.totalRecords if total is None else total
            page = data.opportunitiesData or []

            for rec in page:
                if disable_filters:
                    pass  # keep all
                else:
                    # If no title_keywords provided, don't filter on title
                    title_ok = True if not title_keywords else _title_matches(rec.title, title_keywords)
                    # If no psc prefixes provided, don't filter on PSC
                    psc_ok = True if not psc_prefixes else _psc_matches(rec.classificationCode, psc_prefixes)
                    if not (title_ok or psc_ok):
                        continue
                # NAICS shortlist is a soft preference; we don't filter out if not matched
                results.append(_normalize_record(rec, api_key))

            offset += len(page)
            pages_fetched += 1
            if max_pages is not None and pages_fetched >= max_pages:
                break
            if offset >= (total or 0) or not page:
                break

    return results


