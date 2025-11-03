from datetime import datetime, timedelta, timezone
from typing import Any

import json

import pipeline.sam_opportunities as sam


class DummyResp:
    def __init__(self, status_code: int, payload: dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        raise AssertionError(f"Unexpected HTTP {self.status_code}")


class DummyClient:
    def __init__(self, pages: list[dict[str, Any]]):
        self.pages = pages
        self.calls = 0

    def get(self, url, params=None, timeout=30.0):
        idx = min(self.calls, len(self.pages) - 1)
        self.calls += 1
        return DummyResp(200, self.pages[idx])

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_date_params_and_pagination(monkeypatch):
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=10)

    page1 = {
        "totalRecords": 2,
        "opportunitiesData": [
            {
                "title": "Human Trafficking Survivor Services",
                "postedDate": "2025-01-05T00:00:00Z",
            }
        ],
    }
    page2 = {
        "totalRecords": 2,
        "opportunitiesData": [
            {
                "title": "Victim Services Program",
                "postedDate": "2025-01-06T00:00:00Z",
            }
        ],
    }

    def fake_client(**kwargs):
        return DummyClient([page1, page2])

    monkeypatch.setattr(sam.httpx, "Client", fake_client)

    records = sam.fetch_sam_opportunities(
        start_date=start,
        end_date=end,
        limit=1000,
        title_keywords=sam.DEFAULT_KEYWORDS,
    )

    assert len(records) == 2
    assert records[0]["title"].lower().startswith("human trafficking")


