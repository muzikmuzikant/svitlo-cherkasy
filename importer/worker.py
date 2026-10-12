"""Run the existing official importer on Railway and publish an atomic GitHub commit.

This worker deliberately does not contain its own schedule parser. It imports the
repository's scripts/update_data.py so bug fixes stay in one place.

The GitHub repository is the source of truth. A Railway Cron instance never uses
its image's bundled JSON; it downloads the latest files at the current HEAD.

Required Railway variables:
    GITHUB_TOKEN       Fine-grained PAT, Contents: Read and write, this repo only
    GITHUB_REPOSITORY  username/repo (e.g. muzikmuzikant/svitlo-cherkasy)
Optional:
    GITHUB_BRANCH      main (default)
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from scripts import update_data
from scripts.publish_gate import needs_publish

LOG = logging.getLogger('railway-importer')
API = 'https://api.github.com'
FILES = ('data/schedules.json', 'data/source_review.json')
MAX_FILE_SIZE = 2_000_000


class GitHubError(RuntimeError):
    def __init__(self, status: int, message: str):
        self.status = status
        # Never expose authentication headers, token values or full response bodies.
        super().__init__(f'GitHub API HTTP {status}: {message}')


class GitHub:
    def __init__(self, token: str, repository: str, branch: str = 'main', session=None):
        if not token or not token.strip():
            raise ValueError('GITHUB_TOKEN is required')
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository or ''):
            raise ValueError('GITHUB_REPOSITORY must be owner/repo')
        if not re.fullmatch(r'[A-Za-z0-9_./-]+', branch) or '..' in branch:
            raise ValueError('Invalid GITHUB_BRANCH')
        self.repo = repository
        self.branch = branch
        self.session = session or requests.Session()
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Svitlo-Cherkasy-Railway-Importer',
        }

    def request(self, method, path, data=None, params=None):
        try:
            response = self.session.request(
                method, f'{API}/repos/{self.repo}/{path}', headers=self.headers,
                json=data, params=params, timeout=(8, 20),
            )
        except requests.RequestException as exc:
            raise RuntimeError(f'GitHub network failure: {type(exc).__name__}') from exc
        if not 200 <= response.status_code < 300:
            hints = {
                401: 'invalid or expired token',
                403: 'token lacks permission or rate limit',
                404: 'repository / branch / file not found',
                409: 'branch changed during update',
                422: 'non-fast-forward update or invalid Git tree',
            }
            raise GitHubError(response.status_code, hints.get(response.status_code, 'request rejected'))
        try:
            return response.json()
        except ValueError as exc:
            raise RuntimeError('GitHub sent invalid JSON') from exc

    def current_ref(self):
        obj = self.request('GET', 'git/ref/heads/' + quote(self.branch, safe='/'))
        return obj['object']['sha']

    def get_commit(self, sha):
        return self.request('GET', 'git/commits/' + sha)

    def read_file(self, filename: str, sha: str):
        obj = self.request('GET', 'contents/' + filename, params={'ref': sha})
        if obj.get('encoding') != 'base64' or obj.get('size', 0) > MAX_FILE_SIZE:
            raise RuntimeError(f'Unsupported or oversized GitHub file: {filename}')
        try:
            content = base64.b64decode(obj['content'], validate=False)
            if len(content) > MAX_FILE_SIZE:
                raise ValueError('too big')
            value = json.loads(content.decode('utf-8'))
            if not isinstance(value, dict):
                raise ValueError('root must be an object')
            return value
        except (KeyError, ValueError, UnicodeError, binascii.Error) as exc:
            raise RuntimeError(f'Malformed remote JSON: {filename}') from exc

    def publish(self, base_sha, base_tree_sha, files: dict[str, dict]):
        # One atomic commit for both files, rather than two separate commits
        # where Pages could briefly serve inconsistent dates/diagnostics.
        tree = self.request('POST', 'git/trees', data={
            'base_tree': base_tree_sha,
            'tree': [
                {'path': path, 'mode': '100644', 'type': 'blob',
                 'content': json.dumps(files[path], ensure_ascii=False, indent=2) + '\n'}
                for path in FILES
            ],
        })
        commit = self.request('POST', 'git/commits', data={
            'message': 'Refresh official blackout schedules [railway]',
            'tree': tree['sha'],
            'parents': [base_sha],
        })
        # No forced pushes, ever. A concurrent commit creates a conflict.
        self.request('PATCH', 'git/refs/heads/' + quote(self.branch, safe='/'), data={
            'sha': commit['sha'], 'force': False,
        })
        return commit['sha']


def validate_merged(old: dict, current: dict):
    """Prevent accidental loss of already confirmed *future* schedules."""
    if not isinstance(current, dict) or not isinstance(current.get('days'), list):
        raise RuntimeError('Importer produced invalid schedules.json')
    old_days = {d['date']: d for d in old.get('days', []) if isinstance(d, dict) and 'date' in d}
    new_days = {d['date']: d for d in current['days'] if isinstance(d, dict) and 'date' in d}
    if len(new_days) != len(current['days']):
        raise RuntimeError('Importer produced duplicate or malformed schedule dates')
    today = datetime.now(update_data.TZ).date().isoformat()
    for date, day in old_days.items():
        if date >= today and day.get('verified') and date not in new_days:
            raise RuntimeError(f'Importer unexpectedly removed verified future date {date}')
    for date, day in new_days.items():
        if not isinstance(day.get('queues'), dict):
            raise RuntimeError(f'Malformed queue mapping for {date}')
    return True


def load_remote_files(github: GitHub, head: str):
    original = {}
    for name in FILES:
        original[name] = github.read_file(name, head)
        target = update_data.ROOT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        update_data.atomic_write(target, original[name])
    return original


def run_once(github: GitHub, now=None):
    head = github.current_ref()
    tree_sha = github.get_commit(head)['tree']['sha']
    previous = load_remote_files(github, head)
    with getattr(update_data, 'create_session', requests.Session)() as source:
        updated = update_data.update_schedules(source)
    # Read both final files from the isolated container after importing.
    new = {path: json.loads((update_data.ROOT / path).read_text(encoding='utf-8')) for path in FILES}
    validate_merged(previous[FILES[0]], updated)
    if not needs_publish(previous[FILES[0]], new[FILES[0]],
                         previous[FILES[1]], new[FILES[1]], now=now):
        LOG.info('OK — no schedule revisions; GitHub not modified. checked=%s', new[FILES[0]].get('lastChecked'))
        return 'unchanged'
    sha = github.publish(head, tree_sha, new)
    LOG.info('PUBLISHED — commit=%s dates=%s checked=%s', sha[:12],
             ','.join(day['date'] for day in new[FILES[0]]['days']),
             new[FILES[0]].get('lastChecked'))
    return 'published'


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    repo = os.environ.get('GITHUB_REPOSITORY', '').strip()
    branch = os.environ.get('GITHUB_BRANCH', 'main').strip()
    if not token or not repo:
        raise ValueError('Set GITHUB_TOKEN and GITHUB_REPOSITORY in Railway Variables')
    github = GitHub(token, repo, branch)
    # Concurrent updates from another system are rare but are never overwritten:
    # re-fetch remote state and re-parse after a ref conflict.
    for attempt in range(1, 4):
        try:
            return run_once(github)
        except GitHubError as error:
            if error.status in (409, 422) and attempt < 3:
                LOG.warning('GitHub branch moved; retrying against latest data (%s/3)', attempt)
                continue
            raise
    raise RuntimeError('Failed to publish after GitHub conflicts')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        LOG.exception('IMPORT FAILED — no source updates published: %s', type(exc).__name__)
        sys.exit(1)
