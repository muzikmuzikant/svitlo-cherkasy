"""Emergency regression: 17 October schedule hidden by unreadable revision."""
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from scripts import update_data as u

TZ = ZoneInfo("Europe/Kyiv")
BASE = "https://www.cherkasyoblenergo.com/media/"
ORIGINAL = BASE + "hrafik-pohodynnykh-vidklyuchen-hpv-na-17-zhovtnya"
REVISION = ORIGINAL + "-1"
NEWS = ('<html><title>Новини</title><body><a href="' + REVISION +
        '">Графік погодинних відключень (ГПВ) на 17 жовтня</a></body></html>')
ARTICLE = """<html><body><p>16.10.2026 23:00</p>
<h1>Графік погодинних відключень (ГПВ) на 17 жовтня</h1>
<p>Години відсутності електропостачання:</p>
<p>1.1 10:00 - 12:00, 16:00 - 18:00, 20:00 - 22:00</p>
<p>1.2 10:00 - 12:00, 14:00 - 16:00, 20:00 - 22:00</p>
<p>2.1 08:00 - 10:00, 14:00 - 16:00, 18:00 - 20:00, 22:00 - 24:00</p>
<p>2.2 08:00 - 10:00, 14:00 - 16:00, 18:00 - 20:00</p>
<p>3.1 08:00 - 10:00, 12:00 - 14:00, 18:00 - 20:00</p>
<p>3.2 08:00 - 10:00, 12:00 - 14:00, 18:00 - 20:00</p>
<p>4.1 10:00 - 12:00, 14:00 - 16:00, 18:00 - 20:00</p>
<p>4.2 10:00 - 12:00, 14:00 - 16:00, 20:00 - 22:00</p>
<p>5.1 12:00 - 14:00, 16:00 - 18:00, 20:00 - 22:00</p>
<p>5.2 10:00 - 12:00, 16:00 - 18:00, 20:00 - 22:00</p>
<p>6.1 06:00 - 08:00, 12:00 - 14:00, 16:00 - 18:00, 22:00 - 24:00</p>
<p>6.2 06:00 - 08:00, 12:00 - 14:00, 16:00 - 18:00, 22:00 - 24:00</p>
<p>Свою чергу можна дізнатися у ботах</p></body></html>"""


def test_unreadable_latest_article_recovers_original_verified_day(monkeypatch, tmp_path):
    monkeypatch.setattr(u, "DATA", tmp_path)

    def source(_session, url):
        if "/news?" in url:
            return NEWS
        if url == REVISION:
            return "<html><h1>Публікація без таблиці</h1></html>"
        if url == ORIGINAL:
            return ARTICLE
        raise requests.RequestException("Article not found")

    monkeypatch.setattr(u, "fetch", source)
    result = u.update_schedules(None, now=datetime(2026, 10, 17, 0, 22, tzinfo=TZ))
    graph = next(day for day in result["days"] if day["date"] == "2026-10-17")
    assert graph["verified"] is True
    assert graph["source"] == ORIGINAL
    assert graph["queues"]["1.1"]["off"] == [
        ["10:00", "12:00"], ["16:00", "18:00"], ["20:00", "22:00"]]
    assert graph["queues"]["6.2"]["off"][-1] == ["22:00", "24:00"]
    assert len(graph["queues"]) == 12
    assert "2026-10-17" not in result["confirmedNoScheduleDates"]
    # Newer unreadable publications remain visible for audit.
    assert result["reviewPending"] is True
    assert result["unresolvedDates"] == ["2026-10-17"]
