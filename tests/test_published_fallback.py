"""Official street-only rows must never be mistaken for confirmed house matches."""
import json
from pathlib import Path
from scripts import update_data as im

DATA=Path(__file__).resolve().parents[1]/'data'/'published_street_fallback.json'

def test_sloboda_street_fallback_is_house_free_and_source_grounded():
    doc=json.loads(DATA.read_text('utf8'))
    loc=doc['localities']['слобода']
    assert len(loc['streets'])>=90
    assert loc['keys']=={}
    assert loc['streetQueues']['вулиця|соборна']==['1.1','4.1','6.1']
    assert loc['streetQueues']['вулиця|героївмайдану']==['5.1']
    assert set(loc['sources'])=={'1.1','4.1','5.1','6.1'}
    assert all(url.endswith('.pdf') and url.startswith('https://www.cherkasyoblenergo.com/') for url in loc['sources'].values())

def test_street_only_parser_allows_numbered_street_names_and_line_end():
    text='с.Слобода: вул.50 років Перемоги, вул.Іллі Іделя, пров. Тихий вул.Чигиринський шлях, вул.Садова 18, 22'
    triples=im.street_only_entries(text)
    assert ('вулиця','50роківперемоги','50 років Перемоги') in triples
    assert ('вулиця','іллііделя','Іллі Іделя') in triples
    assert ('провулок','тихий','Тихий') in triples
    assert ('вулиця','чигиринськийшлях','Чигиринський шлях') in triples
    assert ('вулиця','садова','Садова') in triples
    assert all('18' not in v[2] for v in triples)
