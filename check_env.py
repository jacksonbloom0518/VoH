import os
from pipeline.settings import get_env_settings

print("has_env", bool(os.getenv("SAM_API_KEY")))
s = get_env_settings()
print("settings_key", bool(s.sam_api_key))
print("state_filter", s.state_filter)
print("set_aside_filter", s.set_aside_filter)


