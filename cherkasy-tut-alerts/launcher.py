#!/usr/bin/env python3
"""Safe worker startup; supports /chatid discovery before full configuration."""
import json
import os
import runpy
import time
import urllib.request


def telegram_call(token, method, payload):
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        result = json.load(response)
    if not result.get("ok"):
        raise RuntimeError("Telegram API error")
    return result["result"]


def group_discovery(token):
    """Reply to /chatid in Telegram groups while awaiting configuration."""
    print("Group ID discovery enabled. Add bot to the editorial group and send /chatid.", flush=True)
    offset = None
    while True:
        try:
            payload = {"timeout": 25, "allowed_updates": ["message"]}
            if offset is not None:
                payload["offset"] = offset
            updates = telegram_call(token, "getUpdates", payload)
            for update in updates:
                offset = update["update_id"] + 1
                msg = update.get("message") or {}
                chat = msg.get("chat") or {}
                words = (msg.get("text") or "").split()
                if not words:
                    continue
                command = words[0].lower().split("@")[0]
                if command != "/chatid" or chat.get("type") not in ("group", "supergroup"):
                    continue
                chat_id = chat.get("id")
                if chat_id:
                    telegram_call(token, "sendMessage", {
                        "chat_id": chat_id,
                        "text": f"ID адмінгрупи: {chat_id}\nВкажіть його в ADMIN_GROUP_ID у Railway Variables.",
                    })
        except Exception as exc:
            print(f"Chat ID discovery warning: {type(exc).__name__}: {exc}", flush=True)
            time.sleep(5)


required = ("TELEGRAM_BOT_TOKEN", "ALERTS_API_TOKEN", "ADMIN_GROUP_ID")
missing = [name for name in required if not os.getenv(name, "").strip()]
if missing:
    print("ALERTS BOT CONFIGURATION REQUIRED: " + ", ".join(missing) + ". No alert posts will be sent.", flush=True)
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if token and not os.getenv("ADMIN_GROUP_ID", "").strip():
        group_discovery(token)
    while True:
        time.sleep(3600)
runpy.run_path("/app/bot.py", run_name="__main__")
