from datetime import datetime
from zoneinfo import ZoneInfo
from scripts.update_data import emergency_link_candidates, parse_emergency_article, parse_official_telegram_emergency
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


def _telegram(post_id, text, iso='2026-10-10T07:20:00+00:00', forwarded=False):
    return ('<div class="tgme_widget_message" data-post="pat_cherkasyoblenergo/'+post_id+'">'
            + ('<span class="tgme_widget_message_forwarded_from">Forwarded</span>' if forwarded else '')
            + '<div class="tgme_widget_message_text">'+text+'</div>'
            + '<time datetime="'+iso+'"></time></div>')


def test_gav_genitive_plural_is_recognized_as_active():
    event=parse_emergency_article(
        page('Застосовані графіки аварійних відключень (ГАВ)'),
        'https://www.cherkasyoblenergo.com/media/gav',NOW)
    assert event['status']=='active'


def test_official_telegram_reports_gav_without_hourly_slots():
    html=_telegram('975','За командою Укренерго застосовані графіки аварійних відключень (ГАВ).')
    events=parse_official_telegram_emergency(html,NOW)
    assert len(events)==1
    assert events[0]['status']=='active'
    assert events[0]['queues']==[]
    assert events[0]['source']=='https://t.me/pat_cherkasyoblenergo/975'


def test_telegram_gav_end_cannot_be_classified_active():
    html=_telegram('976','З 10:20 скасовано графіки аварійних відключень (ГАВ).')
    events=parse_official_telegram_emergency(html,NOW)
    assert len(events)==1 and events[0]['status']=='ended'


def test_no_unverified_or_old_or_forwarded_emergency_notifications():
    html=''.join([
       _telegram('950','Що таке ГАВ та графіки аварійних відключень?'),
       _telegram('951','Застосовані графіки погодинних відключень (ГПВ).'),
       _telegram('952','Застосовані графіки обмеження потужності (ГОП).'),
       _telegram('953','Застосовані графіки аварійних відключень.',iso='2026-10-01T07:20:00+00:00'),
       _telegram('954','Застосовані графіки аварійних відключень.',forwarded=True),
       '<div class="tgme_widget_message" data-post="other_channel/998">'
       '<div class="tgme_widget_message_text">Застосовані графіки аварійних відключень.</div>'
       '<time datetime="2026-10-10T07:20:00+00:00"></time></div>'
    ])
    assert parse_official_telegram_emergency(html,NOW)==[]
