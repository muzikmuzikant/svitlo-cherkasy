"""Beta: published weekday forecasts persist until Sunday 23:59 Kyiv time."""
from datetime import datetime
from zoneinfo import ZoneInfo

from scripts import update_data as source

TZ = ZoneInfo("Europe/Kyiv")
NEWS = '<html><head><title>Новини Черкасиобленерго</title></head><body><a href="/media/notice">Оголошення</a></body></html>'


def test_old_weekdays_remain_until_sunday_then_expire_on_monday(monkeypatch, tmp_path):
    monkeypatch.setattr(source, 'DATA', tmp_path)
    monkeypatch.setattr(source, 'fetch', lambda _session, _url: NEWS)
    monday = datetime(2026, 10, 12, 10, 0, tzinfo=TZ)
    initial = source.update_schedules(None, now=monday)
    initial['days'] = [
        {'date': '2026-10-12', 'verified': True, 'source': 'https://www.cherkasyoblenergo.com/media/official',
         'publishedAt': '2026-10-12T08:00+03:00', 'queues': {
             '1.1': {'knownFrom': '00:00', 'off': [['10:00', '12:00']]}}},
        {'date': '2026-10-15', 'verified': True, 'source': 'https://www.cherkasyoblenergo.com/media/official2',
         'publishedAt': '2026-10-15T10:00+03:00', 'queues': {
             '1.1': {'knownFrom': '00:00', 'off': [['18:00', '20:00']]}}},
    ]
    source.atomic_write(tmp_path / 'schedules.json', initial)

    sunday = source.update_schedules(None, now=datetime(2026, 10, 18, 23, 59, tzinfo=TZ))
    assert [x['date'] for x in sunday['days']] == ['2026-10-12', '2026-10-15']
    assert sunday['days'][0]['queues']['1.1']['off'] == [['10:00', '12:00']]

    new_week = source.update_schedules(None, now=datetime(2026, 10, 19, 0, 0, tzinfo=TZ))
    assert new_week['days'] == []
    assert '2026-10-19' in new_week['confirmedNoScheduleDates']
