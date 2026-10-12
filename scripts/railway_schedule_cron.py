#!/usr/bin/env python3
"""Railway Cron: verify operator schedules and publish them to Railway's durable API.
Runs once and exits. GitHub Actions/Pages are not needed to publish fresh schedules.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LOG = logging.getLogger("railway-cron")
TIMEOUT = (7, 18)


def endpoint() -> str:
    base = os.environ.get("SCHEDULE_PUBLISH_URL", "").strip().rstrip("/")
    if not base.startswith("https://"):
        raise RuntimeError("SCHEDULE_PUBLISH_URL must be HTTPS")
    return base


def download_previous(session: requests.Session, base: str) -> None:
    """Use last *published* snapshot, not the stale file in the repository.

    A missing snapshot (503) is expected on the first bootstrap. A real network
    failure must abort rather than permitting an old checkout to regress data.
    """
    schedule = session.get(base + "/api/data/schedules.json", timeout=TIMEOUT)
    if schedule.status_code == 503:
        LOG.info("No Railway snapshot yet; bootstrap from verified repository seed")
        return
    schedule.raise_for_status()
    review = session.get(base + "/api/data/source_review.json", timeout=TIMEOUT)
    review.raise_for_status()
    old_schedule, old_review = schedule.json(), review.json()
    if not isinstance(old_schedule.get("days"), list) or not old_schedule.get("lastChecked"):
        raise RuntimeError("Railway snapshot invalid: cannot safely import")
    if not isinstance(old_review.get("items"), list):
        raise RuntimeError("Railway review snapshot invalid")
    (DATA / "schedules.json").write_text(json.dumps(old_schedule, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "source_review.json").write_text(json.dumps(old_review, ensure_ascii=False) + "\n", encoding="utf-8")
    LOG.info("Restored previous Railway state checked at %s", old_schedule["lastChecked"])


def import_official() -> None:
    # Reuse exactly the verified importer used by GitHub Actions, without
    # a second parser or any speculative outage schedule synthesis.
    subprocess.run([sys.executable, str(ROOT / "scripts" / "update_data.py"), "--schedules-only"],
                   cwd=ROOT, timeout=220, check=True)


def publish(session: requests.Session, base: str, secret: str) -> dict:
    schedule = json.loads((DATA / "schedules.json").read_text(encoding="utf-8"))
    review = json.loads((DATA / "source_review.json").read_text(encoding="utf-8"))
    if schedule.get("schemaVersion") != 3 or not isinstance(schedule.get("days"), list):
        raise RuntimeError("Importer did not produce a verified schedule")
    if not schedule.get("lastChecked") or not review.get("lastChecked"):
        raise RuntimeError("Importer did not finish a source review")
    payload = {"schedules": schedule, "review": review}
    result = session.post(base + "/api/internal/schedules", json=payload,
                          headers={"Authorization": "Bearer " + secret},
                          timeout=(7, 20))
    if result.status_code != 200:
        # Never print the secret or the auth header.
        raise RuntimeError("Railway publication rejected (HTTP %s): %s" %
                           (result.status_code, result.text[:350]))
    body = result.json()
    if body.get("ok") is not True or body.get("lastChecked") != schedule["lastChecked"]:
        raise RuntimeError("Railway publication acknowledgement mismatch")
    return body


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[railway-cron] %(levelname)s %(message)s")
    base = endpoint()
    secret = os.environ.get("SCHEDULE_INGEST_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("SCHEDULE_INGEST_SECRET must be set (at least 32 characters)")
    with requests.Session() as session:
        download_previous(session, base)
        import_official()
        result = publish(session, base, secret)
    LOG.info("Published checked=%s, verified days=%s, review pending=%s",
             result["lastChecked"], result["verifiedDays"], result["reviewPending"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:
        logging.getLogger("railway-cron").exception("FAILED (existing Railway data unchanged): %s", err)
        sys.exit(1)
