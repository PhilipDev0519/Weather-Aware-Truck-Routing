"""Place search.

Open-Meteo's geocoder answers in well under 100 ms but only knows place names.
Photon also handles street addresses but is much slower (often seconds), so
it's only asked when Open-Meteo finds nothing.
"""

from __future__ import annotations

import hashlib
import re

from django.conf import settings
from django.core.cache import cache

from . import ProviderError, http_get

CACHE_TTL_S = 24 * 3600


def search(query: str, limit: int = 6) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    key = "geo:" + hashlib.sha1(f"{limit}:{query.lower()}".encode()).hexdigest()
    if (cached := cache.get(key)) is not None:
        return cached

    results = _open_meteo(query, limit) or _photon(query, limit)
    cache.set(key, results, CACHE_TTL_S)
    return results


def _open_meteo(query: str, limit: int) -> list[dict]:
    # It matches on the place name only, so "Memphis, Tennessee" has to be
    # searched as "Memphis" and narrowed down by the rest afterwards.
    name, _, rest = query.partition(",")
    name = name.strip()
    if len(name) < 2:
        return []
    response = http_get(
        settings.ROUTING["GEOCODER_URL"],
        {"name": name, "count": 20, "language": "en", "format": "json"},
    )
    if response.status_code != 200:
        return []
    items = _json(response).get("results") or []

    # Its own order puts any exact name first, however small: "Salt Lake" would
    # be Salt Lake, Hawaii rather than Salt Lake City. Prefer places whose name
    # starts with what was typed, then the biggest.
    typed = _simple(name)
    items = sorted(
        items,
        key=lambda item: (not _simple(str(item.get("name", ""))).startswith(typed), -(item.get("population") or 0)),
    )

    places = []
    hint = rest.strip().lower()
    for item in items:
        if "latitude" not in item or "longitude" not in item:
            continue
        parts = [item.get("name"), item.get("admin1"), item.get("country")]
        label = ", ".join(dict.fromkeys(p for p in parts if p))
        if hint and hint not in label.lower():
            continue
        places.append({"label": label, "lat": item["latitude"], "lon": item["longitude"]})
    return places[:limit]


def _photon(query: str, limit: int) -> list[dict]:
    response = http_get(settings.ROUTING["PHOTON_URL"], {"q": query, "limit": limit, "lang": "en"})
    if response.status_code != 200:
        raise ProviderError("Geocoding service is unavailable.")
    features = _json(response).get("features") or []
    return [_photon_place(f) for f in features if (f.get("geometry") or {}).get("coordinates")]


def _simple(text: str) -> str:
    # "St. Louis" and "St Louis" should match
    return re.sub(r"[\W_]+", "", text.lower())


def _json(response) -> dict:
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError("Geocoding service returned an invalid response.") from exc
    return data if isinstance(data, dict) else {}


def _photon_place(feature: dict) -> dict:
    props = feature.get("properties", {})
    lon, lat = feature["geometry"]["coordinates"]
    # e.g. "Memphis, Tennessee, United States"; for cities name and city are the same
    parts = [props.get("name"), props.get("city"), props.get("state"), props.get("country")]
    label = ", ".join(dict.fromkeys(p for p in parts if p))
    return {"label": label or f"{lat:.4f}, {lon:.4f}", "lat": lat, "lon": lon}
