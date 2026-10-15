"""Regression checks for a complete but safe district address catalogue."""
import copy
import json
from pathlib import Path
from scripts.update_data import preserve_street_catalogue

DATA=Path(__file__).resolve().parents[1]/'data'
live=json.loads((DATA/'addresses.json').read_text('utf8'))
historical=json.loads((DATA/'published_street_fallback.json').read_text('utf8'))

def test_all_sloboda_streets_are_already_in_current_import():
    village=live['localities']['слобода']
    old=historical['localities']['слобода']
    assert set(old['streets']) <= set(village['streets'])
    assert len(village['streets']) >= 96
    # Until the parser refresh, legacy labels stay searchable without guessed
    # queues. After a successful refresh, fresh PDF mappings take precedence.
    key='вулиця|різдвяна'
    if key in village.get('archiveOnlyStreets',[]):
        assert key not in village['streetQueues']
        assert village['archivedStreetQueues'][key] == old['streetQueues'][key]
    else:
        assert key in village['streetQueues']

def test_next_import_retains_old_names_but_never_promotes_old_queues():
    next_run={'streets':{},'keys':{},'streetQueues':{'вулиця|лісова':['6.2']},
              'localities':{'слобода':{'streets':{'вулиця|лісова':'Вулиця Лісова'},
                                      'keys':{},'streetQueues':{'вулиця|лісова':['6.2']}}},
              'stats':{}}
    preserve_street_catalogue(next_run,live,historical)
    village=next_run['localities']['слобода']
    assert len(village['streets']) >= 96
    assert village['streetQueues']['вулиця|лісова'] == ['6.2']
    assert 'вулиця|лісова' not in village.get('archiveOnlyStreets',[])
    assert 'вулиця|різдвяна' in village['archiveOnlyStreets']
    assert 'вулиця|різдвяна' not in village['streetQueues']
    assert set(village['archivedStreetQueues']['вулиця|різдвяна']) == set(
        historical['localities']['слобода']['streetQueues']['вулиця|різдвяна'])

def test_third_import_never_reclassifies_an_archived_label_as_freshly_verified():
    first=copy.deepcopy(live)
    second={'streets':{},'keys':{},'streetQueues':{},
            'localities':{'слобода':{'streets':{},'streetQueues':{},'keys':{}}},
            'stats':{}}
    preserve_street_catalogue(second,first,{})
    saved=second['localities']['слобода']
    assert set(first['localities']['слобода']['streets']) <= set(saved['streets'])
    assert len(saved.get('archiveOnlyStreets',[])) == len(saved['streets'])
    assert saved['streetQueues'] == {}
