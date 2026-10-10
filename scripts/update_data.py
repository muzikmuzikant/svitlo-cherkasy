#!/usr/bin/env python3
"""Conservative public-data importer for Svitlo Cherkasy v6.
Never invents a queue or silently turns missing queue schedules into 'power on'.
"""
from __future__ import annotations
import argparse
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
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
UA_MONTHS = dict(zip('січня лютого березня квітня травня червня липня серпня вересня жовтня листопада грудня'.split(),range(1,13)))
HEADLINE_DATE = re.compile(r'на\s+(\d{1,2})\s+('+'|'.join(UA_MONTHS)+r')',re.I)
QUEUE_START = re.compile(r'(?<!\d)([1-6]\.[12])\s*[-–—:]?\s*(?=(?:\d{1,2}:\d{2}|відсут|не\s+відключ|без\s+відключ))',re.I)
INTERVAL = re.compile(r'(?<!\d)([01]?\d|2[0-4]):([0-5]\d)\s*[–—−-]\s*([01]?\d|2[0-4]):([0-5]\d)')
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


def fetch(session,url,binary=False):
    r=session.get(url,timeout=35,headers={'User-Agent':'SvitloCherkasy/6.0 public schedule aggregator'})
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
    time_hit=PUB_TS.search(full)
    if not time_hit:return None
    pub=datetime.strptime(' '.join(time_hit.groups()),'%d.%m.%Y %H:%M').replace(tzinfo=TZ)
    year=pub.year
    month=UA_MONTHS[date_hit.group(2).lower()]
    if pub.month==12 and month==1:year+=1
    if pub.month==1 and month==12:year-=1
    try:day=datetime(year,month,int(date_hit.group(1)),tzinfo=TZ).date().isoformat()
    except ValueError:return None
    check_schedule_date(day,pub,url)
    marker=re.search(r'Години\s+відсутності\s+електропостачання\s*:',full,re.I)
    if not marker:return None
    body=re.split(r'Свою\s+чергу|Перелік\s+адрес|Чат-боти|Сторінка\s+у\s+Telegram|Відключення\s+електроенергії\s+можуть',full[marker.end():],maxsplit=1,flags=re.I)[0]
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


def compose(revisions):
    """Merge revisions without claiming absent queues are 'on'.
    Prior history is retained until later publication cutover, and omitted queues
    keep previous known plan instead of turning green.
    """
    revs=sorted(revisions,key=lambda x:x['publishedAt'])
    if not revs:return None
    day=revs[-1]['date']
    values={q:[-1]*1440 for q in QUEUE}
    for rev in revs:
        pub=datetime.fromisoformat(rev['publishedAt'])
        cutoff=0 if pub.date().isoformat()<day else pub.hour*60+pub.minute
        if cutoff>=1440:continue
        for q,spans in rev['queues'].items():
            if q not in values:continue
            arr=[0]*1440
            for s,e in spans:arr[s:e]=[1]*(e-s)
            values[q][cutoff:]=arr[cutoff:]
    result={}
    for q in QUEUE:
        arr=values[q]
        known=next((i for i,v in enumerate(arr) if v>=0),1440)
        intervals=[];start=None
        for i,v in enumerate(arr+[0]):
            if v==1 and start is None:start=i
            if v!=1 and start is not None:intervals.append([to_time(start),to_time(i)]);start=None
        # even if knownFrom=24:00, JS treats this as unknown for whole day.
        result[q]={'knownFrom':to_time(known),'off':intervals}
    return {'date':day,'publishedAt':revs[-1]['publishedAt'],'source':revs[-1]['source'],
            'verified':True,'queues':result,'revisions':len(revs),
            'publications':[{'publishedAt':r['publishedAt'],'source':r['source'],'queues':sorted(r['queues'])} for r in revs]}


def parse_news_links(html):
    soup=BeautifulSoup(html,'html.parser');urls=[]
    for a in soup.select('a[href]'):
        txt=a.get_text(' ',strip=True).lower()
        u=urljoin(BASE,a['href'])
        if 'графік погодинних відключень' in txt and '/media/' in u and urlparse(u).netloc.endswith('cherkasyoblenergo.com') and u not in urls:urls.append(u)
    return urls


def atomic_write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(path)


def update_schedules(session,now=None):
    now=now or datetime.now(TZ)
    wanted={(now.date()+timedelta(days=i)).isoformat() for i in (-2,-1,0,1,2,3)}
    dest=DATA/'schedules.json'
    try:old=json.loads(dest.read_text('utf-8'))
    except (FileNotFoundError,ValueError):old={'days':[]}
    existing={d['date']:d for d in old.get('days',[]) if d.get('date') in wanted}
    urls=parse_news_links(fetch(session,BASE+'/news?lang=uk'))
    grouped=defaultdict(list)
    review=[]
    for u in urls:
        try:
            rev=parse_article(fetch(session,u),u)
            if rev and rev['date'] in wanted:grouped[rev['date']].append(rev)
        except ScheduleDateConflict as e:
            review.append({'code':'HEADLINE_DATE_CONFLICT','source':e.url,'headlineDate':e.headline_date,
                           'publishedAt':e.published_at,'reason':'Дата графіка суттєво відрізняється від дати публікації. Потрібна ручна перевірка.'})
            LOG.warning('QUARANTINED source date mismatch %s (%s / %s)',e.url,e.headline_date,e.published_at)
        except (requests.RequestException,ValueError) as e:LOG.warning('Article error %s: %s',u,e)
    atomic_write(DATA/'source_review.json',{'schemaVersion':1,'lastChecked':utc_stamp(now),
                                            'rejectedCount':len(review),'items':review[:50]})
    changed=[]
    for day,revs in grouped.items():
        prev=existing.get(day)
        # News discovery is not guaranteed exhaustive. Never rewrite a day if
        # only older revisions are visible today; do not overwrite composite
        # with a less complete partial article.
        latest=compose(revs)
        if prev and prev.get('publishedAt','')>latest['publishedAt']:continue
        if prev and prev.get('publishedAt')==latest['publishedAt']:
            # Existing composite may have retained partial revisions elsewhere.
            continue
        if prev:
            diffs=[]
            for q in QUEUE:
                oldq=prev.get('queues',{}).get(q,{})
                newq=latest['queues'].get(q,{})
                if oldq!=newq:diffs.append(q)
            changed.append({'date':day,'publishedAt':latest['publishedAt'],'source':latest['source'],'queues':diffs})
        existing[day]=latest
    if not existing:raise RuntimeError('No verified schedule articles; retaining previous file')
    old_changes=old.get('changes',[])
    keys={(x.get('date'),x.get('publishedAt')) for x in old_changes}
    for c in changed:
        if (c['date'],c['publishedAt']) not in keys:old_changes.append(c)
    result={'schemaVersion':3,'lastChecked':utc_stamp(now),'source':BASE+'/news',
            'days':[existing[k] for k in sorted(existing)],'changes':old_changes[-100:]}
    atomic_write(dest,result)
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
        for raw in page.get_text('text',sort=True).splitlines():
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
            markers=list(LOCALITY_IN_ROW.finditer(line))
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


def update_addresses(session,now=None):
    now=now or datetime.now(TZ)
    html=fetch(session,BASE+'/perelik-gpv?lang=uk')
    urls=labeled_pdf_links(html)
    if len(urls)!=12:
        raise RuntimeError(f'Only {len(urls)} unambiguously labeled queue PDF links; refusing to guess queue order')
    collected=defaultdict(lambda:defaultdict(set));street_labels=defaultdict(dict);street_q=defaultdict(lambda:defaultdict(set))
    errors=[]
    for queue,url in urls.items():
        try:
            raw=fetch(session,url,True)
            if not raw.startswith(b'%PDF'):raise ValueError('Not a PDF')
            sections=extract_sections(raw)
            for town,content in sections.items():
                key=clean_locality(town)
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
    towns={k:{'keys':{a:sorted(v) for a,v in sorted(collected.get(k,{}).items())},'streets':street_labels[k], 'streetQueues':{x:sorted(v) for x,v in street_q.get(k,{}).items()}} for k in set(street_labels)|set(collected)|set(street_q) if k!=keycity}
    if not towns:
        raise RuntimeError('Village index is empty after parsing all 12 PDFs; refusing to publish broken search')
    city=collected.get(keycity,{})
    result={'schemaVersion':3,'updatedAt':utc_stamp(now),'source':BASE+'/perelik-gpv?lang=uk',
            'keys':{a:sorted(v) for a,v in sorted(city.items())},'streets':street_labels.get(keycity,{}),'streetQueues':{x:sorted(v) for x,v in street_q.get(keycity,{}).items()},
            'localities':towns,'stats':{'city':len(city),'villages':len(towns),'total':sum(len(v) for v in collected.values()),'streetOnly':sum(len(v) for v in street_q.values())}}
    atomic_write(DATA/'addresses.json',result)
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
    session=requests.Session();failed=[]
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
