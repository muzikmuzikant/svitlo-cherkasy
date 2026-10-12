"""Temporary diagnostic for today's real official publication; remove after fix."""
from bs4 import BeautifulSoup
from scripts import update_data as u

URL="https://www.cherkasyoblenergo.com/media/onovleno-hrafik-pohodynnykh-vidklyuchen-hpv-na-12-zhovtnya?lang=uk"

def test_live_updated_article():
    session=u.create_session()
    html=u.fetch(session,URL)
    soup=BeautifulSoup(html,"html.parser")
    full=soup.get_text(" ",strip=True).replace("\xa0"," ").replace("−","-")
    h1=[x.get_text(" ",strip=True) for x in soup.find_all("h1")]
    date=u.HEADLINE_DATE.search(h1[0].lower()) if h1 else None
    pub=u.PUB_TS.search(full)
    marker=u.re.search(r"Години\s+відсутності\s+електропостачання\s*:",full,u.re.I)
    starts=list(u.QUEUE_START.finditer(full[marker.end():])) if marker else []
    sections=[]
    if starts:
        body=full[marker.end():]
        for i,m in enumerate(starts):
            piece=body[m.end():starts[i+1].start() if i+1<len(starts) else len(body)]
            matches=u.INTERVAL.findall(piece)
            sections.append((m.group(1),piece[:100],matches[:5]))
    parsed=u.parse_article(html,URL)
    assert parsed is not None, (f"html_len={len(html)} h1={h1[:3]!r} "
        f"date={bool(date)} pub={pub.groups() if pub else None} "
        f"marker={bool(marker)} starts={len(starts)} "
        f"queues={sections!r} excerpt={full[:1200]!r}")
