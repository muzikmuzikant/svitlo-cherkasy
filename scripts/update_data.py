#!/usr/bin/env python3
"""Conservative public-data importer for Svitlo Cherkasy.
Confirmed omissions mean no planned outages; source failures never do.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
BASE = 'https://www.cherkasyoblenergo.com'
TZ = ZoneInfo('Europe/Kyiv')
QUEUE = [f'{i}.{j}' for i in range(1, 7) for j in (1, 2)]
UA_MONTHS = dict(zip('січня лютого березня квітня травня червня липня серпня вересня жовтня листопада грудня'.split(),range(1,13)))
HEADLINE_DATE = re.compile(r'на\s+(\d{1,2})\s+('+'|'.join(UA_MONTHS)+r')',re.I)
QUEUE_START = re.compile(r'(?<!\d)([1-6]\.[12])(?:\s*\.)?\s*[-–—:]?\s*(?=(?:(?:з|із|від)\s+)?(?:\d{1,2}[:.]\d{2}|відсут|не\s+відключ|без\s+відключ))',re.I)
INTERVAL = re.compile(r'(?<!\d)([01]?\d|2[0-4])[:.]([0-5]\d)\s*(?:[–—−-]|до)\s*([01]?\d|2[0-4])[:.]([0-5]\d)',re.I)
PUB_TS = re.compile(r'(?<!\d)(\d{2}\.\d{2}\.20\d\d)\s+(\d\d:\d\d)')
PDF_LINK = re.compile(r'\.pdf(?:\?.*)?$',re.I)
BRANCH_CITY = re.compile(r'(?:ВСП\s*)?Черкаськ(?:і|их)\s+міськ(?:і|их)\s+(?:ЕМ|енергетичн(?:і|их)\s+мереж(?:і|ах))',re.I)
BRANCH_DISTRICT = re.compile(r'(?:ВСП\s*)?Черкаськ(?:і|их)\s+(?:(?:районн(?:і|их)\s+)?ЕМ|районн(?:і|их)\s+енергетичн(?:і|их)\s+мереж(?:і|ах))',re.I)
OTHER_BRANCH = re.compile(r'(?:ВСП\s*)?[А-ЯІЇЄҐ][А-ЯІЇЄҐа-яіїєґ\-’\'\s]{3,75}(?:\sЕМ|\sфілія|енергетичні\s+мережі)\s*$',re.I)
LOCALITY = re.compile(r'^(?:с\.|село|смт\.?|селище|м\.|місто)\s+([А-ЯІЇЄҐ][\w’\'\- ]{2,58})\s*$', re.I)
# Names confirmed by Verkhovna Rada Resolution 3984-IX (19 September 2024).
# Only apply these aliases inside the Cherkasy-area district EM branch.
LOCALITY_ALIASES = {'червонаслобода':'слобода', 'первомайське':'соснове', 'іванівка':'яничі'}
# A locality often appears *inside* a PDF table row, not on its own line.
LOCALITY_IN_ROW = re.compile(
    r'(?<![\w])(?:с\.|село|смт\.?|с-ще|селище|м\.|місто)\s*'
    r'(?P<name>[А-ЯІЇЄҐ][А-ЯІЇЄҐа-яіїєґ\s\-’\']{2,53}?)'
    r'(?=\s*[:;]|\s*,\s*(?:вул\.|пров\.|просп\.)|\s+(?:вул\.|пров\.|просп\.))',re.I)

STREET = re.compile(r'(?<!\w)(?P<type>вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s*',re.I)
STREET_NAME = re.compile(r'^\s*(?P<name>[^\d,;:]{3,85}?)\s*[,;:]?\s*(?=\d{1,4}(?:[/\-]?\d{1,4})?\s*[а-яіїєґa-z]?\b)',re.I)
HOUSE_LIST = re.compile(r'^\s*(?P<houses>\d{1,4}(?:\s*[-/]\s*\d{1,4})?(?:\s*[- ]?\s*[а-яіїєґa-z])?(?:\s*,\s*\d{1,4}(?:\s*[-/]\s*\d{1,4})?(?:\s*[- ]?\s*[а-яіїєґa-z])?)*)',re.I)
HOUSE = re.compile(r'\d{1,4}(?:\s*[-/]\s*\d{1,4})?(?:\s*[- ]?\s*[а-яіїєґa-z])?',re.I)
LOG = logging.getLogger('svitlo')


def create_session():
    """Small bounded retries for intermittent 429/5xx; never silently accept errors."""
    session=requests.Session()
    retry=Retry(total=2, connect=2, read=2, backoff_factor=0.8,
                status_forcelist=(429,500,502,503,504),
                allowed_methods=frozenset({'GET'}),
                respect_retry_after_header=True)
    adapter=HTTPAdapter(max_retries=retry,pool_connections=4,pool_maxsize=4)
    session.mount('https://',adapter)
    return session


def fetch(session,url,binary=False):
    # Never let an unresponsive PDF or article block the entire workflow for
    # GitHub Actions' 12-minute job timeout.
    r=session.get(url,timeout=(6,17),headers={'User-Agent':'SvitloCherkasy/7.1 public schedule aggregator',
                                     'Cache-Control':'no-cache','Pragma':'no-cache'})
    r.raise_for_status()
    return r.content if binary else r.text


def normalize(s):
    s=str(s).lower().replace('’',"'").replace('ʼ',"'")
    s=re.sub(r'^(?:вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s+','',s)
    return re.sub(r'[^\w/а-яіїєґ]+','',s,flags=re.I)


def clean_locality(s):
    s=re.sub(r'^(?:с\.|село|смт\.?|с-ще|селище|м\.|місто)\s*','',str(s).strip(),flags=re.I)
    key=normalize(s)
    return LOCALITY_ALIASES.get(key,key)



def utc_stamp(date):return date.isoformat(timespec='seconds')
def to_time(m):return f'{m//60:02d}:{m%60:02d}'

class ScheduleDateConflict(ValueError):
    """An official headline can have a typo: never silently publish it as a date."""
    def __init__(self, headline_date, published_at, url):
        self.headline_date=str(headline_date)
        self.published_at=published_at.isoformat(timespec='minutes')
        self.url=url
        super().__init__(f'Підозріла дата заголовка {self.headline_date} (публікація {self.published_at}); потрібна перевірка')


def check_schedule_date(day, pub, url):
    target=datetime.fromisoformat(day).date()
    # Operator normally publishes schedules on the same day or 1-2 days before;
    # allow three days either way for late corrections. A month typo is blocked.
    if abs((target-pub.date()).days)>3:
        raise ScheduleDateConflict(target,pub,url)
    return True


def parse_article(html,url,reference=None):
    soup=BeautifulSoup(html,'html.parser')
    header=soup.find('h1')
    if not header:return None
    heading=header.get_text(' ',strip=True).lower()
    if 'погодинн' not in heading or 'відключен' not in heading:return None
    date_hit=HEADLINE_DATE.search(heading)
    if not date_hit:return None
    full=soup.get_text(' ',strip=True).replace('\xa0',' ').replace('−','-')
    # The operator's CMS wraps parts of a clock in separate HTML spans,
    # so BeautifulSoup may produce "08 :00" instead of "08:00".
    # Join only numeric clock colons, never merge unrelated table tokens.
    full=re.sub(r'(?<=\d)\s*:\s*(?=\d{2}\b)', ':', full)
    time_hit=PUB_TS.search(full)
    if time_hit:
        pub=datetime.strptime(' '.join(time_hit.groups()),'%d.%m.%Y %H:%M').replace(tzinfo=TZ)
    else:
        # CMS editors can change visible date markup while its structured
        # publication date remains authoritative. Do not infer today's date.
        raw_time=None
        for selector,attribute in [('meta[property="article:published_time"]','content'),
                                   ('meta[itemprop="datePublished"]','content'),
                                   ('time[datetime]','datetime')]:
            el=soup.select_one(selector)
            if el and el.get(attribute):
                raw_time=el.get(attribute)
                break
        try:
            pub=datetime.fromisoformat(raw_time.replace('Z','+00:00')).astimezone(TZ) if raw_time else None
        except (ValueError,TypeError):
            pub=None
        if pub is None:return None
    year=pub.year
    month=UA_MONTHS[date_hit.group(2).lower()]
    if pub.month==12 and month==1:year+=1
    if pub.month==1 and month==12:year-=1
    try:day=datetime(year,month,int(date_hit.group(1)),tzinfo=TZ).date().isoformat()
    except ValueError:return None
    check_schedule_date(day,pub,url)
    # Operator edits are separate official news posts and sometimes change
    # the wording before the queue table. A fixed introductory phrase must not
    # make an otherwise well-formed official revision unreadable.
    marker=re.search(r'(?:Години\s+відсутності\s+електропостачання|Години\s+відключень|Години\s+відсутності\s+(?:світла|електрики)|електропостачання\s+буде\s+відсутнє\s+у\s+наступні\s+години)\s*:', full, re.I)
    if marker:
        table_text=full[marker.end():]
    else:
        # Strict fallback: start at the article heading and require three
        # recognizable queues; navigation/sidebar numbers are not a plan.
        container=soup.select_one('article, .article-content, .news-article, main') or soup
        text=container.get_text(' ', strip=True).replace('\xa0',' ').replace('−','-')
        text=re.sub(r'(?<=\d)\s*:\s*(?=\d{2}\b)', ':', text)
        heading_pos=text.lower().find(heading)
        table_text=text[heading_pos+len(heading):] if heading_pos>=0 else text
        if len(set(m.group(1) for m in QUEUE_START.finditer(table_text))) < 3:
            return None
    body=re.split(r'Свою\s+чергу|Перелік\s+адрес|Чат-боти|Сторінка\s+у\s+Telegram|Відключення\s+електроенергії\s+можуть',table_text,maxsplit=1,flags=re.I)[0]
    found=list(QUEUE_START.finditer(body))
    if not found:return None
    if len({x.group(1) for x in found})!=len(found):return None
    queues={}
    for i,m in enumerate(found):
        part=body[m.end():found[i+1].start() if i+1<len(found) else len(body)]
        periods=[]
        for a,am,b,bm in INTERVAL.findall(part):
            start,end=int(a)*60+int(am),int(b)*60+int(bm)
            if not 0<=start<end<=1440 or periods and periods[-1][1]>start:return None
            periods.append((start,end))
        # Explicit 'not disconnected' text means known schedule with no outages.
        explicitly_none=bool(re.search(r'не\s+відключ|без\s+відключ|відключення\s+не\s+передбач',part,re.I))
        if periods or explicitly_none:queues[m.group(1)]=periods
        else:return None
    return {'date':day,'publishedAt':pub.isoformat(timespec='minutes'),'source':url,'queues':queues}


def plan_fingerprint(queues):
    """Stable fingerprint of the actual forecast, not the publication timestamp.

    Operator staff may edit the *same* news article repeatedly without changing
    its displayed publication time. Cosmetic HTML edits should not create noise.
    """
    normalized = {q: [list(span) for span in queues.get(q, [])] for q in QUEUE}
    raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:20]


def compose(revisions):
    """Newest official publication is the current FULL-DAY plan.

    Omitted queues in *every* edition, including later corrections, mean no
    planned outages for those queues. Never carry deleted outages from an older
    edition into the current forecast. Revision history remains in metadata.
    """
    # News pages put the newest post first. On identical publication minutes,
    # prefer the FIRST listing item, not arbitrary alphabetic URL ordering.
    revs = [r for _, r in sorted(enumerate(revisions),
            key=lambda item: (item[1]['publishedAt'], -item[0]))]
    if not revs:
        return None
    latest = revs[-1]
    queues = {}
    for q in QUEUE:
        periods = latest['queues'].get(q, [])
        queues[q] = {'knownFrom': '00:00',
                     'off': [[to_time(start), to_time(end)] for start, end in periods]}
    return {'date': latest['date'], 'publishedAt': latest['publishedAt'],
            'source': latest['source'], 'verified': True,
            'queues': queues, 'revisions': len(revs),
            'planFingerprint': plan_fingerprint(latest['queues']),
            'noScheduledOutages': [q for q in QUEUE if q not in latest['queues']],
            'publications': [{'publishedAt': r['publishedAt'],
                              'source': r['source'], 'queues': sorted(r['queues'])}
                             for r in revs]}


def publication_fingerprint(html):
    """Hash visible article content to invalidate approvals after real edits."""
    soup=BeautifulSoup(html,'html.parser')
    node=soup.select_one('article, .article-content, .news-article, main') or soup
    content=re.sub(r'\s+', ' ',node.get_text(' ',strip=True)).strip()
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:24]


def parse_news_links(html):
    soup=BeautifulSoup(html,'html.parser');urls=[]
    for a in soup.select('a[href]'):
        txt=a.get_text(' ',strip=True).lower()
        u=urljoin(BASE,a['href'])
        if re.search(r'графік\s+погодинних\s+відключень', txt) and '/media/' in urlparse(u).path and urlparse(u).netloc.endswith('cherkasyoblenergo.com') and u not in urls:urls.append(u)
    return urls


def atomic_write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(path)


def update_schedules(session, now=None):
    """Refresh verified plans without letting one unreadable article block others.

    A source index fetch failure is fatal. Individual article failures are kept
    for review and make any *missing* daily schedule unconfirmed; already parsed
    official schedules are still safe to publish.
    """
    now = now or datetime.now(TZ)
    # Sunday 00:00 Europe/Kyiv expires previous Monday-Saturday.
    # Preserve the Sunday schedule and any upcoming published Mon/Tue plans.
    monday = now.date() - timedelta(days=now.weekday())
    cutoff = now.date() if now.weekday() == 6 else monday
    wanted = {(monday + timedelta(days=i)).isoformat() for i in range(9)
              if monday + timedelta(days=i) >= cutoff}
    dest = DATA / 'schedules.json'
    try:
        old = json.loads(dest.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        old = {'days': []}
    existing = {d['date']: d for d in old.get('days', []) if d.get('date') in wanted}

    news_html = fetch(session, BASE + '/news?lang=uk')
    soup = BeautifulSoup(news_html, 'html.parser')
    other_articles = any('/media/' in a.get('href', '') for a in soup.select('a[href]'))
    page_heading = ' '.join(x.get_text(' ', strip=True) for x in soup.select('title,h1'))
    if not (other_articles or (bool(soup.find('body')) and 'новин' in page_heading.lower())):
        raise RuntimeError('Unrecognized official news index; previous data preserved')

    urls = parse_news_links(news_html)
    # Map each listing link to its advertised date. Failure of an unrelated old
    # article should not prevent a fresh, successful check from confirming that
    # no graph is announced for today/tomorrow.
    advertised_dates = {}
    for link in soup.select('a[href]'):
        url = urljoin(BASE, link['href'])
        if url not in urls:
            continue
        match = HEADLINE_DATE.search(link.get_text(' ', strip=True))
        if not match:
            continue
        month = UA_MONTHS[match.group(2).lower()]
        year = now.year + (1 if now.month == 12 and month == 1 else -1 if now.month == 1 and month == 12 else 0)
        try:
            advertised_dates[url] = datetime(year, month, int(match.group(1))).date().isoformat()
        except ValueError:
            pass
    grouped = defaultdict(list)
    review = []
    warnings = []
    for u in urls:
        try:
            html=fetch(session, u)
            fingerprint=publication_fingerprint(html)
            rev = parse_article(html, u)
            if rev and rev['date'] in wanted:
                grouped[rev['date']].append(rev)
            elif rev is None:
                warnings.append({'code': 'UNREADABLE_ARTICLE', 'source': u,
                                 'targetDate': advertised_dates.get(u),
                                 'sourceHash': fingerprint,
                                 'reason': 'Редаговану офіційну новину не вдалося розпізнати. Перевірте її години вручну; попередній підтверджений графік збережено.'})
                LOG.warning('Could not parse schedule article %s', u)
        except ScheduleDateConflict as e:
            review.append({'code': 'HEADLINE_DATE_CONFLICT', 'source': e.url,
                           'headlineDate': e.headline_date, 'publishedAt': e.published_at,
                           'reason': 'Дата графіка суттєво відрізняється від дати публікації. Потрібна ручна перевірка.'})
            LOG.warning('QUARANTINED source date mismatch %s (%s / %s)', e.url, e.headline_date, e.published_at)
        except (requests.RequestException, ValueError, RuntimeError) as e:
            warnings.append({'code': 'ARTICLE_FETCH_FAILED', 'source': u,
                             'targetDate': advertised_dates.get(u),
                             'reason': 'Не вдалося отримати або прочитати публікацію.'})
            LOG.warning('Article error %s: %s', u, e)

    # Never claim that an absent graph means power is planned all day while
    # an official publication is unresolved. Publishing a *verified* other
    # day's graph is nevertheless safe and useful.
    risk_dates = {now.date().isoformat(), (now.date()+timedelta(days=1)).isoformat()}
    # An impossible headline/publication date is a deeper integrity issue:
    # keep conservative behavior for both dates until staff resolve it.
    unresolved_dates = set(risk_dates) if review else set()
    for issue in warnings:
        target = issue.get('targetDate')
        if target is None:
            unresolved_dates.update(risk_dates)
        elif target in risk_dates:
            unresolved_dates.add(target)
    # reviewPending remains the audit flag. The UI uses date-scoped warnings;
    # a failure for an unrelated older date cannot invalidate today's plan.
    pending = bool(review or unresolved_dates)
    changed = []
    for day, revs in grouped.items():
        latest = compose(revs)
        prev = existing.get(day)
        # A newer previously verified edition must not be rolled back if an
        # earlier article is temporarily the only one visible in the news list.
        if prev and not prev.get('manualReview') and prev.get('publishedAt', '') > latest['publishedAt']:
            continue
        if prev:
            diffs = [q for q in QUEUE if prev.get('queues', {}).get(q, {}) != latest['queues'].get(q, {})]
            # Same URL and same publication minute may contain different hours!
            # Keep lastChecked heartbeat for no-op checks, but publish a true edit.
            if not diffs and prev.get('publishedAt') == latest['publishedAt'] and prev.get('source') == latest['source'] and not prev.get('manualReview'):
                continue
            if diffs:
                changed.append({'date': day, 'publishedAt': latest['publishedAt'],
                                'detectedAt': utc_stamp(now),
                                'revisionId': latest['planFingerprint'],
                                'source': latest['source'], 'queues': diffs})
        existing[day] = latest

    old_changes = [x for x in old.get('changes', [])
                   if isinstance(x, dict) and isinstance(x.get('date'), str)
                   and x['date'] >= cutoff.isoformat()]
    keys = {(x.get('date'), x.get('revisionId') or x.get('publishedAt')) for x in old_changes}
    for change in changed:
        identity = (change['date'], change['revisionId'])
        if identity not in keys:
            old_changes.append(change)
            keys.add(identity)

    # Explicit daily certainty for the PWA. Absence of a publication is only
    # meaningful for dates actually included in the successful official check,
    # and never for a date with a currently unresolved article.
    confirmed_no_plan = [d for d in sorted(risk_dates) if d not in existing
                         and d not in unresolved_dates]
    result = {'schemaVersion': 3, 'lastChecked': utc_stamp(now),
              'reviewPending': pending, 'unresolvedDates': sorted(unresolved_dates),
              'confirmedNoScheduleDates': confirmed_no_plan,
              'source': BASE + '/news',
              'days': [existing[k] for k in sorted(existing)],
              'changes': old_changes[-100:]}
    # Commit order is important: schedule must be published even when the
    # diagnostics for another publication are nonempty.
    atomic_write(dest, result)
    atomic_write(DATA / 'source_review.json',
                 {'schemaVersion': 1, 'lastChecked': utc_stamp(now),
                  'rejectedCount': len(review),
                  'warningCount': len(warnings),
                  'items': (review + warnings)[:50]})
    published = sorted(grouped.keys())
    LOG.info('Schedule import: %d parsed days, %d warnings, %d date conflicts, published through %s',
             len(published), len(warnings), len(review), max(existing, default='none'))
    if pending:
        LOG.warning('Source requires review; missing-day forecasts are unconfirmed')
    return result


def parse_pdf_links(html):
    soup=BeautifulSoup(html,'html.parser')
    result=[]
    for a in soup.select('a[href]'):
        u=urljoin(BASE,a['href'])
        if PDF_LINK.search(u) and urlparse(u).netloc.endswith('cherkasyoblenergo.com') and u not in result:result.append(u)
    return result


def labeled_pdf_links(html):
    """Read labels such as '1 черга, І підчерга' and '1.1' around PDF anchors."""
    soup=BeautifulSoup(html,'html.parser')
    mapping={}
    for a in soup.select('a[href]'):
        url=urljoin(BASE,a['href'])
        if not PDF_LINK.search(url) or not urlparse(url).netloc.endswith('cherkasyoblenergo.com'):continue
        for node in (a,a.parent,a.parent.parent if a.parent else None,a.parent.parent.parent if a.parent and a.parent.parent else None):
            if node is None:continue
            value=node.get_text(' ',strip=True)
            hits=re.findall(r'(?<!\d)([1-6]\.[12])(?!\d)',value)
            if len(set(hits))==1:q=hits[0]
            else:
                m=re.search(r'([1-6])\s*черга\s*,?\s*(I{1,2}|І{1,2}|перш[а-я]+|друг[а-я]+)\s*підчерга',value,re.I)
                if not m:continue
                roman=m.group(2).upper().replace('І','I')
                q=f"{m.group(1)}.{2 if roman.startswith('II') or roman.lower().startswith('друг') else 1}"
            if q in mapping and mapping[q]!=url:continue
            mapping[q]=url
            break
    return {q:mapping[q] for q in QUEUE if q in mapping}


def street_entries(text):
    text=text.replace('\u00ad','').replace('\xa0',' ')
    text=re.sub(r'\s+',' ',text)
    tokens=list(STREET.finditer(text))
    found=[]
    for i,t in enumerate(tokens):
        chunk=text[t.end():min(t.end()+500,tokens[i+1].start() if i+1<len(tokens) else len(text))]
        match=STREET_NAME.match(chunk)
        if not match:continue
        display=match.group('name').strip(' ,.:-')
        if len(display)<3 or len(display)>55 or any(c.isdigit() for c in display):continue
        hm=HOUSE_LIST.match(chunk[match.end():])
        if not hm:continue
        kindraw=t.group('type').lower()
        kind='провулок' if kindraw.startswith(('пров','прв')) else 'проспект' if kindraw.startswith(('просп','пр-т')) else 'бульвар' if kindraw.startswith(('б-р','буль')) else 'узвіз' if kindraw.startswith('узв') else 'вулиця'
        for h in HOUSE.findall(hm.group('houses')):
            house=normalize(h.replace('-',''))
            if house:found.append((kind,normalize(display),house,display))
    return found



def street_house_lists(text):
    """Parse operator's 'Вулиці: Благовісна,244,270, В.Чорновола,7' format.
    This representation has no 'вул.' prefix on each street.
    """
    found=[]
    for marker in re.finditer(r'Вулиці\s*:',text,re.I):
        # Each marker is followed by a named-street-and-number series.
        part=text[marker.end(): marker.end()+2500]
        # Bound at the next enterprise/branch descriptor if possible.
        part=re.split(r'\b(?:ТОВ|ПП|ФОП|КП)\s+[«"А-Я]',part,maxsplit=1)[0]
        streets=list(re.finditer(r'(?:(?<=,)|(?<=:)|^)\s*([А-ЯІЇЄҐ][^\d,;:]{2,55}?)\s*,\s*(?=\d{1,4})',part,re.I))
        for i,m in enumerate(streets):
            name=m.group(1).strip(' ,.:-')
            if not name or len(name)>55:continue
            end=streets[i+1].start() if i+1<len(streets) else min(len(part),m.end()+1200)
            houses=HOUSE_LIST.match(part[m.end():end])
            if not houses:continue
            kind='вулиця'
            clean=normalize(name)
            if not clean or any(x.isdigit() for x in name):continue
            for number in HOUSE.findall(houses.group('houses')):
                h=normalize(number.replace('-',''))
                if h:found.append((kind,clean,h,name))
    return found


def street_only_entries(text):
    """Extract street-level hints (with or without enumerated house numbers).

    PDF rows are inconsistent: ``вул.Соборна, вул.50 років Перемоги,``
    and ``вул.Лісова вул.Польова`` both occur. Records are suggestions,
    never evidence that an arbitrary house is in the listed subqueue.
    """
    found=[]
    clean=re.sub(r'\s+',' ',text.replace('\u00ad','').replace('\xa0',' '))
    markers=list(STREET.finditer(clean))
    for i,marker in enumerate(markers):
        end=min(len(clean),marker.end()+110,markers[i+1].start() if i+1<len(markers) else len(clean))
        chunk=clean[marker.end():end]
        candidate=re.split(r'[,;:\n]',chunk,maxsplit=1)[0].strip(' .–-')
        # Avoid treating a street + its house number as a new street name.
        # Leading numbers in names (e.g. "50 років Перемоги") are valid.
        candidate=re.sub(r'(?<!^)\s+\d{1,4}(?:/\d+)?[а-яіїєґa-z]?$', '', candidate,flags=re.I).strip()
        if not 3<=len(candidate)<=58:continue
        if re.search(r'\b(?:ТОВ|ФОП|АТ|КП|ПП|ПРАТ)\b',candidate,re.I):continue
        kindraw=marker.group('type').lower()
        kind='провулок' if kindraw.startswith(('пров','прв')) else 'проспект' if kindraw.startswith(('просп','пр-т')) else 'бульвар' if kindraw.startswith(('б-р','буль')) else 'узвіз' if kindraw.startswith('узв') else 'вулиця'
        if normalize(candidate):found.append((kind,normalize(candidate),candidate))
    return found


def extract_city_streets(text):return street_entries(text)



def join_wrapped_branch_headings(lines):
    """PDF table cells may wrap the branch's name across 2-3 lines.

    Without joining them, the district branch is never activated, so the
    importer silently loses entire villages while the city still looks valid.
    """
    output=[]
    i=0
    while i<len(lines):
        line=lines[i].strip()
        for width in (3,2):
            if i+width>len(lines):
                continue
            parts=[s.strip() for s in lines[i:i+width]]
            if not all(parts):
                continue
            combined=' '.join(parts)
            if BRANCH_CITY.fullmatch(combined) or BRANCH_DISTRICT.fullmatch(combined):
                line=combined
                i+=width-1
                break
        output.append(line)
        i+=1
    return output


def extract_sections(pdf):
    """Read rows in PDF table order, separated by utility branch and village.

    Official tables use both standalone and inline locality headings. A street
    without house numbers is indexed separately as a *hint*, never an exact
    verified house match. This prevents accidentally mapping a whole village
    to a single queue or mixing the city and district branches.
    """
    import fitz
    doc=fitz.open(stream=pdf,filetype='pdf')
    sections=defaultdict(list)
    branch=None
    locality=None
    for page in doc:
        for raw in join_wrapped_branch_headings(page.get_text('text',sort=True).splitlines()):
            line=raw.strip()
            if not line:continue
            # A branch marker is a table-cell heading, not a company in a row.
            if BRANCH_CITY.fullmatch(line):
                branch='city';locality='Черкаси';continue
            if BRANCH_DISTRICT.fullmatch(line):
                branch='district';locality=None;continue
            if OTHER_BRANCH.fullmatch(line):
                branch=None;locality=None;continue
            if branch=='city':
                sections['Черкаси'].append(line)
                continue
            if branch!='district':continue
            lone=LOCALITY.fullmatch(line)
            if lone:
                locality=lone.group(1).strip()
                continue
            # Split a long PDF row containing several villages; only text
            # after the explicit village marker is allocated to that village.
            # The personal initial "М." in "вул.М.Залізняка" is NOT
            # the town prefix "м.". Previously this created fake towns and
            # silently moved entire groups of Sloboda streets into them.
            markers=[
                m for m in LOCALITY_IN_ROW.finditer(line)
                if not re.search(
                    r'(?:вул(?:иця)?|пров(?:улок)?|прв|просп(?:ект)?|пр-т|б-р|бульвар)\.?\s*$',
                    line[:m.start()], re.I
                )
            ]
            if markers:
                if locality and line[:markers[0].start()].strip():
                    sections[locality].append(line[:markers[0].start()])
                for i,m in enumerate(markers):
                    locality=m.group('name').strip()
                    part=line[m.end():markers[i+1].start() if i+1<len(markers) else len(line)].lstrip(' :;,')
                    if part:sections[locality].append(part)
            elif locality:
                sections[locality].append(line)
    return {k:'\n'.join(v) for k,v in sections.items() if v}


def extract_city_section(pdf):return extract_sections(pdf).get('Черкаси','')



def preserve_street_catalogue(result, previous, historical):
    """A partial PDF parse must never erase known street *names*.

    Earlier documents can suggest a street exists, not certify its queue today.
    Keep such entries visible in the current import with explicit archival
    provenance. Only this run's fully parsed official PDFs may set live queues.
    """
    def valid_hints(values):
        return sorted({x for x in values if isinstance(x, str) and x in QUEUE}) if isinstance(values, list) else []

    def preserve(target, *sources):
        target_streets = target.setdefault('streets', {})
        confirmed = set(target_streets)
        assigned = target.setdefault('streetQueues', {})
        archived = set()
        archive_hints = {}
        for source in sources:
            if not isinstance(source, dict):
                continue
            past_streets = source.get('streets', {})
            if not isinstance(past_streets, dict):
                continue
            for street, label in past_streets.items():
                if not isinstance(street, str) or not isinstance(label, str):
                    continue
                if street in confirmed:
                    continue
                if street not in target_streets:
                    target_streets[street] = label
                archived.add(street)
                hints = valid_hints(source.get('archivedStreetQueues', {}).get(street, []))
                if not hints:
                    hints = valid_hints(source.get('streetQueues', {}).get(street, []))
                if hints:
                    archive_hints.setdefault(street, set()).update(hints)
        if archived:
            target['archiveOnlyStreets'] = sorted(archived)
            target['archivedStreetQueues'] = {
                key: sorted(archive_hints[key]) for key in sorted(archive_hints)
            }
        return len(archived)

    older = previous if isinstance(previous, dict) else {}
    seed = historical if isinstance(historical, dict) else {}
    archived_count = preserve(result, older, seed)
    places = result.setdefault('localities', {})
    previous_places = older.get('localities', {})
    seed_places = seed.get('localities', {})
    previous_places = previous_places if isinstance(previous_places, dict) else {}
    seed_places = seed_places if isinstance(seed_places, dict) else {}
    # Remove fake localities produced by older "М." abbreviation parsing.
    invalid_towns={'леонтовича','залізняка'}
    for fake in invalid_towns:
        places.pop(fake, None)
    for town in sorted(set(places) | set(previous_places) | set(seed_places)):
        if town in invalid_towns:
            continue
        current = places.setdefault(town, {'keys': {}, 'streets': {}, 'streetQueues': {}})
        older_town = previous_places.get(town, {})
        seeded_town = seed_places.get(town, {})
        if not current.get('label'):
            current['label'] = (older_town.get('label') if isinstance(older_town, dict) else None) or (
                seeded_town.get('label') if isinstance(seeded_town, dict) else None) or town
        archived_count += preserve(current, older_town, seeded_town)
    result['stats']['archivedStreetOnly'] = archived_count
    return result


def update_addresses(session,now=None):
    now=now or datetime.now(TZ)
    html=fetch(session,BASE+'/perelik-gpv?lang=uk')
    urls=labeled_pdf_links(html)
    if len(urls)!=12:
        raise RuntimeError(f'Only {len(urls)} unambiguously labeled queue PDF links; refusing to guess queue order')
    collected=defaultdict(lambda:defaultdict(set));street_labels=defaultdict(dict);street_q=defaultdict(lambda:defaultdict(set));town_labels={}
    errors=[]
    for queue,url in urls.items():
        try:
            raw=fetch(session,url,True)
            if not raw.startswith(b'%PDF'):raise ValueError('Not a PDF')
            sections=extract_sections(raw)
            for town,content in sections.items():
                key=clean_locality(town)
                town_labels.setdefault(key, town.strip())
                # Numbered addresses and street-wide listings are distinct:
                # street-wide listings are NOT proof for a specific house.
                for kind,street,house,label in street_entries(content)+street_house_lists(content):
                    if not street or not house:continue
                    collected[key][f'{kind}|{street}|{house}'].add(queue)
                    street_labels[key][f'{kind}|{street}']=f'{kind.capitalize()} {label}'
                for kind,street,label in street_only_entries(content):
                    street_q[key][f'{kind}|{street}'].add(queue)
                    street_labels[key].setdefault(f'{kind}|{street}',f'{kind.capitalize()} {label}')
            LOG.info('%s: %s localities parsed',queue,len(sections))
        except Exception as e:
            errors.append(f'{queue}: {e}')

    if errors:raise RuntimeError('Incomplete official PDF import: '+'; '.join(errors))
    if not collected and not street_q:raise RuntimeError('No address or street records in PDFs')
    keycity=clean_locality('Черкаси')
    towns={k:{'keys':{a:sorted(v) for a,v in sorted(collected.get(k,{}).items())},'streets':street_labels[k], 'label':town_labels.get(k,k), 'streetQueues':{x:sorted(v) for x,v in street_q.get(k,{}).items()}} for k in set(street_labels)|set(collected)|set(street_q) if k!=keycity}
    if not towns:
        raise RuntimeError('Village index is empty after parsing all 12 PDFs; refusing to publish broken search')
    city=collected.get(keycity,{})
    result={'schemaVersion':3,'updatedAt':utc_stamp(now),'source':BASE+'/perelik-gpv?lang=uk',
            'keys':{a:sorted(v) for a,v in sorted(city.items())},'streets':street_labels.get(keycity,{}),'streetQueues':{x:sorted(v) for x,v in street_q.get(keycity,{}).items()},
            'localities':towns,'stats':{'city':len(city),'villages':len(towns),'total':sum(len(v) for v in collected.values()),'streetOnly':sum(len(v) for v in street_q.values())}}
    # A PDF format change can silently drop most records while still looking
    # syntactically valid. Quarantine catastrophic regressions instead of
    # replacing yesterday's correct address database with a broken parser run.
    current_file = DATA / 'addresses.json'
    try:
        previous = json.loads(current_file.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        previous = {}
    previous_city = len(previous.get('keys', {}))
    previous_towns = len(previous.get('localities', {}))
    if previous_city >= 100 and len(city) < previous_city * .55:
        raise RuntimeError(f'Address import quarantine: city house records dropped from {previous_city} to {len(city)}')
    if previous_towns >= 10 and len(towns) < previous_towns * .55:
        raise RuntimeError(f'Address import quarantine: localities dropped from {previous_towns} to {len(towns)}')
    try:
        historical = json.loads((DATA / 'published_street_fallback.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        historical = {}
    preserve_street_catalogue(result, previous, historical)
    LOG.info('Address catalogue: %d current streets and %d archived-only labels',
             sum(len(loc.get('streetQueues', {})) for loc in result['localities'].values()),
             result['stats']['archivedStreetOnly'])
    atomic_write(current_file,result)
    return result




# Conservative extraction of official emergency bulletins. A bulletin is NOT
# evidence that a particular house lost power, only that the operator published
# an emergency restriction notice. Inactive/ambiguous bulletins never trigger
# "active emergency" push messages.
EMERGENCY_TITLE = re.compile(r'(?:екстрен[іихо]+|аварійн[іихо]+)\s+(?:відключенн|вимкненн)|(?:відключенн|вимкненн)\s+за\s+аварійними',re.I)
CANCEL_TITLE = re.compile(r'скасован|припинен|завершен|відмін[еє]|відновлен|знято\s+обмеження',re.I)
ACTIVE_TITLE = re.compile(r'запроваджен|введен|діють|діятимуть|застосовують|почал[ио]|розпочат',re.I)

def emergency_link_candidates(html):
    soup=BeautifulSoup(html,'html.parser');links=[]
    for a in soup.select('a[href]'):
        url=urljoin(BASE,a['href'])
        label=a.get_text(' ',strip=True)
        if (EMERGENCY_TITLE.search(label) and '/media/' in url
                and urlparse(url).netloc in ('cherkasyoblenergo.com','www.cherkasyoblenergo.com')
                and url not in links):links.append(url)
    return links

def parse_emergency_article(html,url,now=None):
    soup=BeautifulSoup(html,'html.parser');h=soup.find('h1')
    if not h:return None
    title=h.get_text(' ',strip=True)
    if not EMERGENCY_TITLE.search(title):return None
    m=PUB_TS.search(soup.get_text(' ',strip=True))
    if not m:return None
    published=datetime.strptime(' '.join(m.groups()),'%d.%m.%Y %H:%M').replace(tzinfo=TZ)
    now=now or datetime.now(TZ)
    if published>now+timedelta(minutes=10) or published<now-timedelta(days=2):return None
    state='ended' if CANCEL_TITLE.search(title) else 'active' if ACTIVE_TITLE.search(title) else 'notice'
    return {'id':url,'title':title[:170],'publishedAt':published.isoformat(timespec='minutes'),
            'source':url,'status':state,'scope':'region','queues':[]}

def update_emergency(session,now=None):
    now=now or datetime.now(TZ)
    out=DATA/'emergency.json'
    try:old=json.loads(out.read_text('utf8'))
    except (ValueError,FileNotFoundError):old={'events':[]}
    listing=fetch(session,BASE+'/news?lang=uk')
    entries=[]
    for url in emergency_link_candidates(listing)[:12]:
        try:
            event=parse_emergency_article(fetch(session,url),url,now)
            if event:entries.append(event)
        except (requests.RequestException,ValueError) as e:LOG.warning('Emergency article failed %s: %s',url,e)
    # Keep recent bulletins only, never treat source unavailability as 'all clear'.
    events={item['id']:item for item in old.get('events',[]) if item.get('id') and
            item.get('publishedAt','') >= (now-timedelta(hours=48)).isoformat(timespec='minutes')}
    events.update({e['id']:e for e in entries})
    result={'schemaVersion':1,'lastChecked':now.isoformat(timespec='seconds'),
            'source':BASE+'/news','events':sorted(events.values(),key=lambda x:x['publishedAt'],reverse=True)[:30]}
    atomic_write(out,result)
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--schedules-only',action='store_true')
    parser.add_argument('--addresses-only',action='store_true')
    parser.add_argument('--emergency-only',action='store_true')
    args=parser.parse_args()
    if sum((args.schedules_only,args.addresses_only,args.emergency_only))>1:
        parser.error('Вкажіть тільки один режим імпорту')
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    session=create_session();failed=[]
    if not (args.addresses_only or args.emergency_only):
        try:update_schedules(session)
        except Exception as e:LOG.exception('schedule update failed');failed.append('schedules '+str(e))
    if not (args.schedules_only or args.emergency_only):
        try:update_addresses(session)
        except Exception as e:LOG.exception('addresses update failed');failed.append('addresses '+str(e))
    if args.emergency_only or not (args.schedules_only or args.addresses_only):
        try:update_emergency(session)
        except Exception as e:LOG.exception('emergency import failed');failed.append('emergency '+str(e))
    if failed:raise SystemExit(' | '.join(failed))

if __name__=='__main__':main()
