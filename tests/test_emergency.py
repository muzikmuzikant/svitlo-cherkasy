from datetime import datetime
from zoneinfo import ZoneInfo
import scripts.update_data as importer
from scripts.update_data import emergency_link_candidates, parse_emergency_article, update_emergency
TZ=ZoneInfo('Europe/Kyiv')
NOW=datetime(2026,10,10,10,30,tzinfo=TZ)


def page(title,date='10.10.2026 09:30'):
    return '<html><h1>'+title+'</h1><div>'+date+'</div></html>'


def test_gav_article_with_single_digit_hour_is_detected():
    now=datetime(2026,11,2,9,0,tzinfo=TZ)
    obj=parse_emergency_article(
        page('По Черкаській області застосовані графіки аварійних відключень (ГАВ)','02.11.2026 8:55'),
        'https://www.cherkasyoblenergo.com/media/po-cherkaskiy-oblasti-zastosovani-hrafiky-avariynykh-vidklyuchen-hav?lang=uk',
        now
    )
    assert obj['status']=='active'
    assert obj['publishedAt'].endswith('08:55+02:00')


def test_gav_article_with_split_clock_markup_is_detected():
    now=datetime(2026,11,2,9,0,tzinfo=TZ)
    html=('<html><h1>По Черкаській області застосовані графіки аварійних відключень (ГАВ)</h1>'
          '<div>02.11.2026 <span>8</span> <span>:</span> <span>55</span></div></html>')
    obj=parse_emergency_article(html,
        'https://www.cherkasyoblenergo.com/media/po-cherkaskiy-oblasti-zastosovani-hrafiky-avariynykh-vidklyuchen-hav?lang=uk',
        now)
    assert obj['status']=='active'
    assert obj['publishedAt'].endswith('08:55+02:00')


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


def test_singular_emergency_headline_is_detected():
    obj=parse_emergency_article(page('Аварійне відключення електроенергії'),'https://www.cherkasyoblenergo.com/media/singular',NOW)
    assert obj['status']=='notice'


def test_reject_expired_and_unrelated():
    assert parse_emergency_article(page('Звичайний графік відключень'),'https://www.cherkasyoblenergo.com/media/x',NOW) is None
    assert parse_emergency_article(page('Запроваджено екстрені відключення','01.10.2026 09:30'),'https://www.cherkasyoblenergo.com/media/old',NOW) is None


def test_only_official_links():
    html='<a href="/media/emergency">Запроваджено екстрені відключення</a><a href="/media/ordinary">Новина про електропостачання</a><a href="https://evil.example/media/foo">Введено аварійні відключення</a>'
    assert emergency_link_candidates(html)==['https://www.cherkasyoblenergo.com/media/emergency','https://www.cherkasyoblenergo.com/media/ordinary']



def test_update_emergency_reads_current_media_center(monkeypatch, tmp_path):
    monkeypatch.setattr(importer, 'DATA', tmp_path)
    requested = []
    listing = '<a href="/media/emergency">Оперативна інформація</a>'

    def fake_fetch(session, url, binary=False):
        requested.append(url)
        if url == 'https://www.cherkasyoblenergo.com/media':
            return listing
        return page('Запроваджено аварійні відключення')

    monkeypatch.setattr(importer, 'fetch', fake_fetch)
    result = update_emergency(object(), NOW)

    assert requested[0] == 'https://www.cherkasyoblenergo.com/media'
    assert result['source'] == 'https://www.cherkasyoblenergo.com/media'
    assert len(result['events']) == 1



def test_emergency_schedule_headline_with_graphiky_is_detected():
    obj=parse_emergency_article(
        page('По Черкаській області застосовані графіки аварійних відключень (ГАВ)'),
        'https://www.cherkasyoblenergo.com/media/news-4358',
        NOW
    )
    assert obj['status']=='active'
