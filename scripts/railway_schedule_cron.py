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
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LOG = logging.getLogger("railway-cron")
TIMEOUT = (7, 18)
# All retries fit inside the five-minute cron interval. Validation and auth failures
# are never retried; a transient Railway proxy disconnect is.
RETRY_DELAYS = (2, 4, 8)
TRANSIENT_HTTP = frozenset((408, 429, 500, 502, 503, 504))


def download(session: requests.Session, url: str, *, bootstrap: bool = False) -> requests.Response:
    """Retry temporary GET failures; keep bootstrap 503 as an expected state."""
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            response = session.get(url, timeout=TIMEOUT)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as error:
            if attempt == len(RETRY_DELAYS):
                raise
            LOG.warning("Railway snapshot GET disconnected; retry %d/%d (%s)",
                        attempt + 1, len(RETRY_DELAYS), type(error).__name__)
        else:
            if bootstrap and response.status_code == 503:
                return response
            if response.status_code not in TRANSIENT_HTTP or attempt == len(RETRY_DELAYS):
                return response
            LOG.warning("Railway snapshot GET returned HTTP %d; retry %d/%d",
                        response.status_code, attempt + 1, len(RETRY_DELAYS))
        time.sleep(RETRY_DELAYS[attempt])
    raise RuntimeError("Railway snapshot GET retries exhausted")


def already_published(session: requests.Session, base: str, checked: str) -> dict | None:
    """An interrupted POST may have committed successfully before the reply broke."""
    try:
        response = session.get(base + "/api/data/status", timeout=TIMEOUT)
        if response.status_code != 200:
            return None
        state = response.json()
        if state.get("ready") is True and state.get("lastChecked") == checked:
            return {"ok": True, **state}
    except (requests.exceptions.RequestException, ValueError, TypeError, AttributeError):
        pass
    return None



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
    schedule = download(session, base + "/api/data/schedules.json", bootstrap=True)
    if schedule.status_code == 503:
        LOG.info("No Railway snapshot yet; bootstrap from verified repository seed")
        return
    schedule.raise_for_status()
    review = download(session, base + "/api/data/source_review.json")
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
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            result = session.post(base + "/api/internal/schedules", json=payload,
                                  headers={"Authorization": "Bearer " + secret},
                                  timeout=(7, 20))
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as error:
            # Railway may have saved this POST before closing the connection.
            confirmed = already_published(session, base, schedule["lastChecked"])
            if confirmed:
                LOG.info("Publication was committed despite disconnected acknowledgement")
                return confirmed
            if attempt == len(RETRY_DELAYS):
                raise RuntimeError("Railway publication unreachable after %d attempts" %
                                   (attempt + 1)) from error
            LOG.warning("Railway publication disconnected; retry %d/%d (%s)",
                        attempt + 1, len(RETRY_DELAYS), type(error).__name__)
        else:
            if result.status_code == 200:
                body = result.json()
                if body.get("ok") is not True or body.get("lastChecked") != schedule["lastChecked"]:
                    raise RuntimeError("Railway publication acknowledgement mismatch")
                return body
            if result.status_code != 200 and result.status_code not in TRANSIENT_HTTP:
                # Never retry incorrect data (400), missing authorization (401/403),
                # or other permanent rejects. Do not print secrets or auth headers.
                raise RuntimeError("Railway publication rejected (HTTP %s): %s" %
                                   (result.status_code, result.text[:350]))
            confirmed = already_published(session, base, schedule["lastChecked"])
            if confirmed:
                LOG.info("Publication succeeded despite temporary HTTP %d", result.status_code)
                return confirmed
            if attempt == len(RETRY_DELAYS):
                raise RuntimeError("Railway publication returned HTTP %d after %d attempts" %
                                   (result.status_code, attempt + 1))
            LOG.warning("Railway publication HTTP %d; retry %d/%d",
                        result.status_code, attempt + 1, len(RETRY_DELAYS))
        time.sleep(RETRY_DELAYS[attempt])
    raise RuntimeError("Railway publication retries exhausted")


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
