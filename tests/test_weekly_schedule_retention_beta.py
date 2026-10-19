"""Beta: purge Mon-Sat on Sunday 00:00 Kyiv but preserve Sunday until Monday."""
from datetime import datetime
from zoneinfo import ZoneInfo
from scripts import update_data as source

TZ=ZoneInfo("Europe/Kyiv")
NEWS='<html><head><title>Новини Черкасиобленерго</title></head><body><a href="/media/notice">Оголошення</a></body></html>'

def test_sunday_midnight_discards_old_weekdays_but_preserves_sunday(monkeypatch,tmp_path):
    monkeypatch.setattr(source,'DATA',tmp_path)
    monkeypatch.setattr(source,'fetch',lambda _session,_url:NEWS)
    monday=datetime(2026,10,12,10,0,tzinfo=TZ)
    initial=source.update_schedules(None,now=monday)
    initial['days']=[
      {'date':'2026-10-12','verified':True,'source':'https://www.cherkasyoblenergo.com/media/a',
       'publishedAt':'2026-10-12T08:00+03:00','queues':{'1.1':{'knownFrom':'00:00','off':[['10:00','12:00']]}}},
      {'date':'2026-10-15','verified':True,'source':'https://www.cherkasyoblenergo.com/media/b',
       'publishedAt':'2026-10-15T10:00+03:00','queues':{'1.1':{'knownFrom':'00:00','off':[['18:00','20:00']]}}},
      {'date':'2026-10-18','verified':True,'source':'https://www.cherkasyoblenergo.com/media/c',
       'publishedAt':'2026-10-17T19:00+03:00','queues':{'1.1':{'knownFrom':'00:00','off':[['16:00','18:00']]}}},
    ]
    initial['days'].append(
      {'date':'2026-10-23','verified':True,'source':'https://www.cherkasyoblenergo.com/media/f',
       'publishedAt':'2026-10-17T19:00+03:00','queues':{'1.1':{'knownFrom':'00:00','off':[['17:00','19:00']]}}})
    source.atomic_write(tmp_path/'schedules.json',initial)

    saturday=source.update_schedules(None,now=datetime(2026,10,17,23,59,tzinfo=TZ))
    assert [x['date'] for x in saturday['days']]==['2026-10-12','2026-10-15','2026-10-18']

    # Simulate a verified next-week publication arriving before the Sunday
    # cutover: it must not disappear while old Mon-Sat are being cleared.
    saturday['days'].append(
      {'date':'2026-10-23','verified':True,'source':'https://www.cherkasyoblenergo.com/media/next-friday',
       'publishedAt':'2026-10-17T23:59+03:00','queues':{'1.1':{'knownFrom':'00:00','off':[['09:00','11:00']]}}})
    source.atomic_write(tmp_path/'schedules.json',saturday)

    sunday=source.update_schedules(None,now=datetime(2026,10,18,0,0,tzinfo=TZ))
    assert [x['date'] for x in sunday['days']]==['2026-10-18','2026-10-23']
    assert sunday['days'][0]['queues']['1.1']['off']==[['16:00','18:00']]
    assert sunday['days'][1]['queues']['1.1']['off']==[['09:00','11:00']]

    monday=source.update_schedules(None,now=datetime(2026,10,19,0,0,tzinfo=TZ))
    assert [x['date'] for x in monday['days']]==['2026-10-23']
    assert '2026-10-19' in monday['confirmedNoScheduleDates']
