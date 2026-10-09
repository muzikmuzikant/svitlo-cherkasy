#!/usr/bin/env python3
"""Collect published blackout schedules and high-confidence address->queue matches.
Sources: АТ «Черкасиобленерго» newsroom and current GPV PDF lists.
Designed for scheduled GitHub Actions and optional local Python server.
"""
from __future__ import annotations
import argparse
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BASE = 'https://www.cherkasyoblenergo.com'
TZ = ZoneInfo('Europe/Kyiv')
QUEUE = [f'{i}.{j}' for i in range(1, 7) for j in (1, 2)]
UA_MONTHS = {'січня':1, 'лютого':2, 'березня':3, 'квітня':4, 'травня':5,
             'червня':6, 'липня':7, 'серпня':8, 'вересня':9, 'жовтня':10,
             'листопада':11, 'грудня':12}
HEADLINE_DATE = re.compile(r'на\s+(\d{1,2})\s+(' + '|'.join(UA_MONTHS) + r')', re.I)
QUEUE_START = re.compile(r'(?<!\S)([1-6]\.[12])\s*(?=\d{1,2}:\d{2}|—|–|-)',re.U)
INTERVAL = re.compile(r'(?<!\d)([01]?\d|2[0-4]):([0-5]\d)\s*[–—−-]\s*([01]?\d|2[0-4]):([0-5]\d)')
PUB_TS = re.compile(r'(?<!\d)(\d{2}\.\d{2}\.20\d\d)\s+(\d\d:\d\d)')
PDF_LINK = re.compile(r'\.pdf(?:\?.*)?$', re.I)
LOG = logging.getLogger('svitlo')


def fetch(session, url, binary=False):
    r = session.get(url, timeout=25, headers={'User-Agent':'SvitloCherkasy/1.1 (+independent public-data reader)'})
    r.raise_for_status()
    return r.content if binary else r.text


def parse_article(html, url, reference):
    """Only accept articles with full 12-queue timestamped OFF schedule."""
    soup = BeautifulSoup(html, 'html.parser')
    h1 = soup.find('h1')
    if not h1: return None
    headline = h1.get_text(' ', strip=True).lower()
    if 'погодинн' not in headline or 'відключен' not in headline: return None
    m = HEADLINE_DATE.search(headline)
    if not m: return None
    # Some posts for 1 January are published on 31 December.
    published_match = PUB_TS.search(soup.get_text(' ', strip=True))
    if not published_match: return None
    published = datetime.strptime(' '.join(published_match.groups()), '%d.%m.%Y %H:%M').replace(tzinfo=TZ)
    year = published.year
    month = UA_MONTHS[m.group(2)]
    if month == 1 and published.month == 12: year += 1
    if month == 12 and published.month == 1: year -= 1
    try: schedule_date = datetime(year, month, int(m.group(1)), tzinfo=TZ).date().isoformat()
    except ValueError: return None
    # Extract text after the phrase that actually introduces the time intervals.
    whole = soup.get_text(' ', strip=True).replace('\xa0',' ').replace('−','-')
    marker = re.search(r'Години\s+відсутності\s+електропостачання\s*:', whole, re.I)
    if not marker: return None
    body = whole[marker.end():]
    # Ensure we do not accidentally parse later unrelated links/text.
    body = re.split(r'Свою\s+чергу|Перелік\s+адрес|Чат-боти|Сторінка\s+у\s+Telegram', body, maxsplit=1,flags=re.I)[0]
    found = list(QUEUE_START.finditer(body))
    if len(found) != 12 or {x.group(1) for x in found} != set(QUEUE): return None
    queues = {}
    for i, match in enumerate(found):
        part = body[match.end(): found[i+1].start() if i+1 < len(found) else len(body)]
        results = []
        for a, am, b, bm in INTERVAL.findall(part):
            start, end = int(a)*60+int(am), int(b)*60+int(bm)
            if not (0 <= start < end <= 1440): return None
            if results and results[-1][1] > start: return None
            results.append((start,end))
        if not results: return None
        queues[match.group(1)] = results
    return {'date': schedule_date, 'publishedAt':published.isoformat(timespec='minutes'),
            'source':url, 'queues':queues}


def compose(revisions):
    """Take latest future revisions; keep previously published earlier day fragments.
    Unknown minutes before first publication stay unknown (not automatically 'on').
    """
    revs = sorted(revisions, key=lambda a:a['publishedAt'])
    if not revs: return None
    day = revs[-1]['date']
    values = {q:[None]*1440 for q in QUEUE}
    for rev in revs:
        dt = datetime.fromisoformat(rev['publishedAt'])
        if dt.date().isoformat() < day: cutoff = 0
        elif dt.date().isoformat() == day: cutoff = dt.hour*60+dt.minute
        else: continue
        for q in QUEUE:
            new = [0]*1440  # on except published off windows, but only after publication time
            for start,end in rev['queues'][q]: new[start:end] = [1]*(end-start)
            values[q][cutoff:] = new[cutoff:]
    # Preserve only known outage and unknown spans; do not fill before first revision.
    result = {}
    for q in QUEUE:
        spans=[]; start=None
        for i, bit in enumerate(values[q]+[0]):
            if bit == 1 and start is None: start=i
            if bit != 1 and start is not None:
                spans.append([to_time(start),to_time(i)]);start=None
        known_from = next((i for i,b in enumerate(values[q]) if b is not None),1440)
        result[q] = {'knownFrom':to_time(known_from), 'off':spans}
    return {'date':day, 'publishedAt':revs[-1]['publishedAt'],
            'source':revs[-1]['source'], 'verified':True,'queues':result,
            'revisions':len(revs)}


def to_time(minute): return f'{minute//60:02d}:{minute%60:02d}'


def parse_news_links(html):
    soup = BeautifulSoup(html, 'html.parser')
    urls=[]
    for a in soup.select('a[href]'):
        title = a.get_text(' ',strip=True).lower()
        u = urljoin(BASE,a['href'])
        if ('графік погодинних відключень' in title or 'оновлено графік погодинних відключень' in title) and '/media/' in u:
            if urlparse(u).netloc in ('www.cherkasyoblenergo.com','cherkasyoblenergo.com') and u not in urls:
                urls.append(u)
    return urls


def update_schedules(session, now=None):
    now = now or datetime.now(TZ)
    # retain only nearby dates, no historical schedule falsely offered as fresh.
    wanted = {(now.date() + timedelta(days=n)).isoformat() for n in (-2,-1,0,1,2)}
    old_file = DATA/'schedules.json'
    try: old = json.loads(old_file.read_text(encoding='utf-8'))
    except (FileNotFoundError,ValueError): old = {'days':[]}
    existing = [x for x in old.get('days',[]) if x.get('date') in wanted]
    linklist = parse_news_links(fetch(session,BASE+'/news'))
    # News page can contain many updates for one day; existing composite is used only
    # if that day has no new articles in first page (never merge composite as revision).
    revisions_by_date = defaultdict(list)
    for u in linklist:
        try:
            item = parse_article(fetch(session,u),u,now)
            if item and item['date'] in wanted: revisions_by_date[item['date']].append(item)
        except (requests.RequestException, ValueError) as exc:
            LOG.warning('Article error %s: %s',u,exc)
    new_days={x['date']:x for x in existing}
    for day,revs in revisions_by_date.items():
        composite=compose(revs)
        if composite:
            if day in new_days and new_days[day].get('publishedAt','')>composite['publishedAt']:
                continue
            new_days[day]=composite
    if not revisions_by_date and not existing:
        raise RuntimeError('Офіційних придатних графіків не знайдено; файл не перезаписано')
    result={'schemaVersion':2,'lastChecked':now.isoformat(timespec='seconds'),
            'source':BASE+'/news','days':[new_days[d] for d in sorted(new_days)]}
    atomic_write(old_file,result)
    LOG.info('schedule days updated: %s',list(new_days))
    return result


# Only exact house numbers. Building ranges, missing numbers and city ambiguity
# must never be guessed. PDF is issued for the entire *oblast*, so only a
# clearly-delimited Черкаські міські ЕМ section is permitted.
STREET_START = re.compile(r'(?<![\w])(?P<type>вул(?:иця)?\.?|пров(?:\.|улок)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s*',re.I)
HOUSE_LIST = re.compile(r'^\s*,?\s*(?P<houses>\d{1,4}(?:\s*[а-яіїєґa-z]|/\d+[а-яіїєґa-z]?)?(?:\s*,\s*\d{1,4}(?:\s*[а-яіїєґa-z]|/\d+[а-яіїєґa-z]?)?)*)',re.I)
NAME_HOUSE = re.compile(r'^\s*(?P<name>[\w\-’\'\.\s]{3,75}?)\s*,?\s*(?=\d{1,4}(?:\s*[а-яіїєґa-z]|/\d+)?(?:\s*,|\s|$))',re.I)
HOUSE = re.compile(r'\d{1,4}(?:\s*[а-яіїєґa-z]|/\d+[а-яіїєґa-z]?)?',re.I)
CITY_SECTION=re.compile(r'Черкаські\s+міські\s+(?:ЕМ|енергетичні\s+мережі)',re.I)
BRANCH=re.compile(r'^(?:ВСП\s+)?(?:[А-ЯІЇЄҐ][\w’\'-]+\s+){1,4}(?:ЕМ|філія)\s*$',re.I)


def normalize(s):
    s=s.lower().replace('’',"'").replace('ʼ',"'").replace('ї','ї').replace('є̈','є')
    s=re.sub(r'^(?:вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s+', '',s)
    s=re.sub(r'[^\w/а-яіїєґ]+','',s,flags=re.I)
    return s


def extract_city_streets(text):
    """Parse explicit street HOUSE LIST snippets from city-labeled PDF segment.

    Don't infer house parity, whole streets, house ranges, or future renamed streets.
    """
    text = text.replace('\u00ad','').replace('\xa0',' ')
    text = re.sub(r'\s+',' ',text)
    # caller has already provided city section only
    tokens=list(STREET_START.finditer(text))
    matches=[]
    for i,t in enumerate(tokens):
        chunk=text[t.end():min(len(text),t.end()+750, tokens[i+1].start() if i+1<len(tokens) else len(text))]
        m=NAME_HOUSE.match(chunk)
        if not m: continue
        name=m.group('name').strip(' ,.:-')
        # Street name must not contain number / markup and can't be brand name.
        if any(ch.isdigit() for ch in name) or len(name)>55 or len(name)<3: continue
        rem=chunk[m.end():]
        hm=HOUSE_LIST.match(rem)
        if not hm: continue
        houses=[normalize(x) for x in HOUSE.findall(hm.group('houses'))]
        # 'Вулиці: Благовісна' too loose; avoid unless explicit label.
        clean=normalize(name)
        if len(clean)<3: continue
        stype=t.group('type').lower()
        kind='провулок' if stype.startswith(('пров','прв')) else 'бульвар' if stype.startswith(('б-р','буль')) else 'проспект' if stype.startswith(('просп','пр-т')) else 'узвіз' if stype.startswith('узв') else 'вулиця'
        for house in houses:
            if house:matches.append((kind,clean,house,name))
    return matches


def extract_city_section(pdf_bytes):
    import fitz
    doc=fitz.open(stream=pdf_bytes,filetype='pdf')
    city=False;lines=[]
    for page in doc:
        for l in page.get_text('text',sort=True).splitlines():
            if CITY_SECTION.search(l):city=True;continue
            if city and BRANCH.fullmatch(l.strip()) and not CITY_SECTION.search(l):city=False
            if city:lines.append(l)
    return '\n'.join(lines)


def parse_pdf_links(html):
    soup=BeautifulSoup(html,'html.parser')
    links=[]
    for a in soup.select('a[href]'):
        u=urljoin(BASE,a['href'])
        if PDF_LINK.search(u) and urlparse(u).netloc in ('www.cherkasyoblenergo.com','cherkasyoblenergo.com'):
            links.append(u)
    # There should be twelve documents in the same order as the website lists them.
    return list(dict.fromkeys(links))[:12]


def update_addresses(session, now=None):
    now=now or datetime.now(TZ)
    links=parse_pdf_links(fetch(session,BASE+'/perelik-gpv?lang=uk'))
    if len(links)!=12: raise RuntimeError('Очікували 12 PDF у переліку; нічого не перезаписано')
    index=defaultdict(set);labels={};bad=[]
    for q,u in zip(QUEUE,links):
        try:
            raw=fetch(session,u,True)
            if not raw.startswith(b'%PDF'): raise ValueError('Not PDF')
            sec=extract_city_section(raw)
            triples=extract_city_streets(sec)
            # Some subqueues have no consumers in Cherkasy city at all.
            # Zero city records in such a PDF is valid; still fetch all twelve.
            for kind,street,number,display in triples:
                key=f'{kind}|{street}|{number}'
                index[key].add(q)
                labels.setdefault(f'{kind}|{street}',f'{kind.title()} {display}')
            LOG.info('%s: %s city addresses',q,len(triples))
        except Exception as exc:
            bad.append(f'{q}: {exc}')
            LOG.warning('PDF %s failed: %s',q,exc)
    # Incomplete source means a seemingly unique queue might really be ambiguous.
    # All 12 must parse successfully before exporting a single match.
    if bad: raise RuntimeError('Неповний імпорт PDF: '+'; '.join(bad))
    if not index: raise RuntimeError('Не знайдено точних адрес, файл не перезаписано')
    export={'schemaVersion':2,'updatedAt':now.isoformat(timespec='seconds'),
            'source':BASE+'/perelik-gpv?lang=uk',
            'keys':{k:sorted(v) for k,v in sorted(index.items())},
            'streets':labels}
    atomic_write(DATA/'addresses.json',export)
    LOG.info('Saved %s distinct addresses',len(index))
    return export


def atomic_write(path,obj):
    path.parent.mkdir(exist_ok=True,parents=True)
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    tmp.replace(path)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--schedules-only',action='store_true')
    p.add_argument('--addresses-only',action='store_true')
    args=p.parse_args()
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    ses=requests.Session();failed=[]
    if not args.addresses_only:
        try:update_schedules(ses)
        except Exception as exc:LOG.exception('Schedules failed');failed.append(str(exc))
    if not args.schedules_only:
        try:update_addresses(ses)
        except Exception as exc:LOG.exception('Addresses failed');failed.append(str(exc))
    if failed: raise SystemExit(' | '.join(failed))


if __name__=='__main__':main()
