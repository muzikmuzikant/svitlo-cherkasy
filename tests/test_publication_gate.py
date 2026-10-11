"""A fast importer must not cause hundreds of needless Pages deployments."""
from datetime import datetime, timedelta, timezone
from scripts.publish_gate import needs_publish

NOW = datetime(2026, 10, 11, 17, 20, tzinfo=timezone.utc)

def old(minutes=6):
    return {'lastChecked': (NOW - timedelta(minutes=minutes)).isoformat(), 'days': [], 'reviewPending': False, 'changes': []}

def test_unchanged_schedule_does_not_redeploy_every_five_minutes():
    before = old(6)
    after = {**before, 'lastChecked': NOW.isoformat()}
    assert not needs_publish(before, after, {}, {}, NOW)

def test_change_is_published_immediately():
    before = old(1)
    after = {**before, 'days':[{'date':'2026-10-12','verified':True,'queues':{}}]}
    assert needs_publish(before, after, {}, {}, NOW)

def test_confidence_change_is_published_immediately():
    before = old(1)
    after = {**before, 'reviewPending':True}
    assert needs_publish(before, after, {}, {}, NOW)
    assert needs_publish(before, before, {'items':[]}, {'items':[{'code':'ARTICLE_FETCH_FAILED'}]}, NOW)

def test_periodic_heartbeat_informs_installed_app_of_recent_source_check():
    before = old(31)
    after = {**before, 'lastChecked': NOW.isoformat()}
    assert needs_publish(before, after, {}, {}, NOW)

def test_missing_old_commit_gets_published():
    assert needs_publish(None, old(), {}, {}, NOW)
