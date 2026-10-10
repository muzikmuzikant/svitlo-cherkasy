import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import update_data as importer

class FakePDFPage:
    def __init__(self, text):self.text=text
    def get_text(self,*args,**kwargs):return self.text

def test_realistic_official_pdf_style(monkeypatch):
    import fitz
    text='''ВСП Черкаські ЕМ
с.Яснозір’я: вул.Центральна, вул.Вербна, вул.Спартака,
вул.Гоголя, вул.Садова, вул.Зелена
с.Лозівок: ТОВ ТПК Промдизель
с.Слобода: вул.Лісова, вул.Б.Вишнивецького, вул.Соборна, вул.Польова,
Свердловини Сільської Ради
Чорнобаївська філія
вул. Не-має 100
ВСП Черкаські міські енергетичні мережі
вул. Благовісна 244, 270'''
    monkeypatch.setattr(fitz,'open',lambda **kwargs:[FakePDFPage(text)])
    sections=importer.extract_sections(b'%PDF-fake')
    assert set(sections)=={'Яснозір’я','Лозівок','Слобода','Черкаси'}
    assert 'Не-має' not in str(sections)
    assert '244' in sections['Черкаси']
    hints=importer.street_only_entries(sections['Слобода'])
    assert ('вулиця','лісова','Лісова') in hints
    assert ('вулиця','бвишнивецького','Б.Вишнивецького') in hints
    assert ('вулиця','польова','Польова') in hints
    assert not importer.street_entries(sections['Слобода'])  # no inventing house numbers

def test_official_name_aliases():
    assert importer.clean_locality('Червона Слобода')=='слобода'
    assert importer.clean_locality('с. Слобода')=='слобода'
    assert importer.clean_locality('Первомайське')=='соснове'
    assert importer.clean_locality('Іванівка')=='яничі'


def test_twelve_pdf_import_populates_district_keys_and_hints(monkeypatch,tmp_path):
    import fitz
    marker='''ВСП Черкаські ЕМ
с.Слобода: вул.Лісова, вул.Соборна, вул.Польова,
с.Хацьки: вул.Молодіжна 12, 14, 16
ВСП Черкаські міські енергетичні мережі
вул. Благовісна 244, 270'''
    monkeypatch.setattr(fitz,'open',lambda **kwargs:[FakePDFPage(marker)])
    monkeypatch.setattr(importer,'DATA',tmp_path)
    urls={q:f'https://www.cherkasyoblenergo.com/{q}.pdf' for q in importer.QUEUE}
    monkeypatch.setattr(importer,'labeled_pdf_links',lambda html:urls)
    monkeypatch.setattr(importer,'fetch',lambda session,url,binary=False:(b'%PDF-stub' if binary else '<html/>'))
    result=importer.update_addresses(None)
    assert result['stats']['villages']>=2
    assert result['localities']['слобода']['streetQueues']['вулиця|лісова']==importer.QUEUE
    assert result['localities']['хацьки']['keys']['вулиця|молодіжна|12']==importer.QUEUE
    assert 'вулиця|лісова|12' not in result['localities']['слобода']['keys']
    assert result['keys']['вулиця|благовісна|244']==importer.QUEUE
    assert (tmp_path/'addresses.json').exists()
