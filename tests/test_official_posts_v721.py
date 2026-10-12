"""Date-specific official post handling, including revised post text."""
from datetime import datetime
from zoneinfo import ZoneInfo
from scripts import update_data as u

TZ=ZoneInfo('Europe/Kyiv')
BASE='https://www.cherkasyoblenergo.com/media/'

def article(heading, intro, periods='1.1 16:00 - 18:00 1.2 08:00 - 10:00 2.1 20:00 - 22:00',stamp='12.10.2026 09:58'):
    return (f'<html><body>{stamp}<h1>{heading}</h1><section>{intro}</section>'
            f'<div>{periods}</div><p>Свою чергу можна дізнатися</p></body></html>')

def test_new_official_revision_without_fixed_marker():
    txt=article('Оновлено графік погодинних відключень (ГПВ) на 12 жовтня',
                'Новий розклад за підчергами:')
    r=u.parse_article(txt, BASE+'onovleno-na-12-zhovtnya')
    assert r is not None
    assert r['queues']['1.1']==[(960,1080)]
    assert r['queues']['2.1']==[(1200,1320)]

def test_latest_separate_official_post_wins_at_same_minute():
    new=u.parse_article(article('Оновлено графік погодинних відключень на 12 жовтня', 'Години відключень:'),BASE+'new')
    old=u.parse_article(article('Графік погодинних відключень на 12 жовтня', 'Години відсутності електропостачання:',
                                '1.1 06:00 - 08:00 1.2 08:00 - 10:00 2.1 20:00 - 22:00'),BASE+'old')
    latest=u.compose([new,old]);assert latest['source']==BASE+'new'
    assert latest['queues']['1.1']['off']==[['16:00','18:00']]

def test_unreadable_today_is_date_scoped(monkeypatch,tmp_path):
    monkeypatch.setattr(u,'DATA',tmp_path)
    url=BASE+'new'
    news=f'<html><head><title>Новини</title></head><body><a href="{url}">Оновлено графік погодинних відключень на 12 жовтня</a></body></html>'
    monkeypatch.setattr(u,'fetch',lambda _s,uri: news if '/news?' in uri else '<h1>Broken post</h1>')
    got=u.update_schedules(None,now=datetime(2026,10,12,12,0,tzinfo=TZ))
    assert got['reviewPending'] is True
    assert got['unresolvedDates']==['2026-10-12']
    assert got['confirmedNoScheduleDates']==['2026-10-13']

def test_old_unreadable_post_does_not_mark_today_unverified(monkeypatch,tmp_path):
    monkeypatch.setattr(u,'DATA',tmp_path)
    url=BASE+'old'
    news=f'<html><head><title>Новини</title></head><body><a href="{url}">Графік погодинних відключень на 10 жовтня</a></body></html>'
    monkeypatch.setattr(u,'fetch',lambda _s,uri: news if '/news?' in uri else '<h1>Broken post</h1>')
    got=u.update_schedules(None,now=datetime(2026,10,12,12,0,tzinfo=TZ))
    assert got['reviewPending'] is False
    assert got['unresolvedDates']==[]
    assert got['confirmedNoScheduleDates']==['2026-10-12','2026-10-13']

def test_operator_html_splits_clock_at_inline_tag():
    # Live operator HTML can yield "08 :00" when text is flattened.
    raw=article('Оновлено графік погодинних відключень на 12 жовтня',
                'Години відсутності електропостачання:',
                '1.1 16:00 - 18:00 1.2 <span>08</span><span>:00</span> - 10:00 '
                '2.1 <span>20</span><span>:00</span> - 22:00')
    parsed=u.parse_article(raw, BASE+'real-format')
    assert parsed is not None
    assert parsed['queues']['1.2']==[(480,600)]
    assert parsed['queues']['2.1']==[(1200,1320)]
