#!/usr/bin/env python3
"""Alerts.in.ua -> Telegram, standalone zero-dependency Railway worker.
Uses an explicit state machine and persistent SQLite outbox to avoid repeat posts.
"""
import html
import json
import logging
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

LOG = logging.getLogger('cherkasy-alerts')
TZ = ZoneInfo('Europe/Kyiv')
OBLAST_UID = '24'  # Cherkasy oblast, per alerts.in.ua API documentation
OBLAST_NAME = 'Черкаська область'
# Official Alerts.in.ua UID listing: https://devs.alerts.in.ua/ (location reference)
RAIONS = {
    '150': 'Звенигородський район',
    '153': 'Золотоніський район',
    '151': 'Уманський район',
    '152': 'Черкаський район',
}
VALID = {'N', 'Y', 'R', 'P'}
LEVELS = {'red': 'R', 'yellow': 'Y'}


def setting(name, default=''):
    return os.environ.get(name, default).strip()


def now_local():
    return datetime.now(TZ).strftime('%d.%m.%Y, %H:%M:%S')


def normalize_alerts(payload, mode='oblast'):
    """Return {location_uid: (label, status)} from v1 detailed response.

    The v1 endpoint may include non-air-raid alerts; these must never be posted.
    If mode=oblast, omit subregional locations and use v2 IoT instead in production.
    """
    result = {}
    for alert in payload.get('alerts', []):
        if alert.get('alert_type') != 'air_raid':
            continue
        uid = str(alert.get('location_uid') or '')
        in_oblast = uid == OBLAST_UID or str(alert.get('location_oblast_uid', '')) == OBLAST_UID or alert.get('location_oblast') == OBLAST_NAME
        if not uid or not in_oblast:
            continue
        if mode == 'oblast' and uid != OBLAST_UID:
            continue
        status = LEVELS.get(alert.get('alert_level'))
        if not status:
            LOG.warning('Unknown/missing alert_level for %s; skipping', uid)
            continue
        label = (alert.get('location_title') or OBLAST_NAME).strip()
        old = result.get(uid)
        if old is None or (status == 'R' and old[1] == 'Y'):
            result[uid] = (label, status)
    return result


def normalize_raions(statuses):
    """Read all four districts from one official v2 IoT response.

    A space/unknown symbol is missing data, NOT the end of an alert.
    An oblast-wide Y/R status covers every district; it must propagate, even
    if a district UID unexpectedly remains N or P in the incoming response.
    """
    if not isinstance(statuses, str) or len(statuses) <= max(int(uid) for uid in RAIONS):
        raise ValueError('Invalid or truncated v2 IoT status string')
    oblast = statuses[int(OBLAST_UID)]
    if oblast not in VALID:
        raise ValueError('Missing or invalid oblast status')
    result = {}
    for uid, label in RAIONS.items():
        state = statuses[int(uid)]
        if state not in VALID:
            raise ValueError(f'Missing or invalid state for {label}')
        if oblast == 'R':
            state = 'R'
        elif oblast == 'Y' and state in ('N', 'P'):
            state = 'Y'
        result[uid] = (label, state)
    return result


def compose(label, previous, current, when=None, mode='oblast'):
    """One-line Telegram alert: no timestamps, source credits or extra description."""
    place = 'Область' if label in ('Уся Черкаська область', 'Черкаська область') else label
    place = html.escape(place)
    if current == 'Y':
        return f'🟡🚨 {place} — жовта тривога!'
    if current == 'R':
        return f'🔴🚨 {place} — червона тривога!'
    if current == 'N':
        level = {'Y': 'жовтої', 'R': 'червоної'}.get(previous)
        return f'🟢 {place} — Відбій {level} тривоги' if level else f'🟢 {place} — Відбій тривоги'
    if current == 'P':
        # A partial alert cannot reliably be classified yellow/red at raion level.
        return f'🟠🚨 {place} — часткова тривога!'
    raise ValueError('Invalid alert status')


class Storage:
    def __init__(self, path):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS locations (
                  uid TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL,
                  ending_checks INTEGER NOT NULL DEFAULT 0
              );
              CREATE TABLE IF NOT EXISTS outbox (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL,
                  label TEXT NOT NULL, previous TEXT NOT NULL, current TEXT NOT NULL,
                  detected_at TEXT NOT NULL,
                  channel_done INTEGER NOT NULL DEFAULT 0,
                  group_done INTEGER NOT NULL DEFAULT 0
              );
              CREATE TABLE IF NOT EXISTS subscribers (
                  user_id INTEGER PRIMARY KEY, display_name TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            ''')

    def connection(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.execute('PRAGMA busy_timeout=15000')
        return db

    def apply_snapshot(self, snapshot, mode='oblast'):
        """First successful response primes DB, subsequent transitions create outbox.
        A confirmed end needs two consecutive successful observations.
        In detailed mode, province-wide alert supersedes narrower localities
        to avoid spurious local all-clear messages and duplicate warnings.
        """
        with self.connection() as db:
            stored_mode = db.execute("SELECT value FROM kv WHERE key='monitor_mode'").fetchone()
            if not stored_mode or stored_mode[0] != mode:
                # A mode change must not generate false clears for old locations.
                # Drop any stale unsent events from the previous mode as well.
                db.execute('DELETE FROM locations')
                db.execute('DELETE FROM outbox')
                db.execute("DELETE FROM kv WHERE key='primed'")
                db.execute("INSERT OR REPLACE INTO kv(key,value) VALUES('monitor_mode',?)", (mode,))
            primed = db.execute("SELECT value FROM kv WHERE key='primed'").fetchone()
            current = {uid: (label, status, checks) for uid, label, status, checks in
                       db.execute('SELECT uid,label,status,ending_checks FROM locations')}
            if mode == 'all' and OBLAST_UID in snapshot:
                # Under a full-oblast warning, local records may disappear from
                # the source because they are subsumed, not because they ended.
                # Drop them silently; local alerts can reappear after it ends.
                snapshot = {OBLAST_UID: snapshot[OBLAST_UID]}
                for uid in list(current):
                    if uid != OBLAST_UID:
                        db.execute('DELETE FROM locations WHERE uid=?', (uid,))
                        del current[uid]
            if not primed:
                for uid, (label, status) in snapshot.items():
                    db.execute('INSERT OR REPLACE INTO locations(uid,label,status,ending_checks) VALUES(?,?,?,0)', (uid, label, status))
                db.execute("INSERT INTO kv(key,value) VALUES('primed','1')")
                LOG.info('Initial state captured without sending old alerts: %r', snapshot)
                return 0
            # Collect all changes from the same API snapshot before publishing.
            # An oblast-wide event must replace four individual raion messages.
            changes = []
            for uid in sorted(set(current) | set(snapshot)):
                label, new = snapshot.get(uid, (current.get(uid, (OBLAST_NAME, 'N', 0))[0], 'N'))
                if uid not in current:
                    old = 'N'
                    checks = 0
                else:
                    _, old, checks = current[uid]
                if new not in VALID:
                    continue
                if old == new:
                    if checks:
                        db.execute('UPDATE locations SET ending_checks=0 WHERE uid=?', (uid,))
                    continue
                if new == 'N' and old != 'N' and checks < 1:
                    db.execute('UPDATE locations SET ending_checks=1 WHERE uid=?', (uid,))
                    continue
                when = now_local()
                db.execute('INSERT OR REPLACE INTO locations(uid,label,status,ending_checks) VALUES(?,?,?,0)', (uid, label, new))
                changes.append((uid, label, old, new, when))
                LOG.info('Transition: %s: %s -> %s', label, old, new)

            if mode == 'raions' and changes and all(uid in snapshot for uid in RAIONS):
                new_states = [snapshot[uid][1] for uid in RAIONS]
                old_states = [current.get(uid, (RAIONS[uid], 'N', 0))[1] for uid in RAIONS]
                new_full = new_states[0] if len(set(new_states)) == 1 else None
                old_full = old_states[0] if len(set(old_states)) == 1 else None
                if new_full in ('Y', 'R') or (new_full == 'N' and old_full in ('Y', 'R')):
                    # Preserve start and yellow-to-red escalation signals even
                    # when several raion changes become one oblast-wide post.
                    new_start = any(old == 'N' and new in ('Y', 'R', 'P')
                                    for _, _, old, new, _ in changes)
                    escalated = any(old == 'Y' and new == 'R'
                                    for _, _, old, new, _ in changes)
                    previous = ('N' if new_start else 'Y' if escalated else (old_full or 'P'))
                    changes = [(OBLAST_UID, 'Уся Черкаська область', previous,
                                new_full, changes[0][4])]
                    LOG.info('Consolidated four districts into one oblast notice: %s -> %s',
                             previous, new_full)

            for uid, label, old, new, when in changes:
                db.execute('INSERT INTO outbox(uid,label,previous,current,detected_at) VALUES(?,?,?,?,?)',
                           (uid, label, old, new, when))
            return len(changes)

    def subscribe(self, user_id, name):
        with self.connection() as db:
            db.execute('INSERT OR REPLACE INTO subscribers(user_id,display_name) VALUES(?,?)', (user_id, name[:100]))

    def unsubscribe(self, user_id):
        with self.connection() as db:
            db.execute('DELETE FROM subscribers WHERE user_id=?', (user_id,))

    def subscribers(self):
        with self.connection() as db:
            return db.execute('SELECT user_id,display_name FROM subscribers ORDER BY user_id').fetchall()

    def pending(self):
        with self.connection() as db:
            return db.execute('SELECT id,uid,label,previous,current,detected_at,channel_done,group_done FROM outbox WHERE channel_done=0 OR group_done=0 ORDER BY id').fetchall()

    def done(self, event_id, dest):
        assert dest in ('channel_done', 'group_done')
        with self.connection() as db:
            db.execute(f'UPDATE outbox SET {dest}=1 WHERE id=?', (event_id,))

    def latest(self):
        with self.connection() as db:
            return db.execute('SELECT label,status FROM locations ORDER BY label').fetchall()


class Telegram:
    def __init__(self, token):
        self.root = f'https://api.telegram.org/bot{token}/'

    def call(self, method, data=None, timeout=20):
        blob = json.dumps(data or {}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(self.root + method, blob,
                                     headers={'Content-Type': 'application/json; charset=utf-8'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.load(resp)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'replace')[:300]
            raise RuntimeError(f'Telegram {method} HTTP {exc.code}: {detail}') from exc
        if not result.get('ok'):
            raise RuntimeError(f'Telegram {method}: {result}')
        return result['result']

    def send(self, chat_id, text, notify=True):
        return self.call('sendMessage', {'chat_id': chat_id, 'text': text,
                                         'parse_mode': 'HTML', 'disable_notification': not notify,
                                         'link_preview_options': {'is_disabled': True}})


class AlertsSource:
    def __init__(self, token, mode):
        self.token, self.mode = token, mode
        self.last_modified = None
        self.cached = None

    def get(self):
        suffix = ('v2/iot/active_air_raid_alerts/24.json' if self.mode == 'oblast' else
                  'v2/iot/active_air_raid_alerts.json' if self.mode == 'raions' else
                  'v1/alerts/active.json')
        headers = {'Authorization': f'Bearer {self.token}', 'User-Agent': 'CherkasyTutAlertsBot/1.0'}
        if self.last_modified:
            headers['If-Modified-Since'] = self.last_modified
        req = urllib.request.Request('https://api.alerts.in.ua/' + suffix, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                body = json.load(response)
                new_modified = response.headers.get('Last-Modified')
                if new_modified:
                    self.last_modified = new_modified
        except urllib.error.HTTPError as e:
            if e.code == 304 and self.cached is not None:
                return self.cached
            if e.code == 429:
                raise RuntimeError('Alerts API rate limit 429; reduce polling frequency') from e
            raise
        if self.mode == 'oblast':
            if not isinstance(body, str) or body not in VALID:
                raise ValueError(f'Unexpected IoT payload (do not publish): {repr(body)[:100]}')
            snapshot = {OBLAST_UID: (OBLAST_NAME, body)}
        elif self.mode == 'raions':
            snapshot = normalize_raions(body)
        else:
            if not isinstance(body, dict) or not isinstance(body.get('alerts'), list):
                raise ValueError('Unexpected active alerts payload (do not publish)')
            snapshot = normalize_alerts(body, mode='all')
        self.cached = snapshot
        return snapshot


def member_mentions(store, tg, group_id):
    users = dict(store.subscribers())
    try:
        for obj in tg.call('getChatAdministrators', {'chat_id': group_id}):
            person = obj.get('user') or {}
            if person.get('is_bot'):
                continue
            if 'id' in person:
                users[int(person['id'])] = person.get('first_name') or 'Адмін'
    except Exception as exc:
        LOG.warning('Cannot get chat admins, using subscribers: %s', exc)
    # Group @all is not supported by Bot API. Mention registered members/admins by ID.
    return ' '.join(f'<a href="tg://user?id={uid}">{html.escape(name)}</a>' for uid, name in users.items())


def should_ping(previous, current):
    """Ping on an alert start or a yellow-to-red escalation.

    Never ping on an all-clear, downgrade or unchanged alert.
    """
    return (previous == 'N' and current in ('Y', 'R', 'P')) or (previous == 'Y' and current == 'R')


def send_pending(store, tg, channel_id, group_id, mode):
    for row in store.pending():
        event_id, uid, label, previous, current, when, channel_done, group_done = row
        body = compose(label, previous, current, when, mode)
        if not channel_done:
            try:
                # Telegram Bot API HTML parse mode is enabled in Telegram.send.
                # Bold the entire public-channel notice, but not the admin-group ping list.
                tg.send(channel_id, f'<b>{body}</b>')
                store.done(event_id, 'channel_done')
            except Exception as exc:
                LOG.exception('Channel post failed; will retry: %s', exc)
        if not group_done:
            try:
                ping = should_ping(previous, current)
                if ping:
                    mentions = member_mentions(store, tg, group_id)
                    extra = ('\n' + mentions) if mentions else ''
                else:
                    extra = ''
                tg.send(group_id, body + extra, notify=ping)
                store.done(event_id, 'group_done')
            except Exception as exc:
                LOG.exception('Admin group post failed; will retry: %s', exc)


def admin_command_loop(store, tg, group_id, status):
    offset = None
    while True:
        try:
            args = {'timeout': 25, 'allowed_updates': ['message']}
            if offset is not None:
                args['offset'] = offset
            updates = tg.call('getUpdates', args, timeout=37)
            for update in updates:
                offset = update['update_id'] + 1
                msg = update.get('message') or {}
                chat = msg.get('chat') or {}
                text = (msg.get('text') or '').split()
                if not text or not text[0].startswith('/'):
                    continue
                command = text[0].lower().split('@')[0]
                if command in ('/chatid', '/subscribe', '/unsubscribe', '/status', '/test', '/help', '/start'):
                    LOG.info('Telegram command received: %s; chat_id=%s; configured_admin=%s',
                             command, chat.get('id'), group_id)
                if command == '/chatid':
                    tg.send(chat['id'], f'ID цієї групи: <code>{chat["id"]}</code>')
                    continue
                if str(chat.get('id')) != str(group_id):
                    if command == '/test' and chat.get('type') in ('group', 'supergroup'):
                        tg.send(chat['id'], '⚠️ Ця група не збігається з ADMIN_GROUP_ID. Надішліть /chatid та перевірте ID у Railway.', notify=False)
                    continue
                user = msg.get('from') or {}
                uid = user.get('id')
                if not uid or user.get('is_bot'):
                    continue
                name = user.get('first_name') or 'Учасник'
                if command == '/subscribe':
                    store.subscribe(uid, name)
                    tg.send(group_id, f'✅ {html.escape(name)}, сповіщення для вас увімкнено.')
                elif command == '/unsubscribe':
                    store.unsubscribe(uid)
                    tg.send(group_id, f'✅ {html.escape(name)}, персональні згадки вимкнено.')
                elif command == '/status':
                    states = store.latest()
                    statuses = ', '.join(f'{html.escape(label)}: {s}' for label, s in states) or 'ще немає даних'
                    tg.send(group_id, f'📡 <b>Стан бота</b>\n{statuses}\nОстання успішна перевірка: {html.escape(status["last_ok"])}')
                elif command == '/test':
                    tg.send(group_id, '🧪 <b>ТЕСТ</b>\nБот може писати в адмінгрупу. Це НЕ повідомлення про реальну тривогу.')
                elif command in ('/help', '/start'):
                    tg.send(group_id, 'Команди: /subscribe, /unsubscribe, /status, /test, /chatid, /help')
        except Exception as exc:
            LOG.exception('Telegram command receiver failed: %s', exc)
            time.sleep(5)


def verify_admin_group(store, tg, group_id):
    """Probe the configured group once without posting any alert to the channel."""
    try:
        chat = tg.call('getChat', {'chat_id': group_id})
        resolved = str(chat.get('id', ''))
        kind = chat.get('type', '')
        LOG.info('Admin group check: configured=%s resolved=%s type=%s title=%r',
                 group_id, resolved, kind, chat.get('title', ''))
        if kind not in ('group', 'supergroup') or resolved != str(group_id):
            LOG.error('ADMIN_GROUP_ID is not the correct numeric ID of a Telegram group')
            return
        key = 'admin_group_probe_v1:' + resolved
        with store.connection() as conn:
            already_sent = conn.execute('SELECT value FROM kv WHERE key=?', (key,)).fetchone()
        if not already_sent:
            tg.send(group_id,
                    '🧪 <b>ДІАГНОСТИКА БОТА</b>\nЦе одноразове тестове повідомлення в адмінгрупу. Моніторинг тривог запущено.\nКоманди: /test, /status, /subscribe, /chatid.',
                    notify=False)
            with store.connection() as conn:
                conn.execute('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)', (key, 'sent'))
            LOG.info('Diagnostic Telegram message sent successfully to configured admin group')
    except Exception as exc:
        LOG.exception('Admin group diagnostic failed: %s', exc)


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    token = setting('TELEGRAM_BOT_TOKEN')
    api = setting('ALERTS_API_TOKEN')
    channel = setting('CHANNEL_ID', '@cherkasy_tut')
    group = setting('ADMIN_GROUP_ID')
    mode = setting('MONITOR_MODE', 'raions')
    interval = max(10.0, float(setting('POLL_SECONDS', '12')))
    if mode not in ('oblast', 'raions', 'all'):
        sys.exit('MONITOR_MODE must be oblast, raions or all')
    if not all((token, api, channel, group)):
        sys.exit('Missing TELEGRAM_BOT_TOKEN, ALERTS_API_TOKEN, CHANNEL_ID or ADMIN_GROUP_ID. See README.md')
    db = Storage(setting('DB_PATH', './data/alerts.sqlite3'))
    tg = Telegram(token)
    verify_admin_group(db, tg, group)
    source = AlertsSource(api, mode)
    status = {'last_ok': 'ще не було'}
    thread = threading.Thread(target=admin_command_loop, args=(db, tg, group, status), daemon=True)
    thread.start()
    LOG.info('Starting alerts bot: %s, %ss, channel=%s', mode, interval, channel)
    while True:
        start = time.monotonic()
        try:
            snapshot = source.get()
            # Successful API response only; failures never count as an all-clear.
            status['last_ok'] = now_local()
            db.apply_snapshot(snapshot, mode)
            send_pending(db, tg, channel, group, mode)
        except Exception as exc:
            LOG.exception('Alerts loop error (no state changes published): %s', exc)
        time.sleep(max(0.1, interval - (time.monotonic() - start)))


if __name__ == '__main__':
    main()
