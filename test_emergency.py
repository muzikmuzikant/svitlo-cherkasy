from datetime import datetime
from zoneinfo import ZoneInfo
from scripts.update_data import emergency_link_candidates, parse_emergency_article
TZ=ZoneInfo('Europe/Kyiv')
NOW=datetime(2026,10,10,10,30,tzinfo=TZ)


def page(title,date='10.10.2026 09:30'):
    return '<html><h1>'+title+'</h1><div>'+date+'</div></html>'


def test_detect_explicit_emergency():
    obj=parse_emergency_article(page('Запроваджено екстрені відключення'),'https://www.cherkasyoblenergo.com/media/one',NOW)
    assert obj['status']=='active'
    assert obj['source'].startswith('https://www.cherkasyoblenergo.com/')


def test_cancellation_is_not_active():
    obj=parse_emergency_article(page('Скасовано аварійні відключення'),'https://www.cherkasyoblenergo.com/media/two',NOW)
    assert obj['status']=='ended'


def test_unconfirmed_is_notice():
    obj=parse_emergency_article(page('Аварійні відключення: інформація'),'https://www.cherkasyoblenergo.com/media/three',NOW)
    assert obj['status']=='notice'


def test_reject_expired_and_unrelated():
    assert parse_emergency_article(page('Звичайний графік відключень'),'https://www.cherkasyoblenergo.com/media/x',NOW) is None
    assert parse_emergency_article(page('Запроваджено екстрені відключення','01.10.2026 09:30'),'https://www.cherkasyoblenergo.com/media/old',NOW) is None


def test_only_official_links():
    html='<a href="/media/emergency">Запроваджено екстрені відключення</a><a href="https://evil.example/media/foo">Введено аварійні відключення</a>'
    assert emergency_link_candidates(html)==['https://www.cherkasyoblenergo.com/media/emergency']
