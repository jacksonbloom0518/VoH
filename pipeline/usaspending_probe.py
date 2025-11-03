from __future__ import annotations

import datetime
import httpx

url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
start = "2022-10-01"
end = datetime.date.today().isoformat()
filters = {
    "award_type_codes": ["02", "03", "04", "05"],
    "time_period": [{"start_date": start, "end_date": end}],
    "place_of_performance_locations": [
        {"country": "USA", "state": "FL", "county": "Duval", "city": "Jacksonville"}
    ],
}
body = {
    "filters": filters,
    "fields": [
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
    ],
    "page": 1,
    "limit": 10,
    "sort": "Start Date",
    "order": "desc",
    "subawards": False,
}

with httpx.Client(timeout=60.0) as client:
    r = client.post(url, json=body)
    print("status", r.status_code)
    try:
        print(r.json())
    except Exception:
        print(r.text)
