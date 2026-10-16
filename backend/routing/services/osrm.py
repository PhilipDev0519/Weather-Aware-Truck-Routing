from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from ..geo import METERS_PER_MILE, LatLon, bearing_deg, cumulative, haversine_m
from . import ProviderError, http_get

CACHE_TTL_S = 6 * 3600  # roads don't change; this makes repeat plans instant
PATH_SAMPLE_M = 20_000  # waypoint spacing when timing a given path
WAYPOINTS_PER_REQUEST = 80  # the public server refuses URLs much longer than ~100 points


@dataclass
class Route:
    coords: list[LatLon]
    cum_dist_m: list[float]  # one per vertex, starting at 0
    cum_time_s: list[float]  # same, using truck speeds

    @property
    def distance_m(self) -> float:
        return self.cum_dist_m[-1]

    @property
    def duration_s(self) -> float:
        return self.cum_time_s[-1]


def fetch_routes(waypoints: list[LatLon], alternatives: int = 0) -> list[Route]:
    coords = ";".join(f"{lon:.5f},{lat:.5f}" for lat, lon in waypoints)
    key = f"osrm:{coords}:{alternatives}"
    if (cached := cache.get(key)) is not None:
        return cached

    params = {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "duration,distance",
        "steps": "false",
        "alternatives": str(alternatives) if alternatives else "false",
    }
    response = http_get(f"{settings.ROUTING['OSRM_URL']}/route/v1/driving/{coords}", params)
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError("Routing service returned an invalid response.") from exc

    # NoSegment: a point isn't near any road (e.g. out at sea)
    if data.get("code") in ("NoRoute", "NoSegment"):
        routes = []
    elif data.get("code") == "Ok":
        routes = [_parse_route(r) for r in data.get("routes", [])]
    else:
        raise ProviderError(f"Routing failed: {data.get('message') or data.get('code')}")
    cache.set(key, routes, CACHE_TTL_S)
    return routes


def _parse_route(raw: dict) -> Route:
    coords = [(lat, lon) for lon, lat in raw["geometry"]["coordinates"]]
    seg_dist: list[float] = []
    seg_time: list[float] = []
    for leg in raw.get("legs", []):
        annotation = leg.get("annotation") or {}
        seg_dist.extend(annotation.get("distance", []))
        seg_time.extend(annotation.get("duration", []))

    if len(seg_dist) != len(coords) - 1 or len(seg_time) != len(coords) - 1:
        # Shouldn't happen, but if the annotations don't line up with the
        # geometry, spread the total time over the segments by length.
        seg_dist = [haversine_m(a, b) for a, b in zip(coords, coords[1:])]
        total = sum(seg_dist) or 1.0
        seg_time = [raw["duration"] * d / total for d in seg_dist]

    return make_route(coords, seg_dist, seg_time)


def make_route(coords: list[LatLon], seg_dist: list[float], seg_time: list[float]) -> Route:
    """A Route from per-segment lengths (m) and times (s), capped at truck speed.

    The public OSRM server only has a car profile, so this cap is what makes
    its times truck times. Truck routers are already slower; the cap rarely
    touches them.
    """
    max_speed = settings.ROUTING["TRUCK_MAX_SPEED_MPH"] * METERS_PER_MILE / 3600
    truck_time = [max(t, d / max_speed) for d, t in zip(seg_dist, seg_time)]
    return Route(coords=coords, cum_dist_m=cumulative(seg_dist), cum_time_s=cumulative(truck_time))


def drive_time_along(coords: list[LatLon], cum_dist_m: list[float]) -> tuple[float, float]:
    """OSRM's driving time (capped at truck speed) and distance along a given path.

    The path is sampled every ~20 km and routed through those points. Each
    point carries the path's direction, so on a divided highway it snaps to the
    carriageway going the right way instead of forcing a U-turn. Long paths go
    in several requests, each starting where the last one ended.
    """
    picks = [0]
    for i, d in enumerate(cum_dist_m):
        if d - cum_dist_m[picks[-1]] >= PATH_SAMPLE_M:
            picks.append(i)
    if picks[-1] != len(coords) - 1:
        picks.append(len(coords) - 1)

    seconds = distance = 0.0
    for start in range(0, len(picks) - 1, WAYPOINTS_PER_REQUEST - 1):
        chunk = picks[start : start + WAYPOINTS_PER_REQUEST]
        s, d = _drive_time_through(coords, chunk)
        seconds += s
        distance += d
    return seconds, distance


def _drive_time_through(coords: list[LatLon], picks: list[int]) -> tuple[float, float]:
    points = ";".join(f"{coords[i][1]:.5f},{coords[i][0]:.5f}" for i in picks)
    bearings = []
    for i in picks:
        if i == 0 or i == len(coords) - 1:
            bearings.append("")  # no constraint at the two ends of the route
        else:
            bearings.append(f"{round(bearing_deg(coords[i - 1], coords[i + 1]))},45")
    params = {
        "overview": "false",
        "annotations": "duration,distance",
        "continue_straight": "true",
        "bearings": ";".join(bearings),
    }
    response = http_get(f"{settings.ROUTING['OSRM_URL']}/route/v1/driving/{points}", params)
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(f"Routing service returned an invalid response ({response.status_code}).") from exc
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ProviderError(f"Could not time the route: {data.get('message') or data.get('code')}")

    max_speed = settings.ROUTING["TRUCK_MAX_SPEED_MPH"] * METERS_PER_MILE / 3600
    seconds = distance = 0.0
    for leg in data["routes"][0]["legs"]:
        annotation = leg.get("annotation") or {}
        for d, t in zip(annotation.get("distance", []), annotation.get("duration", [])):
            seconds += max(t, d / max_speed)
            distance += d
    return seconds, distance
