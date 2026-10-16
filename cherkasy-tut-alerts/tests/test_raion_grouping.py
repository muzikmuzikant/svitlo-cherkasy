import os
import tempfile
import unittest
from bot import Storage, normalize_raions, compose, should_ping

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
            self.assertFalse(should_ping(escalation[3], escalation[4]))
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
            self.assertEqual(store.apply_snapshot(statuses({'150':'Y', '151':'R', '152':'P', '153':'Y'}), 'raions'), 4)
            self.assertEqual({event[1] for event in store.pending()}, set(RAIONS))

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
