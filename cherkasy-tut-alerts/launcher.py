#!/usr/bin/env python3
"""Start the worker only when required production credentials are configured."""
import os
import runpy
import time

required = ("TELEGRAM_BOT_TOKEN", "ALERTS_API_TOKEN", "ADMIN_GROUP_ID")
missing = [name for name in required if not os.getenv(name, "").strip()]
if missing:
    print("ALERTS BOT CONFIGURATION REQUIRED: " + ", ".join(missing) + ". No Telegram posts will be sent.", flush=True)
    while True:
        time.sleep(3600)
runpy.run_path("/app/bot.py", run_name="__main__")
