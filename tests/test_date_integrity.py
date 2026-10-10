from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import pytest
from scripts.update_data import check_schedule_date, ScheduleDateConflict, parse_article, update_schedules
TZ=ZoneInfo('Europe/Kyiv')

def news(date, stamp):
    return f'''<html><h1>Графік погодинних відключень на {date}</h1><p>{stamp}</p>
    <p>Години відсутності електропостачання:</p><p>1.1 10:00 - 12:00</p><p>Свою чергу</p></html>'''

def test_typo_july_october_is_quarantined():
    with pytest.raises(ScheduleDateConflict) as caught:
        parse_article(news('8 липня','08.10.2026 09:10'),'https://www.cherkasyoblenergo.com/media/typo')
    assert caught.value.headline_date=='2026-07-08'
    assert caught.value.published_at.startswith('2026-10-08')

def test_same_day_and_next_day_are_accepted():
    assert parse_article(news('8 жовтня','08.10.2026 09:10'),'https://www.cherkasyoblenergo.com/media/a')['date']=='2026-10-08'
    assert parse_article(news('9 жовтня','08.10.2026 20:10'),'https://www.cherkasyoblenergo.com/media/b')['date']=='2026-10-09'

def test_old_historical_typo_fails_even_if_day_looks_valid():
    with pytest.raises(ScheduleDateConflict):
        check_schedule_date('2026-08-08',datetime(2026,10,8,12,tzinfo=TZ),'https://www.cherkasyoblenergo.com/media/suspect')

def test_reject_does_not_replace_existing_verified_schedule(monkeypatch,tmp_path):
    import json
    from scripts import update_data as importer
    data=tmp_path/'data';data.mkdir()
    (data/'schedules.json').write_text(json.dumps({'days':[{'date':'2026-10-08','publishedAt':'2026-10-08T07:00:00+03:00','verified':True,'source':'https://www.cherkasyoblenergo.com/media/known','queues':{}}],'changes':[]}),encoding='utf8')
    monkeypatch.setattr(importer,'DATA',data)
    monkeypatch.setattr(importer,'fetch',lambda sess,url: '<a href="/media/typo">Графік погодинних відключень</a>' if '/news?' in url else news('8 липня','08.10.2026 09:10'))
    result=update_schedules(object(),now=datetime(2026,10,8,12,tzinfo=TZ))
    assert result['days'][0]['source'].endswith('/known')
    review=json.loads((data/'source_review.json').read_text('utf8'))
    assert review['rejectedCount']==1
    assert review['items'][0]['code']=='HEADLINE_DATE_CONFLICT'
