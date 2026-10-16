"""Map tiles, fetched by the server and passed through to the browser.

Going through our own API means the map works anywhere the app itself loads,
even in browsers or networks that can't reach the tile servers directly.
"""

from __future__ import annotations

import requests
from django.conf import settings
from django.core.cache import caches

from . import ProviderError, session

ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
SOURCES = {
    "streets": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "terrain": ESRI + "/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    "satellite": ESRI + "/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "labels": ESRI + "/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
}
MAX_ZOOM = 19
CACHE_TTL_S = 7 * 24 * 3600


def get_tile(style: str, z: int, x: int, y: int) -> tuple[bytes, str]:
    if style not in SOURCES:
        raise KeyError(style)
    if not 0 <= z <= MAX_ZOOM or not (0 <= x < 2**z and 0 <= y < 2**z):
        raise ValueError("Tile out of range.")

    cache = caches["tiles"]
    key = f"tile:{style}:{z}:{x}:{y}"
    if (cached := cache.get(key)) is not None:
        return cached

    try:
        response = session.get(SOURCES[style].format(z=z, x=x, y=y), timeout=settings.ROUTING["HTTP_TIMEOUT_S"])
    except requests.RequestException as exc:
        raise ProviderError(f"Tile server unreachable ({exc.__class__.__name__}).") from exc
    if response.status_code != 200:
        raise ProviderError(f"Tile server returned {response.status_code}.")

    tile = (response.content, response.headers.get("Content-Type", "image/png"))
    cache.set(key, tile, CACHE_TTL_S)
    return tile
