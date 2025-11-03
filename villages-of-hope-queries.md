# Villages of Hope - API Integration Guide

**Mission:** Supporting women who survived sex trafficking  
**Date Window:** Last 18 months (SAM.gov split into two 12-month + 6-month windows due to API constraint)

---

## 1. Grants.gov Query

### Endpoint
```
POST https://apply07.grants.gov/grantsws/rest/opportunities/search
```

### Request Body (JSON)
```json
{
  "keyword": "trafficking OR sex trafficking OR human trafficking OR victim services OR sexual assault OR domestic violence OR survivor services OR shelter OR transitional housing OR case management OR legal aid OR counseling OR workforce reentry",
  "fundingCategories": "ISS|HL|ED|LJL|HU",
  "eligibilities": "12|13",
  "oppStatuses": "posted|forecasted",
  "rows": 50,
  "sortBy": "openDate",
  "startRecordNum": 0
}
```

### PowerShell Command
```powershell
$body = @{
  keyword = "trafficking OR sex trafficking OR human trafficking OR victim services OR sexual assault OR domestic violence OR survivor services OR shelter OR transitional housing OR case management OR legal aid OR counseling OR workforce reentry"
  fundingCategories = "ISS|HL|ED|LJL|HU"
  eligibilities = "12|13"
  oppStatuses = "posted|forecasted"
  rows = 50
  sortBy = "openDate"
  startRecordNum = 0
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://apply07.grants.gov/grantsws/rest/opportunities/search" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 5
```

### Node/CLI Command
```powershell
cd C:\Users\mdavis\testing\grants-scraper
$env:GRANTSGOV_BASE_URL = "https://apply07.grants.gov"

node dist\bin\cli.js pull `
  --keyword "trafficking OR sex trafficking OR human trafficking OR victim services OR sexual assault OR domestic violence OR survivor services OR shelter OR transitional housing OR case management OR legal aid OR counseling OR workforce reentry" `
  --category ISS,HL,ED,LJL,HU `
  --eligibilities 12,13 `
  --status open `
  --pageSize 50 `
  --maxPages 5 `
  --verbose
```

### Funding Categories
- **ISS**: Income Security and Social Services
- **HL**: Health
- **ED**: Education
- **LJL**: Law, Justice and Legal Services
- **HU**: Humanities

### Eligibility Codes
- **12**: Nonprofits with 501(c)(3) status (excluding higher ed)
- **13**: Nonprofits without 501(c)(3) status (excluding higher ed)

---

## 2. SAM.gov Query (18-month window → 2 calls)

### Endpoint
```
GET https://api.sam.gov/opportunities/v2/search
```

### Window 1: Last 12 months
```powershell
$api = "<YOUR_SAM_API_KEY>"
$from1 = (Get-Date).AddMonths(-12).ToString('MM/dd/yyyy')
$to1 = (Get-Date).ToString('MM/dd/yyyy')

Invoke-RestMethod -Headers @{ "X-Api-Key"=$api } `
  -Uri "https://api.sam.gov/opportunities/v2/search?postedFrom=$from1&postedTo=$to1&ptype=o,k,s,r&title=trafficking|sex%20trafficking|human%20trafficking&ccode=G004&limit=100&offset=0"
```

### Window 2: Months 12-18
```powershell
$from2 = (Get-Date).AddMonths(-18).ToString('MM/dd/yyyy')
$to2 = (Get-Date).AddMonths(-12).AddDays(-1).ToString('MM/dd/yyyy')

Invoke-RestMethod -Headers @{ "X-Api-Key"=$api } `
  -Uri "https://api.sam.gov/opportunities/v2/search?postedFrom=$from2&postedTo=$to2&ptype=o,k,s,r&title=trafficking|sex%20trafficking|human%20trafficking&ccode=G004&limit=100&offset=0"
```

### Python Pipeline Command (handles 18-month split automatically)
```powershell
cd C:\Users\mdavis\testing
$env:SAM_API_KEY = "<YOUR_SAM_API_KEY>"

# Fetch 18 months of SAM data (automatically split into valid windows)
.\.venv\Scripts\python.exe -m pipeline run `
  --sources sam `
  --days 540 `
  --limit 100 `
  --keywords "trafficking,sex trafficking,human trafficking,victim services,sexual assault,domestic violence,survivor services,shelter,transitional housing,case management,legal aid,counseling,workforce reentry" `
  --no-psc `
  --output-json grants-scraper/data/sam_18months.json
```

### Procurement Types (ptype)
- **o**: Solicitation
- **k**: Combined Synopsis/Solicitation
- **s**: Special Notice
- **r**: Sources Sought

### Classification Code
- **G004**: Social—Social Rehabilitation (precision booster)

### Merge Strategy
Concatenate results from both windows, then de-duplicate by `noticeid`.

---

## 3. USAspending Query

### Endpoint
```
POST https://api.usaspending.gov/api/v2/search/spending_by_award/
```

### Request Body (18 months)
```json
{
  "filters": {
    "keywords": [
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
      "workforce reentry"
    ],
    "time_period": [
      {
        "start_date": "2024-05-02",
        "end_date": "2025-11-02"
      }
    ],
    "award_type_codes": ["02", "03"]
  },
  "fields": [
    "Award ID",
    "Recipient Name",
    "Award Amount",
    "Awarding Agency"
  ],
  "page": 1,
  "limit": 100,
  "sort": "Award Amount",
  "order": "desc"
}
```

### PowerShell Command
```powershell
$body = @{
  filters = @{
    keywords = @(
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
      "workforce reentry"
    )
    time_period = @(
      @{
        start_date = "2024-05-02"
        end_date = "2025-11-02"
      }
    )
    award_type_codes = @("02", "03")
  }
  fields = @("Award ID", "Recipient Name", "Award Amount", "Awarding Agency")
  page = 1
  limit = 100
  sort = "Award Amount"
  order = "desc"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "https://api.usaspending.gov/api/v2/search/spending_by_award/" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 5
```

### Python Pipeline Command
```powershell
cd C:\Users\mdavis\testing
.\.venv\Scripts\python.exe -m pipeline.usaspending_runner `
  --start 2024-05-02 `
  --limit 100 `
  --no-geo
```

### Award Type Codes
- **02**: Block Grant
- **03**: Formula Grant

---

## 4. Unified Sync Script

Run all three APIs and load into SQLite database:

```powershell
cd C:\Users\mdavis\testing\grants-web-app
$env:SAM_API_KEY = "<YOUR_SAM_API_KEY>"
$env:GRANTSGOV_BASE_URL = "https://apply07.grants.gov"

node server/sync.js
```

This will:
1. Fetch SAM.gov opportunities (18 months, auto-split)
2. Fetch USAspending awards (18 months)
3. Fetch Grants.gov opportunities (with Villages of Hope filters)
4. De-duplicate and load all into `grants-web-app/data/grants.db`

---

## Quick Test Commands

### Test Grants.gov (1 result)
```powershell
cd C:\Users\mdavis\testing\grants-scraper
$env:GRANTSGOV_BASE_URL = "https://apply07.grants.gov"
node dist\bin\cli.js pull --keyword "sex trafficking" --category ISS,HL,LJL,HU,ELT --eligibilities 12,13 --pageSize 1 --maxPages 1 --verbose
```

### Test SAM.gov (1 result)
```powershell
cd C:\Users\mdavis\testing
$env:SAM_API_KEY = "<YOUR_SAM_API_KEY>"
.\.venv\Scripts\python.exe -m pipeline run --sources sam --days 180 --limit 1 --max-pages 1 --keywords "sex trafficking" --no-psc --output-json grants-scraper/data/sam_test.json
```

### Test USAspending (2 results)
```powershell
cd C:\Users\mdavis\testing
.\.venv\Scripts\python.exe -m pipeline.usaspending_runner --start 2024-05-02 --limit 2 --no-geo
```

---

## Configuration File

See `villages-of-hope-config.json` for all default parameters, keyword lists, and API settings.

---

## Notes

1. **No geography or agency restrictions** per Villages of Hope requirements
2. **SAM.gov enforces 1-year max date window**; 18-month queries require two calls merged by `noticeid`
3. **All three APIs use aligned keywords** related to trafficking and victim services
4. **Grants.gov eligibilities 12 & 13** cover both 501(c)(3) and non-501(c)(3) nonprofits
5. **PSC code G004** (Social Rehabilitation) is an optional precision booster for SAM.gov queries

