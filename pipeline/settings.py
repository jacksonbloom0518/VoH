from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional

try:
    # Optional; do not fail if not installed
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:
    pass


@dataclass(frozen=True)
class EnvSettings:
    sam_api_key: Optional[str]
    state_filter: Optional[List[str]]
    set_aside_filter: Optional[List[str]]


def _split_csv(value: Optional[str]) -> Optional[List[str]]:
    if not value:
        return None
    items = [v.strip() for v in value.split(",") if v.strip()]
    return items or None


def get_env_settings() -> EnvSettings:
    return EnvSettings(
        sam_api_key=os.getenv("SAM_API_KEY") or None,
        state_filter=_split_csv(os.getenv("STATE_FILTER")),
        set_aside_filter=_split_csv(os.getenv("SET_ASIDE_FILTER")),
    )



