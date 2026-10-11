"""Regression tests for the 12 October 2026 publication and partial failures."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo
import requests
from scripts import update_data as importer

TZ = ZoneInfo('Europe/Kyiv')
OFFICIAL_12 = '''<html><title>АТ «Черкасиобленерго»</title><body>
<div>11.10.2026 19:42</div><h1>Графік погодинних відключень (ГПВ) на 12 жовтня</h1>
<p>Години відсутності електропостачання:</p>
<p>1.1 06:00 - 08:00, 16:00 - 18:00</p>
<p>1.2 08:00 - 10:00, 16:00 - 18:00</p>
<p>2.1 08:00 - 10:00, 20:00 - 22:00</p>
<p>2.2 16:00 - 18:00</p>
<p>3.1 15:00 - 16:00, 20:00 - 22:00</p>
<p>3.2 10:00 - 12:00, 18:00 - 20:00</p>
<p>4.1 10:00 - 12:00</p>
<p>4.2 14:00 - 16:00, 22:00 - 24:00</p>
<p>5.1 12:00 - 14:00, 18:00 - 20:00</p>
<p>5.2 12:00 - 14:00, 18:00 - 20:00</p>
<p>6.1 20:00 - 22:00</p>
<p>6.2 14:00 - 16:00, 22:00 - 24:00</p>
<p>Свою чергу/підчергу</p></body></html>'''
NEWS = '''<html><head><title>Новини — Черкасиобленерго</title></head><body>
<a href="/media/hrafik-pohodynnykh-vidklyuchen-hpv-na-12-zhovtnya">Графік погодинних відключень (ГПВ) на 12 жовтня</a>
<a href="/media/hrafik-pohodynnykh-vidklyuchen-hpv-na-9-zhovtnya">Графік погодинних відключень (ГПВ) на 9 жовтня</a>
</body></html>'''

def test_official_12_october_queue_times_are_parsed():
    parsed = importer.parse_article(OFFICIAL_12, 'https://www.cherkasyoblenergo.com/media/hrafik-pohodynnykh-vidklyuchen-hpv-na-12-zhovtnya')
    assert parsed['date'] == '2026-10-12'
    assert parsed['publishedAt'] == '2026-10-11T19:42+03:00'
    assert len(parsed['queues']) == 12
    assert parsed['queues']['1.1'] == [(360, 480), (960, 1080)]
    assert parsed['queues']['6.2'] == [(840, 960), (1320, 1440)]


def test_old_broken_article_does_not_block_tomorrows_new_graph(monkeypatch,tmp_path):
    monkeypatch.setattr(importer, 'DATA', tmp_path)
    def fake_fetch(session, url):
        if '/news?' in url: return NEWS
        if '12-zhovtnya' in url: return OFFICIAL_12
        raise requests.RequestException('Old article temporarily unavailable')
    monkeypatch.setattr(importer, 'fetch', fake_fetch)
    result = importer.update_schedules(None, now=datetime(2026, 10, 11, 20, 17, tzinfo=TZ))
    day = next(d for d in result['days'] if d['date'] == '2026-10-12')
    assert day['verified'] is True
    assert day['queues']['1.1']['off'] == [['06:00','08:00'],['16:00','18:00']]
    assert result['reviewPending'] is False  # only an older 9 Oct article failed
    persisted = json.loads((tmp_path/'schedules.json').read_text('utf8'))
    assert '2026-10-12' in [d['date'] for d in persisted['days']]
    review = json.loads((tmp_path/'source_review.json').read_text('utf8'))
    assert review['warningCount'] == 1


def test_missing_schedule_remains_unconfirmed_if_an_article_fails(monkeypatch,tmp_path):
    monkeypatch.setattr(importer, 'DATA', tmp_path)
    monkeypatch.setattr(importer, 'fetch', lambda sess,url: NEWS if '/news?' in url else '<html><body>Site blocked</body></html>')
    result = importer.update_schedules(None, now=datetime(2026,10,11,20,17,tzinfo=TZ))
    assert result['reviewPending'] is True
    assert '2026-10-12' not in [d['date'] for d in result['days']]


def test_unreadable_index_preserves_previous_data(monkeypatch,tmp_path):
    monkeypatch.setattr(importer,'DATA',tmp_path)
    previous={'days':[{'date':'2026-10-11','verified':True,'queues':{}}]}
    (tmp_path/'schedules.json').write_text(json.dumps(previous))
    monkeypatch.setattr(importer,'fetch',lambda sess,url:'<html><body>Wrong site</body></html>')
    import pytest
    with pytest.raises(RuntimeError,match='Unrecognized'):
        importer.update_schedules(None,now=datetime(2026,10,11,20,17,tzinfo=TZ))
    assert json.loads((tmp_path/'schedules.json').read_text())==previous
