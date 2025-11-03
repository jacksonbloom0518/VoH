## SAM.gov Opportunities (Python pipeline)

This repo now includes a small Python 3.11+ pipeline to fetch contract opportunities from SAM.gov and merge/dedupe them with the existing Grants.gov output.

### Endpoint and auth
- Base URL: `https://api.sam.gov/opportunities/v2/search`
- Required params: `postedFrom`, `postedTo` (format MM/dd/yyyy, range ≤ 1 year)
- Supported: `limit` (≤1000), `offset`, `title`, `organizationName`, `ncode` (NAICS), `ccode` (PSC), `typeOfSetAside`, `state`, `zip`
- Auth: pass your SAM public API key via `X-Api-Key` header (default) or `api_key` query param

### Install
```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Configure
Create a `.env` file in the repo root:
```env
SAM_API_KEY=YOUR_SAM_KEY_HERE
# Optional filters
STATE_FILTER=FL,GA,TX
SET_ASIDE_FILTER=TOTAL_SMALL_BUSINESS
```

### Run
```bash
python -m pipeline run --sources grants,sam --keywords "human trafficking,sex trafficking,trafficking victims,violence against women"
```

Outputs are written to `grants-scraper/data/opportunities.json` and `.csv`, deduped by `title + agency + posted_date` (case-folded). The merger keeps the richer summary and the earliest `response_deadline`.

### Known limits
- Synchronous calls; paginate with `limit=1000` and `offset`
- SAM updates: daily for active, weekly for archived
- SAM.gov focuses on contract opportunities. For grants/financial assistance NOFOs, Grants.gov remains the primary feed. SAM’s Assistance Listings describe programs and typically point you to Grants.gov for application.


