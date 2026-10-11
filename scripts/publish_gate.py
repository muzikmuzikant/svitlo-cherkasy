"""Avoid a full GitHub Pages build after every no-change importer check.

Call after a successful schedule import. The workflow polls frequently and
commits immediately when verified data or its confidence changes. Otherwise it
publishes a heartbeat every 30 min so the installed PWA can distinguish 'no
schedule announced' from 'the import has stopped running'.

Script outputs a GITHUB_OUTPUT-compatible `publish=true|false` line.
"""
from __future__ import annotations
import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEARTBEAT = timedelta(minutes=30)


def committed_json(path: str):
    try:
        content = subprocess.check_output(['git', 'show', 'HEAD:' + path], cwd=ROOT, stderr=subprocess.DEVNULL)
        return json.loads(content)
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


def disk_json(path: str):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def meaning(value):
    if isinstance(value, dict):
        # Check timestamp is only a freshness heartbeat, not a changed plan.
        return {k: meaning(v) for k, v in value.items() if k != 'lastChecked'}
    if isinstance(value, list):
        return [meaning(x) for x in value]
    return value


def needs_publish(old_schedule, new_schedule, old_review, new_review, now=None):
    if not isinstance(old_schedule, dict) or not isinstance(old_review, dict):
        return True
    if meaning(old_schedule) != meaning(new_schedule) or meaning(old_review) != meaning(new_review):
        return True
    checked = old_schedule.get('lastChecked')
    try:
        stamp = datetime.fromisoformat(checked.replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return True
        elapsed = (now or datetime.now(timezone.utc)) - stamp
        return elapsed < timedelta(0) or elapsed >= HEARTBEAT
    except (ValueError, TypeError, AttributeError):
        return True


def main():
    old = committed_json('data/schedules.json')
    new = disk_json('data/schedules.json')
    old_review = committed_json('data/source_review.json')
    new_review = disk_json('data/source_review.json')
    publish = needs_publish(old, new, old_review, new_review)
    print(f'publish={str(publish).lower()}')
    print('Immediate publication for real changes, heartbeat at most every 30 minutes.', file=__import__('sys').stderr)


if __name__ == '__main__':
    main()
