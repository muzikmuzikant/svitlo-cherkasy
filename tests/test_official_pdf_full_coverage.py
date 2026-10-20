"""Regression for Oct 2026 official operator PDFs and non-silent house loss."""
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import pytest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import update_data as i

def test_200_plus_house_numbers_after_one_pdf_street_name():
    # The official PDF's Nadpilna/Narbutivska row is much longer than 500 chars.
    listed=', '.join(str(n) for n in range(1,251))
    assert len(listed)>500
    text='вул. Надпільна '+listed+', вул. Нарбутівська 2, 4, 6'
    rows=i.street_entries(text)
    nadpilna={house for kind,name,house,label in rows
              if kind=='вулиця' and name=='надпільна'}
    narbutivska={house for kind,name,house,label in rows
                 if kind=='вулиця' and name=='нарбутівська'}
    assert len(nadpilna)==250, f'Silently discarded {250-len(nadpilna)} houses'
    assert {'1','75','150','200','250'} <= nadpilna
    assert narbutivska=={'2','4','6'}

def test_80_streets_after_one_pdf_street_prefix():
    # City/district tables also list street-only continuations without "вул".
    words=['Садова'+chr(0x0430+n//30)+chr(0x0430+n%30) for n in range(80)]
    rows=i.street_only_entries('вул. '+', '.join(words))
    assert len({k for _,k,_ in rows})==80, 'Importer capped hints at 35'

def test_pdf_source_metadata_requires_matching_label(monkeypatch):
    import fitz
    class FakePage:
        def __init__(self,title):self.title=title
        def get_text(self,*args,**kwargs):return self.title
    def fakeopen(**kwargs):
        return [FakePage('1 черга. І підчерга\nЧеркаські міські ЕМ')]
    monkeypatch.setattr(fitz,'open',fakeopen)
    r=i.pdf_source_metadata(b'%PDF-fixture','1.1')
    assert r['verifiedPdfTitleQueue']=='1.1'
    assert r['pages']==1
    assert len(r['sha256'])==64
    with pytest.raises(RuntimeError,match='website lists it as 2.1'):
        i.pdf_source_metadata(b'%PDF-fixture','2.1')

def test_data_audit_has_12_sources_and_flags_same_house_multiple_queues():
    locations={'keys':{'вулиця|соборна|4':['1.1','3.1'],
                       'вулиця|соборна|6':['1.1']},
               'streets':{'вулиця|соборна':'Вулиця Соборна'},
               'streetQueues':{'вулиця|соборна':['1.1','3.1']},
               'localities':{'слобода':{'label':'Слобода','keys':{},
                           'streets':{'вулиця|миру':'Вулиця Миру'},
                           'streetQueues':{'вулиця|миру':['5.1']}}}}
    files=[{'queue':q,'url':'https://www.cherkasyoblenergo.com/test.pdf',
            'pages':1,'sha256':'a'*64,
            'cityHouseMentions':0,'districtHouseMentions':0,
            'cityStreetMentions':0,'districtStreetMentions':0,'localities':1}
           for q in i.QUEUE]
    data=i.address_audit(locations,files,now=datetime(2026,10,20,tzinfo=ZoneInfo('Europe/Kyiv')))
    assert data['verifiedPdfCount']==12
    assert data['totals']['conflictedHouseKeys']==1
    assert data['totals']['indexedCityHouseKeys']==2
    assert data['queues']['1.1']['houses']==2
    assert data['queues']['3.1']['houses']==1
    assert data['localities']['слобода']['indexedHouses']==0
    with pytest.raises(RuntimeError,match='lacks'):
        i.address_audit(locations,files[:-1])

def test_audit_does_not_claim_unlisted_village_houses_as_verified(monkeypatch,tmp_path):
    import fitz
    class FakePage:
        def get_text(self,*a,**kw):
            return ('ВСП Черкаські районні ЕМ\n'
                    'с.Слобода: вул.Соборна, вул.Лісова\n'
                    'ВСП Черкаські міські ЕМ\n'
                    'вул.Надпільна 1, 3')
    monkeypatch.setattr(fitz,'open',lambda **kw:[FakePage()])
    monkeypatch.setattr(i,'DATA',tmp_path)
    monkeypatch.setattr(i,'labeled_pdf_links',lambda html:
                        {q:f'https://www.cherkasyoblenergo.com/{q}.pdf' for q in i.QUEUE})
    monkeypatch.setattr(i,'fetch',lambda session,url,binary=False:
                        b'%PDF-stub' if binary else 'html')
    current=i.update_addresses(None)
    import json
    audit=json.loads((tmp_path/'address_audit.json').read_text('utf-8'))
    assert current['localities']['слобода']['keys']=={}
    assert audit['localities']['слобода']['indexedHouses']==0
    assert audit['localities']['слобода']['operatorStreets']==2
    assert audit['verifiedPdfCount']==12


def test_pdf_numbered_cherkasy_street_names_preserve_exact_house_numbers():
    cases=[
        ('вул. 14-го Грудня 12, 14, 16', '14гогрудня', {'12','14','16'}),
        ('вул. 14 Грудня 12, 14', '14грудня', {'12','14'}),
    ]
    for text,name,expected in cases:
        found={house for kind,street,house,label in i.street_entries(text)
               if kind=='вулиця' and street==name}
        assert found==expected
    hints=i.street_only_entries('вул. 14-го Грудня, 14 Грудня, Лісова')
    assert ('вулиця','14гогрудня','14-го Грудня') in hints
    assert ('вулиця','14грудня','14 Грудня') in hints

def test_apartment_subaddresses_are_never_invented_as_whole_house_queues():
    text='вул. Симиренківська 2/2 кв 3, 2/1, 2/2, 4, 9, 10'
    got={house for kind,street,house,label in i.street_entries(text)
         if street=='симиренківська'}
    assert got=={'2/1','2/2','4','9','10'}, got
    # The apartment number 3 is not a verified full building on its own.
    assert '3' not in got

def test_special_asterisk_notation_is_not_turned_into_a_different_house():
    text='вул. Гетьмана Сагайдачного 223*1, 223*2, 225*1, 225, 227, 233'
    got={house for kind,street,house,label in i.street_entries(text)
         if street=='гетьманасагайдачного'}
    assert got=={'225','227','233'}, got
    assert '223' not in got
    assert '2231' not in got
    assert i.parse_house_numbers('12-А, 12/1, 12, 15')==['12а','12/1','12','15']
