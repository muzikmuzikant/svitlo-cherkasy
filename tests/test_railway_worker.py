"""Railway migration smoke tests; run with python -m pytest -q tests/test_railway_worker.py."""
import json
from contextlib import nullcontext
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import Mock

import pytest

from importer import worker


class FakeGitHub:
    def __init__(self, old, old_review):
        self.old = old
        self.old_review = old_review
        self.published = []
    def current_ref(self): return 'head-sha'
    def get_commit(self, sha): return {'tree': {'sha': 'tree-sha'}}
    def read_file(self, name, sha):
        return self.old if name.endswith('/schedules.json') else self.old_review
    def publish(self, head, tree, files):
        self.published.append((head, tree, files))
        return 'c' * 40


def base():
    return {'schemaVersion': 3,
            'lastChecked': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'days': [], 'reviewPending': False}


def prepare(tmp_path, monkeypatch, new):
    monkeypatch.setattr(worker.update_data, 'ROOT', tmp_path)
    monkeypatch.setattr(worker.update_data, 'DATA', tmp_path / 'data')
    monkeypatch.setattr(worker.update_data, 'create_session', lambda: nullcontext(object()), raising=False)
    def fake_import(session):
        worker.update_data.atomic_write(tmp_path / 'data/schedules.json', new)
        worker.update_data.atomic_write(tmp_path / 'data/source_review.json',
                                        {'schemaVersion': 1, 'lastChecked': new['lastChecked']})
        return new
    monkeypatch.setattr(worker.update_data, 'update_schedules', fake_import)


def test_refuses_missing_gh_credentials():
    with pytest.raises(ValueError):
        worker.GitHub('', 'owner/repo')
    with pytest.raises(ValueError):
        worker.GitHub('token', '')


def test_change_published_as_one_commit(tmp_path, monkeypatch):
    old = base()
    new = {**old, 'days': [{
        'date': '2027-01-01', 'verified': True, 'queues': {'1.1': {'off': [['08:00', '09:00']]}}
    }]}
    prepare(tmp_path, monkeypatch, new)
    github = FakeGitHub(old, {'schemaVersion': 1, 'lastChecked': old['lastChecked']})
    assert worker.run_once(github) == 'published'
    assert len(github.published) == 1
    assert set(github.published[0][2]) == set(worker.FILES)


def test_no_change_no_needless_publish(tmp_path, monkeypatch):
    old = base()
    new = {**old, 'lastChecked': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    prepare(tmp_path, monkeypatch, new)
    github = FakeGitHub(old, {'schemaVersion': 1, 'lastChecked': old['lastChecked']})
    assert worker.run_once(github) == 'unchanged'
    assert not github.published


def test_import_failure_keeps_github_unchanged(tmp_path, monkeypatch):
    old = base()
    prepare(tmp_path, monkeypatch, old)
    def broken(session):
        raise RuntimeError('Source unavailable')
    monkeypatch.setattr(worker.update_data, 'update_schedules', broken)
    github = FakeGitHub(old, {'schemaVersion': 1, 'lastChecked': old['lastChecked']})
    with pytest.raises(RuntimeError, match='Source unavailable'):
        worker.run_once(github)
    assert not github.published


def test_protects_future_published_dates():
    tomorrow = (datetime.now(worker.update_data.TZ).date() + timedelta(days=1)).isoformat()
    old = {'days': [{'date': tomorrow, 'verified': True}]}
    with pytest.raises(RuntimeError, match='removed verified future'):
        worker.validate_merged(old, {'days': []})


def test_github_git_commit_is_non_forced():
    class MemorySession:
        def __init__(self): self.calls = []
        def request(self, method, url, **kwargs):
            self.calls.append((method, url, kwargs))
            path = url.split('/repos/owner/repo/')[1]
            out = {'git/trees': {'sha': 'new-tree'}, 'git/commits': {'sha': 'new-commit'},
                   'git/refs/heads/main': {'object': {'sha': 'new-commit'}}}[path]
            return Mock(status_code=200, json=lambda: out)
    session = MemorySession()
    github = worker.GitHub('secret', 'owner/repo', session=session)
    files = {path: {'lastChecked':'now'} for path in worker.FILES}
    assert github.publish('parent-sha', 'tree-sha', files) == 'new-commit'
    assert session.calls[0][2]['json']['base_tree'] == 'tree-sha'
    assert session.calls[1][2]['json']['parents'] == ['parent-sha']
    assert session.calls[2][2]['json']['force'] is False



def test_standby_never_touches_github_without_credentials(monkeypatch):
    monkeypatch.delenv('GITHUB_TOKEN', raising=False)
    monkeypatch.delenv('GITHUB_REPOSITORY', raising=False)
    monkeypatch.setenv('IMPORTER_ACTIVE', '0')
    assert worker.main() == 'standby'


def test_active_requires_github_token(monkeypatch):
    monkeypatch.setenv('IMPORTER_ACTIVE', '1')
    monkeypatch.delenv('GITHUB_TOKEN', raising=False)
    monkeypatch.setenv('GITHUB_REPOSITORY', 'muzikmuzikant/svitlo-cherkasy')
    with pytest.raises(ValueError, match='GITHUB_TOKEN'):
        worker.main()
