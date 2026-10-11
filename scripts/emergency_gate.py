"""Frequent emergency polling, but no Pages rebuild for unchanged timestamps.

Changes publish immediately; a source-check heartbeat publishes hourly.
"""
import json
from datetime import datetime, timedelta, timezone
from scripts.publish_gate import committed_json, disk_json


def needed(old, new, now=None):
    if not isinstance(old,dict) or not isinstance(new,dict):return True
    current={k:v for k,v in new.items() if k!='lastChecked'}
    previous={k:v for k,v in old.items() if k!='lastChecked'}
    if current!=previous:return True
    try:
        stamp=datetime.fromisoformat(old['lastChecked'].replace('Z','+00:00'))
        if stamp.tzinfo is None:return True
        age=(now or datetime.now(timezone.utc))-stamp
        return age < timedelta(0) or age >= timedelta(hours=1)
    except (TypeError,ValueError,KeyError,AttributeError):return True

if __name__=='__main__':
    old=committed_json('data/emergency.json')
    new=disk_json('data/emergency.json')
    print('publish='+str(needed(old,new)).lower())
