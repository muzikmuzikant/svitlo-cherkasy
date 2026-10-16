"""Run verified Railway schedule importer on a 60-second cycle.

This is for a single always-on Railway worker, NOT Railway Cron (minimum 5 min).
Only one import may be active at a time. No new parser, no new publisher, no
subscriber or admin changes: we reuse the existing authenticated cron importer.

Activation requires switching the EXISTING svitlo-schedules-cron service from
cronSchedule='*/5 * * * *' to cronSchedule=None, with startCommand set to
'python -m scripts.schedule_minute_worker'. Never run both in parallel.
"""
from __future__ import annotations

import logging
import signal
import threading
import time
from collections.abc import Callable

from scripts.railway_schedule_cron import main as verify_and_publish

LOG = logging.getLogger("railway-minute-worker")
CHECK_INTERVAL = 60
MAX_FAILURE_BACKOFF = 300


def loop(
    run_once: Callable[[], object] = verify_and_publish,
    *,
    interval: int = CHECK_INTERVAL,
    monotonic: Callable[[], float] = time.monotonic,
    wait: Callable[[float], object] = time.sleep,
    stopped: Callable[[], bool] = lambda: False,
    max_runs: int | None = None,
) -> int:
    """Serial checks, fixed cadence from start, bounded backoff, graceful stop."""
    if interval < 30:
        raise ValueError("Minute worker interval must be >=30 seconds")
    count = 0
    consecutive_errors = 0
    while not stopped():
        started = monotonic()
        try:
            result = run_once()
            if result not in (None, 0):
                raise RuntimeError("Railway import returned nonzero status: " + str(result))
            consecutive_errors = 0
        except Exception:
            consecutive_errors += 1
            LOG.exception("Schedule check failed; last published snapshot unchanged")
        count += 1
        if max_runs is not None and count >= max_runs:
            break
        if stopped():
            break
        elapsed = max(0, monotonic() - started)
        backoff = min(MAX_FAILURE_BACKOFF, interval * (2 ** max(0, consecutive_errors - 1)))
        pause = max(2, backoff - elapsed)
        LOG.info("Next official schedule check in %.1fs", pause)
        wait(pause)
    return count


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[railway-minute] %(levelname)s %(message)s")
    stop = threading.Event()

    def handle_stop(signum: int, _frame: object) -> None:
        LOG.info("Stop requested (signal %s), finishing current check", signum)
        stop.set()

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)
    LOG.info("Starting serial official schedule monitor, interval=%ss", CHECK_INTERVAL)
    loop(wait=stop.wait, stopped=stop.is_set)
    LOG.info("Stopped official schedule monitor")


if __name__ == "__main__":
    main()
