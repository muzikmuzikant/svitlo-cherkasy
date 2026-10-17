import os
import json
from unittest import mock
import tempfile
import unittest
from bot import Storage, normalize_raions, compose, should_ping, send_pending, Telegram, send_channel_pending, send_group_pending, AlertsSource

RAIONS = ('150', '151', '152', '153')


def statuses(levels):
    value = ['N'] * 200
    for uid, status in levels.items():
        value[int(uid)] = status
    return normalize_raions(''.join(value))


class GroupingTests(unittest.TestCase):
    def test_full_oblast_start_upgrade_and_all_clear(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            blank = statuses({})
            store.apply_snapshot(blank, 'raions')
            self.assertEqual(store.apply_snapshot(statuses({uid: 'Y' for uid in RAIONS}), 'raions'), 1)
            start = store.pending()[-1]
            self.assertEqual(start[1:5], ('24', 'Уся Черкаська область', 'N', 'Y'))
            self.assertTrue(should_ping(start[3], start[4]))
            self.assertEqual(store.apply_snapshot(statuses({'24': 'R'}), 'raions'), 1)
            escalation = store.pending()[-1]
            self.assertEqual(escalation[1], '24')
            self.assertEqual((escalation[3], escalation[4]), ('Y', 'R'))
            self.assertTrue(should_ping(escalation[3], escalation[4]))
            self.assertEqual(store.apply_snapshot(blank, 'raions'), 0)
            self.assertEqual(store.apply_snapshot(blank, 'raions'), 1)
            clear = store.pending()[-1]
            self.assertEqual(clear[1], '24')
            self.assertEqual(clear[4], 'N')
            self.assertFalse(should_ping(clear[3], clear[4]))

    def test_mixed_levels_remain_individual(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            self.assertEqual(store.apply_snapshot(statuses({'150':'Y', '151':'R', '152':'P', '153':'Y'}), 'raions'), 3)
            alerts = store.pending()
            self.assertEqual({event[1] for event in alerts}, {'group:150,153','151','152'})
            self.assertEqual(next(e[2] for e in alerts if e[1]=='group:150,153'),
                             'Звенигородський та Золотоніський райони')

    def test_two_simultaneous_yellow_alerts_generate_one_message(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            self.assertEqual(store.apply_snapshot(statuses({'150':'Y','152':'Y'}), 'raions'), 1)
            event = store.pending()[0]
            self.assertEqual((event[1], event[2], event[3], event[4]),
                             ('group:150,152','Звенигородський та Черкаський райони','N','Y'))
            self.assertEqual(compose(event[2],event[3],event[4]),
                             '🟡🚨 Звенигородський та Черкаський райони — жовта тривога!')
            self.assertTrue(should_ping(event[3],event[4]))
            self.assertEqual(store.apply_snapshot(statuses({'150':'Y','152':'Y'}),'raions'),0)
            self.assertEqual(len(store.pending()),1)

    def test_three_red_districts_group_without_falsely_announcing_oblast(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({}),'raions')
            self.assertEqual(store.apply_snapshot(statuses({'150':'R','151':'R','153':'R'}),'raions'),1)
            event=store.pending()[0]
            self.assertEqual(event[1],'group:150,151,153')
            self.assertEqual(event[2],'Звенигородський, Уманський та Золотоніський райони')
            self.assertNotIn('Область',compose(event[2],event[3],event[4]))
            self.assertEqual(event[4],'R')

    def test_simultaneous_red_to_yellow_means_red_clear_not_total_clear(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({'150':'R','152':'R'}),'raions')
            self.assertEqual(store.apply_snapshot(statuses({'150':'Y','152':'Y'}),'raions'),1)
            event=store.pending()[0]
            self.assertEqual((event[1],event[3],event[4]),('group:150,152','R','Y'))
            self.assertEqual(compose(event[2],event[3],event[4]),
                             '🟡🚨 Звенигородський та Черкаський райони — Відбій червоної тривоги, жовта триває!')
            self.assertFalse(should_ping(event[3],event[4]))
            self.assertEqual(store.apply_snapshot(statuses({}),'raions'),0)
            self.assertEqual(store.apply_snapshot(statuses({}),'raions'),1)
            clear=store.pending()[-1]
            self.assertEqual(clear[1],'group:150,152')
            self.assertEqual(clear[3:5],('Y','N'))
            self.assertEqual(compose(clear[2],clear[3],clear[4]),
                             '🟢 Звенигородський та Черкаський райони — Відбій жовтої тривоги')

    def test_grouped_escalation_keeps_admin_ping(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({'151':'Y','152':'Y','153':'Y'}),'raions')
            self.assertEqual(store.apply_snapshot(statuses({'151':'R','152':'R','153':'R'}),'raions'),1)
            event=store.pending()[0]
            self.assertEqual(event[1],'group:151,152,153')
            self.assertEqual((event[3],event[4]),('Y','R'))
            self.assertTrue(should_ping(event[3],event[4]))

    def test_four_districts_still_use_single_oblast_notice(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({}),'raions')
            self.assertEqual(store.apply_snapshot(statuses({key:'R' for key in RAIONS}),'raions'),1)
            self.assertEqual(store.pending()[0][1:5],('24','Уся Черкаська область','N','R'))

    def test_updates_from_separate_snapshots_are_not_held_or_merged(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Storage(os.path.join(folder,'alerts.db'))
            store.apply_snapshot(statuses({}),'raions')
            self.assertEqual(store.apply_snapshot(statuses({'151':'Y'}),'raions'),1)
            self.assertEqual(store.apply_snapshot(statuses({'151':'Y','153':'Y'}),'raions'),1)
            self.assertEqual([event[1] for event in store.pending()],['151','153'])

    def test_admin_pings_start_and_escalation_only(self):
        self.assertTrue(should_ping('N', 'Y'))
        self.assertTrue(should_ping('N', 'R'))
        self.assertTrue(should_ping('N', 'P'))
        self.assertTrue(should_ping('Y', 'R'))
        for old, new in [('Y','N'), ('R','N'), ('R','Y'),
                         ('P','N'), ('Y','Y'), ('R','R'), ('P','Y')]:
            self.assertFalse(should_ping(old, new), (old, new))

    def test_district_escalation_keeps_separate_ping(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            store.apply_snapshot(statuses({'152': 'Y'}), 'raions')
            self.assertEqual(store.apply_snapshot(statuses({'152': 'R'}), 'raions'), 1)
            last = store.pending()[-1]
            self.assertEqual((last[1], last[3], last[4]), ('152', 'Y', 'R'))
            self.assertTrue(should_ping(last[3], last[4]))

    def test_mixed_districts_merged_to_red_still_ping(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({'150':'Y', '151':'R', '152':'R', '153':'R'}), 'raions')
            self.assertEqual(store.apply_snapshot(statuses({'24':'R'}), 'raions'), 1)
            last = store.pending()[-1]
            self.assertEqual((last[1],last[3],last[4]), ('24','Y','R'))
            self.assertTrue(should_ping(last[3], last[4]))

    def test_channel_post_bold_group_post_unchanged(self):
        class FakeStore:
            def __init__(self):
                self.completed = []
            def pending(self):
                # End-of-alert does not require fetching administrator mentions.
                return [(1, '152', 'Черкаський район', 'R', 'N', '00:00', 0, 0)]
            def done(self, event_id, destination):
                self.completed.append((event_id, destination))
            def alerts_thread_id(self):
                return 9012
        class FakeTelegram:
            def __init__(self):
                self.messages = []
            def send(self, dest, message, notify=True, thread_id=None):
                self.messages.append((dest, message, notify, thread_id))
        store, tg = FakeStore(), FakeTelegram()
        send_pending(store, tg, '@cherkasy_tut', -100123456789, 'raions')
        self.assertEqual(tg.messages, [
            ('@cherkasy_tut', '<b>🟢 Черкаський район — Відбій червоної тривоги</b>', True, None),
            (-100123456789, '🟢 Черкаський район — Відбій червоної тривоги', False, 9012),
        ])
        self.assertEqual(store.completed, [(1, 'channel_done'), (1, 'group_done')])

    def test_unbound_thread_does_not_post_to_general(self):
        class FakeStore:
            def __init__(self):
                self.completed = []
            def pending(self):
                return [(1, '152', 'Черкаський район', 'N', 'Y', '00:00', 0, 0)]
            def done(self, event_id, destination):
                self.completed.append((event_id, destination))
            def alerts_thread_id(self):
                return None
        class FakeTelegram:
            def __init__(self):
                self.messages = []
            def send(self, dest, message, notify=True, thread_id=None):
                self.messages.append((dest, thread_id))
        store, tg = FakeStore(), FakeTelegram()
        send_pending(store, tg, '@cherkasy_tut', -100123456789, 'raions')
        self.assertEqual(tg.messages, [('@cherkasy_tut', None)])
        self.assertEqual(store.completed, [(1, 'channel_done')])

    def test_topic_binding_is_persistent_and_discards_stale_group_items(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'alerts.db')
            store = Storage(path)
            store.apply_snapshot(statuses({}), 'raions')
            store.apply_snapshot(statuses({'152': 'Y'}), 'raions')
            self.assertIsNone(store.alerts_thread_id())
            self.assertEqual(len(store.pending()), 1)
            store.bind_alerts_thread(2468)
            self.assertEqual(Storage(path).alerts_thread_id(), 2468)
            pending = store.pending()
            self.assertEqual(len(pending), 1)
            self.assertEqual(pending[0][6:], (0, 1))
            with self.assertRaises(ValueError):
                store.bind_alerts_thread(1)

    def test_telegram_send_includes_thread_only_when_provided(self):
        tg = Telegram('fake-secret')
        calls = []
        def capture(method, payload, timeout=20):
            calls.append((method, payload))
            return {}
        tg.call = capture
        tg.send(-1001234, 'Тривога!', notify=True, thread_id=2468)
        self.assertEqual(calls[0][0], 'sendMessage')
        self.assertEqual(calls[0][1]['message_thread_id'], 2468)
        tg.send('@cherkasy_tut', '<b>Тривога!</b>')
        self.assertNotIn('message_thread_id', calls[1][1])

    def test_channel_sender_does_not_wait_for_admin_group_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            store.apply_snapshot(statuses({'152': 'Y'}), 'raions')
            store.bind_alerts_thread(48)
            class TelegramStub:
                def __init__(self):
                    self.calls = []
                def send(self, chat_id, message, notify=True, thread_id=None):
                    self.calls.append((chat_id, message, thread_id))
                    if isinstance(chat_id, int):
                        raise TimeoutError('Simulated slow admin destination')
                def call(self, method, data):
                    if method == 'getChatAdministrators':
                        return []
                    return {}
            tg = TelegramStub()
            self.assertTrue(send_channel_pending(store, tg, '@cherkasy_tut', 'raions'))
            self.assertEqual(len(tg.calls), 1)
            self.assertEqual(tg.calls[0][0], '@cherkasy_tut')
            self.assertTrue(tg.calls[0][1].startswith('<b>'))
            # Admin failures may happen, but must not roll back channel delivery.
            self.assertFalse(send_group_pending(store, tg, -100123456, 'raions'))
            self.assertEqual(store.pending()[0][6:], (1, 0))
            self.assertTrue(send_channel_pending(store, tg, '@cherkasy_tut', 'raions'))
            self.assertEqual(len([x for x in tg.calls if x[0] == '@cherkasy_tut']), 1)

    def test_no_group_topic_leaves_channel_independent(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            store.apply_snapshot(statuses({'150': 'R'}), 'raions')
            class TelegramStub:
                def __init__(self):
                    self.calls = []
                def send(self, chat_id, message, notify=True, thread_id=None):
                    self.calls.append((chat_id, message))
            tg = TelegramStub()
            self.assertTrue(send_channel_pending(store, tg, '@cherkasy_tut', 'raions'))
            self.assertTrue(send_group_pending(store, tg, -100123456, 'raions'))
            self.assertEqual(len(tg.calls), 1)
            self.assertEqual(store.pending()[0][6:], (1, 0))

    def test_source_does_not_request_conditional_cached_304(self):
        class FakeResponse:
            headers = {'Age': '0', 'Last-Modified': 'Wed, 14 Oct 2026 12:00:00 GMT',
                       'Date': 'Wed, 14 Oct 2026 12:00:02 GMT'}
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc, tb):
                return False
            def read(self, size=-1):
                return json.dumps(self.payload).encode('utf-8')
        sent = []
        data = ['N'] * 200
        def fake_open(request, timeout=12):
            sent.append(request)
            return FakeResponse(''.join(data))
        source = AlertsSource('redacted-test-token', 'raions')
        with mock.patch('bot.urllib.request.urlopen', side_effect=fake_open):
            self.assertEqual(source.get()['152'][1], 'N')
            data[152] = 'Y'
            self.assertEqual(source.get()['152'][1], 'Y')
        self.assertEqual(len(sent), 2)
        for req in sent:
            self.assertIsNone(req.get_header('If-modified-since'))
            self.assertIn('no-cache', req.get_header('Cache-control'))

    def test_one_district_and_short_text(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Storage(os.path.join(folder, 'alerts.db'))
            store.apply_snapshot(statuses({}), 'raions')
            self.assertEqual(store.apply_snapshot(statuses({'152':'Y'}), 'raions'), 1)
            self.assertEqual(store.pending()[-1][2], 'Черкаський район')
        self.assertEqual(compose('Черкаський район', 'N', 'Y'),
                         '🟡🚨 Черкаський район — жовта тривога!')
        self.assertEqual(compose('Уманський район', 'N', 'R'),
                         '🔴🚨 Уманський район — червона тривога!')
        self.assertEqual(compose('Уся Черкаська область', 'N', 'R'),
                         '🔴🚨 Область — червона тривога!')
        self.assertEqual(compose('Уся Черкаська область', 'N', 'Y'),
                         '🟡🚨 Область — жовта тривога!')
        self.assertEqual(compose('Уманський район', 'R', 'Y'),
                         '🟡🚨 Уманський район — Відбій червоної тривоги, жовта триває!')
        self.assertEqual(compose('Уся Черкаська область', 'R', 'Y'),
                         '🟡🚨 Область — Відбій червоної тривоги, жовта триває!')
        self.assertEqual(compose('Черкаський район', 'Y', 'N'),
                         '🟢 Черкаський район — Відбій жовтої тривоги')
        self.assertEqual(compose('Уманський район', 'R', 'N'),
                         '🟢 Уманський район — Відбій червоної тривоги')
        self.assertEqual(compose('Уся Черкаська область', 'R', 'N'),
                         '🟢 Область — Відбій червоної тривоги')
        self.assertEqual(compose('Черкаський район', 'P', 'N'),
                         '🟢 Черкаський район — Відбій тривоги')
        for previous in ('N', 'Y', 'R', 'P'):
            for current in ('Y', 'R', 'N', 'P'):
                text = compose('Звенигородський район', previous, current)
                self.assertNotIn('Джерело', text)
                self.assertNotIn('🕒', text)
                self.assertNotIn('\\n', text)
        for raion in ('Черкаський район', 'Уманський район', 'Золотоніський район', 'Звенигородський район'):
            self.assertEqual(compose(raion, 'N', 'Y'), f'🟡🚨 {raion} — жовта тривога!')


if __name__ == '__main__':
    unittest.main()
