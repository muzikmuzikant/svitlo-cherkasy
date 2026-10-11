"""Regressions around official revisions, source certainty, and address imports."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo
import pytest
from scripts import update_data as u

TZ=ZoneInfo('Europe/Kyiv')
URL='https://www.cherkasyoblenergo.com/media/grafik'
def html(hours='з 14:00 до 16:00', stamp='11.10.2026 19:42'):
    return (f'<html><body>{stamp}<h1>Графік погодинних відключень (ГПВ) на 12 жовтня</h1>'
            f'<p>Години відсутності електропостачання:</p><p>5.2. {hours}</p>'
            '<p>Свою чергу</p></body></html>')

def test_article_accepts_operator_time_spelling_while_not_guessing_missing_queues():
    rev=u.parse_article(html(),URL)
    assert rev['queues']=={'5.2':[(840,960)]}
    day=u.compose([rev]);assert day['queues']['1.1']['off']==[]
    assert day['queues']['5.2']['off']==[['14:00','16:00']]

def test_first_link_wins_when_two_updates_have_same_timestamp():
    first=u.parse_article(html('14:00 - 16:00'), URL+'-new')
    second=u.parse_article(html('13:00 - 15:00'), URL+'-old')
    latest=u.compose([first,second])
    assert latest['source']==URL+'-new'
    assert latest['queues']['5.2']['off']==[['14:00','16:00']]

def test_failed_article_disallows_claim_no_schedule(monkeypatch,tmp_path):
    monkeypatch.setattr(u,'DATA',tmp_path)
    news='<html><head><title>Новини</title></head><body><a href="/media/new">Графік погодинних відключень на 12 жовтня</a></body></html>'
    monkeypatch.setattr(u,'fetch',lambda session,url:news if '/news?' in url else '<body>Unexpected markup</body>')
    got=u.update_schedules(None,now=datetime(2026,10,11,21,tzinfo=TZ))
    assert got['reviewPending'] is True
    assert '2026-10-12' not in got['confirmedNoScheduleDates']

def test_no_article_confirms_unannounced_plan(monkeypatch,tmp_path):
    monkeypatch.setattr(u,'DATA',tmp_path)
    news='<html><head><title>Новини</title></head><body><a href="/media/other">Новина оператора</a></body></html>'
    monkeypatch.setattr(u,'fetch',lambda session,url:news)
    got=u.update_schedules(None,now=datetime(2026,10,11,21,tzinfo=TZ))
    assert got['confirmedNoScheduleDates']==['2026-10-11','2026-10-12']


def test_quarantined_future_timestamp_preserves_verified_data(monkeypatch,tmp_path):
    monkeypatch.setattr(u,'DATA',tmp_path)
    news='<html><head><title>Новини</title></head><body><a href="/media/new">Графік погодинних відключень на 12 жовтня</a></body></html>'
    monkeypatch.setattr(u,'fetch',lambda session,url:news if '/news?' in url else html(stamp='11.08.2026 19:42'))
    got=u.update_schedules(None,now=datetime(2026,10,11,21,tzinfo=TZ))
    assert got['reviewPending']
    assert got['confirmedNoScheduleDates']==[]
