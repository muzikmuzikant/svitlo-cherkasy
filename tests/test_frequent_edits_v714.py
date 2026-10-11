"""Frequent official revisions can retain exactly the same publication minute."""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from scripts import update_data as importer

TZ = ZoneInfo('Europe/Kyiv')
URL = 'https://www.cherkasyoblenergo.com/media/hrafik-pohodynnykh-vidklyuchen-hpv-na-12-zhovtnya'
NEWS = f'<html><title>Новини Черкасиобленерго</title><body><a href="{URL}">Графік погодинних відключень на 12 жовтня</a></body></html>'

def article(queues):
    rows=''.join(f'<p>{queue} {hours}</p>' for queue,hours in queues.items())
    return ('<html><body><span>11.10.2026 19:42</span>'
            '<h1>Графік погодинних відключень (ГПВ) на 12 жовтня</h1>'
            '<div>Години відсутності електропостачання:</div>' + rows +
            '<p>Свою чергу</p></body></html>')


def test_identical_publication_timestamp_still_updates_official_hours(monkeypatch,tmp_path):
    monkeypatch.setattr(importer, 'DATA', tmp_path)
    state={'html':article({'1.1':'06:00 - 08:00', '2.2':'16:00 - 18:00'})}
    monkeypatch.setattr(importer, 'fetch', lambda _session,u: NEWS if '/news?' in u else state['html'])
    now=datetime(2026,10,11,19,50,tzinfo=TZ)
    first=importer.update_schedules(None,now=now)
    day1=first['days'][0]
    assert day1['queues']['1.1']['off']==[['06:00','08:00']]
    assert day1['queues']['1.2']['off']==[]
    assert day1['queues']['2.2']['off']==[['16:00','18:00']]
    assert first['changes']==[]

    # Same date, timestamp and URL: operator changed actual schedule.
    state['html']=article({'1.1':'07:00 - 09:00'})
    second=importer.update_schedules(None,now=now+timedelta(minutes=5))
    day2=second['days'][0]
    assert day2['publishedAt']==day1['publishedAt']
    assert day2['source']==day1['source']
    assert day2['planFingerprint']!=day1['planFingerprint']
    assert day2['queues']['1.1']['off']==[['07:00','09:00']]
    assert day2['queues']['2.2']['off']==[]  # omitted now => no outages
    assert day2['queues']['3.1']['off']==[]
    assert len(second['changes'])==1
    change=second['changes'][0]
    assert sorted(change['queues'])==['1.1','2.2']
    assert change['detectedAt'].startswith('2026-10-11T19:55')
    assert change['revisionId']==day2['planFingerprint']

    # No extra duplicate notification when repeated polling sees same hours.
    third=importer.update_schedules(None,now=now+timedelta(minutes=10))
    assert third['changes']==second['changes']
    assert third['days'][0]==day2

    # And yet another change under the exact same publication timestamp.
    state['html']=article({'1.1':'08:00 - 10:00', '2.2':'18:00 - 20:00'})
    fourth=importer.update_schedules(None,now=now+timedelta(minutes=15))
    assert len(fourth['changes'])==2
    assert fourth['changes'][-1]['revisionId']!=fourth['changes'][-2]['revisionId']
    assert fourth['days'][0]['queues']['2.2']['off']==[['18:00','20:00']]


def test_no_publication_means_no_planned_outages_but_offline_does_not(monkeypatch,tmp_path):
    monkeypatch.setattr(importer, 'DATA', tmp_path)
    valid='<html><head><title>Новини Черкасиобленерго</title></head><body><a href="/media/hello">Новини</a></body></html>'
    monkeypatch.setattr(importer,'fetch',lambda _session,u: valid)
    result=importer.update_schedules(None,now=datetime(2026,10,11,20,tzinfo=TZ))
    assert result['days']==[]
    assert result['reviewPending'] is False
    before=(tmp_path/'schedules.json').read_text(encoding='utf-8')
    monkeypatch.setattr(importer,'fetch',lambda _session,u: '<html>blocked</html>')
    import pytest
    with pytest.raises(RuntimeError):
        importer.update_schedules(None,now=datetime(2026,10,11,20,5,tzinfo=TZ))
    assert (tmp_path/'schedules.json').read_text(encoding='utf-8')==before


def test_stable_hash_ignores_cosmetic_html_changes():
    a=importer.parse_article(article({'2.2':'16:00 - 18:00'}),URL)
    b=importer.parse_article(article({'2.2':'16:00 - 18:00'}).replace('<p>','<p class="notice">'),URL)
    assert importer.compose([a])['planFingerprint']==importer.compose([b])['planFingerprint']
