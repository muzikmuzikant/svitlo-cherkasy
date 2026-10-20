"""Street names are independent of electrical queue proof."""
import json
from scripts.build_street_catalog import street_entry, town_key, merge_catalog


def test_name_keys_are_stable_and_never_have_queues():
    assert street_entry("Вулиця Івана Кожедуба") == (
        "вулиця|іванакожедуба", "Вулиця Івана Кожедуба"
    )
    assert street_entry("вул. Філатова") == ("вулиця|філатова", "Вулиця Філатова")
    assert street_entry("провулок Садовий") == ("провулок|садовий", "Провулок Садовий")
    assert street_entry("ТОВ Техніка") is None
    assert town_key("Червона Слобода") == town_key("с. Слобода")


def test_municipal_and_osm_names_preserved_and_only_looked_up_by_locality():
    current = {
        "streets": {"вулиця|лісова": "Вулиця Лісова"},
        "localities": {
            "слобода": {"label": "Слобода", "streets": {"вулиця|польова": "Вулиця Польова"}}
        }
    }
    pdf = {"localities": {
        "слобода": {"label": "Слобода"},
        "хацьки": {"label": "Хацьки"}
    }}
    updated = merge_catalog(
        current, {"вулиця|іванакожедуба": "Вулиця Івана Кожедуба"},
        {"слобода": {"вулиця|філатова": "Вулиця Філатова"},
         "хацьки": {"вулиця|шкільна": "Вулиця Шкільна"},
         "other": {"вулиця|вигадана": "Вулиця Вигадана"}}, pdf
    )
    assert "вулиця|іванакожедуба" in updated["streets"]
    assert "вулиця|лісова" in updated["streets"]
    assert "вулиця|філатова" in updated["localities"]["слобода"]["streets"]
    assert "вулиця|шкільна" not in updated["localities"]["слобода"]["streets"]
    assert "other" not in updated["localities"]
    assert "keys" not in updated
    assert "streetQueues" not in updated
    assert "streetQueues" not in updated["localities"]["слобода"]


def test_current_baseline_has_two_reported_streets():
    from pathlib import Path
    file = Path(__file__).resolve().parents[1] / "data/street_catalog.json"
    baseline = json.loads(file.read_text("utf-8"))
    assert baseline["streets"]["вулиця|іванакожедуба"]
    assert baseline["localities"]["слобода"]["streets"]["вулиця|філатова"]



def test_unlabelled_roads_go_only_to_confident_nearest_village():
    from scripts.build_street_catalog import extract_roads_near_places

    def place(name, lat, lon):
        return {"type": "node", "lat": lat, "lon": lon,
                "tags": {"place": "village", "name": name}}

    def road(name, lat, lon):
        return {"type": "way", "center": {"lat": lat, "lon": lon},
                "tags": {"highway": "residential", "name": name}}

    points = [
        place("Слобода", 49.3000, 32.3000),
        place("Хацьки", 49.3200, 32.3000),
        place("Черкаси", 49.3100, 32.3100),
        place("Інше село", 49.4000, 32.4000),
        road("вулиця Філатова", 49.3002, 32.3001),
        road("вулиця Шкільна", 49.3199, 32.3001),
        road("вулиця Прикордонна", 49.3100, 32.3000),
        road("вулиця Міська", 49.3101, 32.3101),
        road("вулиця Далека", 49.3700, 32.3000)
    ]
    names = extract_roads_near_places(points, {"слобода", "хацьки", "черкаси"})
    assert names["слобода"]["вулиця|філатова"] == "Вулиця Філатова"
    assert names["хацьки"]["вулиця|шкільна"] == "Вулиця Шкільна"
    assert "вулиця|прикордонна" not in names.get("слобода", {})
    assert "вулиця|міська" not in names.get("слобода", {})
    assert "вулиця|далека" not in names.get("слобода", {})
    assert "іншесело" not in names
