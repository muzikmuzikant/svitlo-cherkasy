import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.update_data import (parse_article,parse_news_links,compose,extract_city_streets,parse_pdf_links,normalize)

Q=[f'{i}.{j}' for i in range(1,7) for j in (1,2)]

def html(date='10 жовтня',ts='09.10.2026 20:10',ranges=None):
    ranges=ranges or {q:'08:00 - 10:00, 20:00 - 22:00' for q in Q}
    return '<html><body><span>'+ts+'</span><h1>Графік погодинних відключень (ГПВ) на '+date+'</h1><div>Години відсутності електропостачання:</div>' + ''.join(f'<p>{q} {ranges[q]}</p>' for q in ranges)+'<p>Свою чергу можна дізнатися в чат-ботах</p></body></html>'

def test_article_full_and_date():
    r=parse_article(html(),'https://www.cherkasyoblenergo.com/media/ok',None)
    assert r['date']=='2026-10-10'
    assert r['publishedAt']=='2026-10-09T20:10+03:00'
    assert len(r['queues'])==12
    assert r['queues']['1.1']==[(480,600),(1200,1320)]

def test_partial_article_rejected():
    r=parse_article(html(ranges={q:'08:00 - 10:00' for q in Q[:-1]}),'https://www.cherkasyoblenergo.com/media/ok',None)
    assert r is None

def test_invalid_intervals_rejected():
    ranges={q:'08:00 - 10:00' for q in Q};ranges['3.1']='18:30 - 18:00'
    assert parse_article(html(ranges=ranges),'https://www.cherkasyoblenergo.com/media/ok',None) is None

def test_revisions_do_not_rewrite_past():
    first=parse_article(html('9 жовтня','08.10.2026 20:59',ranges={q:'05:00 - 07:00, 19:00 - 21:00' for q in Q}), 'https://www.cherkasyoblenergo.com/media/a',None)
    second=parse_article(html('9 жовтня','09.10.2026 16:29',ranges={q:'18:30 - 20:30' for q in Q}), 'https://www.cherkasyoblenergo.com/media/b',None)
    new=compose([first,second]);assert new['queues']['2.1']['off']==[['05:00','07:00'],['18:30','20:30']]
    assert new['queues']['2.1']['knownFrom']=='00:00'

def test_day_unknown_before_first_publication():
    v=parse_article(html('9 жовтня','09.10.2026 16:29'),'https://www.cherkasyoblenergo.com/media/ok',None)
    o=compose([v]);assert o['queues']['1.1']['knownFrom']=='16:29'

def test_extract_explicit_city_address_only():
    s='вул. Берегова 1а, 1А, 4, 5, 12, вул. Благовісна 436, 442, 547, б-р. Шевченка 411'
    matches=extract_city_streets(s)
    assert ('вулиця','берегова','12','Берегова') in matches
    assert ('вулиця','благовісна','442','Благовісна') in matches
    assert ('бульвар','шевченка','411','Шевченка') in matches
    assert not any(q[2]=='999' for q in matches)

def test_news_discovery():
    raw='<a href="/media/updated-day">Оновлено графік погодинних відключень на 9 жовтня</a><a href="/other">Графік погодинних відключень</a>'
    assert parse_news_links(raw)==['https://www.cherkasyoblenergo.com/media/updated-day']

def test_pdf_discovery():
    raw=''.join('<a href="/files/'+str(i)+'.pdf">PDF</a>' for i in range(12))
    assert len(parse_pdf_links(raw))==12
