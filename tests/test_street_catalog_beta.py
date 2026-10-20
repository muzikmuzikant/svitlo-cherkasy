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


def test_full_municipal_street_layer_paginates_and_excludes_queues():
    from scripts.build_street_catalog import collect_city_gis, CITY_STREETS_API

    assert '/opora/Streets_WGS84/MapServer/0/query' in CITY_STREETS_API
    class Reply:
        def raise_for_status(self): pass
        def json(self):
            return {'features': [{'attributes': {'street_ful': f'вулиця Героїв {i}'}} for i in range(1, 105)]}
    class Source:
        def get(self, url, params, timeout):
            assert url == CITY_STREETS_API
            assert params['returnGeometry'] == 'false'
            assert params['outFields'] == 'street_ful'
            return Reply()
    streets=collect_city_gis(Source())
    assert len(streets) == 104
    assert 'вулиця|героїв15' in streets
    assert not any('queue' in key.lower() for key in streets)


def test_overpass_queries_are_local_and_use_functional_mirror():
    from pathlib import Path
    text=(Path(__file__).resolve().parents[1]/'scripts/build_street_catalog.py').read_text('utf8')
    assert 'overpass.private.coffee' in text
    assert 'area["name"="Черкаський район"]["admin_level"="6"]' in text
    assert 'session.headers.update' in text
    assert 'Origin' in text
