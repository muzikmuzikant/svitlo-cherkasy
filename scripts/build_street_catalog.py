#!/usr/bin/env python3
"""Supplement street *names* from public geographic sources, never derive outage queues.

- City of Cherkasy: official municipal GIS street layer.
- Cherkasy area settlements: OSM address street tags with explicit addr:city.
- Never replace previously known names with a failed/partial upstream response.
- A name in this file says NOTHING about the blackout queue of a building.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CATALOG_FILE = DATA / "street_catalog.json"
OFFICIAL_FILE = DATA / "addresses.json"
CITY_STREETS_API = (
    "https://mgis.chmr.gov.ua/server/rest/services/different/"
    "Streets_of_Heroes/MapServer/0/query"
)
OSM_API = "https://overpass.kumi.systems/api/interpreter"
OSM_FALLBACK = "https://overpass-api.de/api/interpreter"
SOURCES = {
    "city": "https://mgis.chmr.gov.ua/server/rest/services/different/Streets_of_Heroes/MapServer/0",
    "district": "https://www.openstreetmap.org/copyright",
}
TYPE_RE = re.compile(
    r"^\s*(?P<type>вулиця|вул\.?|провулок|пров\.?|проспект|просп\.?|"
    r"бульвар|б-р|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\s+",
    flags=re.I,
)
TYPE_NAMES = {
    "вул": "вулиця", "вулиця": "вулиця", "пров": "провулок",
    "провулок": "провулок", "просп": "проспект", "проспект": "проспект",
    "бульвар": "бульвар", "б-р": "бульвар", "узвіз": "узвіз",
    "алея": "алея", "площа": "площа", "майдан": "майдан",
    "шосе": "шосе", "набережна": "набережна", "тупик": "тупик",
    "проїзд": "проїзд"
}
TOWN_ALIASES = {"червонаслобода": "слобода", "первомайське": "соснове",
                "іванівка": "яничі"}
LOG = logging.getLogger("street-catalog")


def normalized(s):
    return re.sub(r"[^\wа-яіїєґ]+", "", str(s or "").lower().replace("’", "").replace("ʼ", ""), flags=re.I)


def town_key(s):
    text = re.sub(r"^\s*(?:м\.?|с\.?|смт\.?|село|місто|селище)\s+", "", str(s or ""), flags=re.I)
    return TOWN_ALIASES.get(normalized(text), normalized(text))


def street_entry(raw, kind_hint="вулиця"):
    text = " ".join(str(raw or "").replace("\xa0", " ").split()).strip(" ,.;:")
    if not 3 <= len(text) <= 105 or not re.search("[А-Яа-яІЇЄҐіїєґ]", text):
        return None
    hit = TYPE_RE.match(text)
    kind = TYPE_NAMES.get(hit.group("type").lower().rstrip("."), kind_hint) if hit else kind_hint
    name = text[hit.end():].strip(" ,.;:") if hit else text
    if (not 2 <= len(name) <= 85 or re.fullmatch(r"[\d/ а-яa-z-]+", name, flags=re.I)
            and not re.search(r"[а-яіїєґ]{3}", name, re.I)
            or re.match(r"^(?:ТОВ|ФОП|ПП|ЖК)\s", name, re.I)):
        return None
    stem = normalized(name)
    if not stem or not re.search("[а-яіїєґ]", stem, re.I):
        return None
    return kind + "|" + stem, kind.capitalize() + " " + name


def collect_city_gis(session):
    """Read only public street labels, never ownership, household or parcel data."""
    result = {}
    offset = 0
    while offset < 30000:
        reply = session.get(CITY_STREETS_API, params={
            "f": "json", "where": "1=1", "outFields": "street_ful",
            "returnGeometry": "false", "resultOffset": offset,
            "resultRecordCount": 2000, "orderByFields": "objectid"
        }, timeout=(10, 35))
        reply.raise_for_status()
        payload = reply.json()
        if "error" in payload:
            raise ValueError("GIS query returned an error: " + str(payload["error"].get("message", "")))
        features = payload.get("features")
        if not isinstance(features, list):
            raise ValueError("GIS response has no features array")
        for row in features:
            entry = street_entry(row.get("attributes", {}).get("street_ful"))
            if entry:
                result[entry[0]] = entry[1]
        offset += len(features)
        if not features or len(features) < 2000:
            break
    if len(result) < 70:
        raise ValueError("City GIS returned suspiciously few street names")
    return result


def collect_osm_address_streets(session, expected_towns):
    """Explicit addr:city prevents assigning a neighbouring village's roads."""
    query = """[out:json][timeout:160];
    area["name"="Черкаська область"]["admin_level"="4"]->.region;
    (
      node(area.region)["addr:city"]["addr:street"];
      way(area.region)["addr:city"]["addr:street"];
      relation(area.region)["addr:city"]["addr:street"];
    );
    out tags;"""
    last_error = None
    for url in (OSM_API, OSM_FALLBACK):
        try:
            reply = session.post(url, data={"data": query}, timeout=(15, 190))
            reply.raise_for_status()
            payload = reply.json()
            if "remark" in payload and not payload.get("elements"):
                raise ValueError(str(payload["remark"])[:200])
            elements = payload.get("elements")
            if not isinstance(elements, list):
                raise ValueError("OSM response has no elements")
            towns = {}
            for element in elements:
                tags = element.get("tags") or {}
                town = town_key(tags.get("addr:city"))
                if town not in expected_towns:
                    continue
                item = street_entry(tags.get("addr:street"))
                if item:
                    towns.setdefault(town, {})[item[0]] = item[1]
            if not any(towns.values()):
                raise ValueError("OSM returned no address streets for the supported towns")
            return towns
        except (requests.RequestException, ValueError) as error:
            last_error = error
            LOG.warning("OSM source unavailable %s: %s", url, error)
    raise RuntimeError("No OSM source succeeded: " + str(last_error))



def _point(element):
    centre = element.get("center", element)
    lat, lon = centre.get("lat"), centre.get("lon")
    try:
        if lat is None or lon is None:
            return None
        return float(lat), float(lon)
    except (TypeError, ValueError):
        return None


def _distance_meters(one, other):
    """Approximate distance for matching within a few kilometres."""
    import math
    lat1, lon1 = one
    lat2, lon2 = other
    avg = math.radians((lat1 + lat2) * 0.5)
    dy = math.radians(lat2 - lat1)
    dx = math.radians(lon2 - lon1) * math.cos(avg)
    return 6371000 * math.hypot(dx, dy)


def extract_roads_near_places(elements, expected_towns):
    """Very conservative geographic matching, never evidence of an outage queue.

    The nearest mapped place must be significantly closer than every competing
    place, including places NOT served by the app; road segments on a border
    are deliberately skipped instead of being assigned to the wrong village.
    """
    centres = []
    for element in elements:
        tags = element.get("tags") or {}
        if not tags.get("place") or not tags.get("name"):
            continue
        coords = _point(element)
        if coords:
            centres.append((town_key(tags["name"]), coords))
    if not centres:
        raise ValueError("No OSM place centres to match road labels")
    results = {}
    for element in elements:
        tags = element.get("tags") or {}
        if not tags.get("highway") or not tags.get("name"):
            continue
        coords = _point(element)
        if coords is None:
            continue
        street = street_entry(tags["name"])
        if not street:
            continue
        nearest = sorted(
            ((_distance_meters(coords, centre), key) for key, centre in centres),
            key=lambda item: item[0]
        )
        best, town = nearest[0]
        # A road on the urban fringe or between two villages is ambiguous.
        if town not in expected_towns or town == "черкаси" or best > 2200:
            continue
        runner_up = next((distance for distance, key in nearest[1:] if key != town), float("inf"))
        if runner_up < best * 1.65 + 450:
            continue
        results.setdefault(town, {})[street[0]] = street[1]
    return results


def collect_osm_roads_near_localities(session, expected_towns):
    """Use named mapped road segments when addr:city tags are absent.

    The query stays inside Cherkasy Raion and includes all settlement labels
    as competing centres, preventing neighbouring localities from sharing
    roads through a simple radius-based search.
    """
    query = """[out:json][timeout:160];
    area["name"="Черкаський район"]["admin_level"="6"]->.region;
    (
      node(area.region)["place"]["name"];
      way(area.region)["highway"~"^(residential|living_street|tertiary|unclassified|pedestrian|service|secondary)$"]["name"];
    );
    out center tags;"""
    last_error = None
    for url in (OSM_API, OSM_FALLBACK):
        try:
            response = session.post(url, data={"data": query}, timeout=(15, 190))
            response.raise_for_status()
            payload = response.json()
            elements = payload.get("elements")
            if not isinstance(elements, list) or not elements:
                raise ValueError("No place/road elements in the region")
            return extract_roads_near_places(elements, expected_towns)
        except (requests.RequestException, ValueError) as error:
            last_error = error
            LOG.warning("Mapped locality road source unavailable %s: %s", url, error)
    raise RuntimeError("No locality road query succeeded: " + str(last_error))


def merge_catalog(previous, city_names, locality_names, official):
    old = previous if isinstance(previous, dict) else {}
    live_localities = official.get("localities", {})
    towns = {}
    for town in sorted(set(live_localities) | set(old.get("localities", {})) | set(locality_names)):
        if town not in live_localities and town not in old.get("localities", {}):
            continue
        old_entry = old.get("localities", {}).get(town, {})
        if not isinstance(old_entry, dict):
            old_entry = {}
        label = live_localities.get(town, {}).get("label") or old_entry.get("label") or town
        names = {**old_entry.get("streets", {}), **locality_names.get(town, {})}
        towns[town] = {"label": label, "streets": dict(sorted(names.items()))}
    city = {**old.get("streets", {}), **city_names}
    return {
        "schemaVersion": 1,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": SOURCES,
        "streets": dict(sorted(city.items())),
        "localities": towns,
        "stats": {
            "city": len(city),
            "localities": len(towns),
            "districtStreets": sum(len(v["streets"]) for v in towns.values()),
            "cityNewThisRun": len(city_names),
            "districtNewThisRun": sum(map(len, locality_names.values()))
        }
    }


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    old = json.loads(CATALOG_FILE.read_text("utf-8")) if CATALOG_FILE.exists() else {}
    official = json.loads(OFFICIAL_FILE.read_text("utf-8"))
    expected = set(official.get("localities", {})) | {"черкаси"}
    session = requests.Session()
    retry = Retry(total=2, connect=2, read=2, backoff_factor=1,
                  status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=frozenset(["GET", "POST"]))
    session.mount("https://", HTTPAdapter(max_retries=retry))
    city = {}
    district = {}
    try:
        city = collect_city_gis(session)
        LOG.info("Official city GIS: %s distinct street names", len(city))
    except Exception as error:
        LOG.warning("City GIS unavailable: %s", error)
    try:
        district = collect_osm_address_streets(session, expected)
        LOG.info("OSM: %s named streets across %s localities",
                 sum(len(x) for x in district.values()), len(district))
    except Exception as error:
        LOG.warning("OSM unavailable: %s", error)
    try:
        mapped = collect_osm_roads_near_localities(session, expected)
        LOG.info("OSM named roads: %s streets assigned conservatively to %s villages",
                 sum(len(x) for x in mapped.values()), len(mapped))
        for town, streets in mapped.items():
            # Explicit address tags (addr:city) are preferred over proximity.
            district.setdefault(town, {})
            district[town] = {**streets, **district[town]}
    except Exception as error:
        LOG.warning("OSM locality street lookup unavailable: %s", error)
    if not city and not district:
        raise RuntimeError("All enrichment sources failed; preserving existing catalogue unchanged")
    if "черкаси" in district:
        city.update(district.pop("черкаси"))
    enriched = merge_catalog(old, city, district, official)
    if old.get("streets") and not set(old["streets"]).issubset(enriched["streets"]):
        raise RuntimeError("City street catalogue lost previous names")
    # Atomic persist, no partial broken JSON file on failure.
    tmp = CATALOG_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(enriched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(CATALOG_FILE)
    LOG.info("Catalogue: %s city names, %s village names",
             enriched["stats"]["city"], enriched["stats"]["districtStreets"])


if __name__ == "__main__":
    main()
