"""Truck routes from openrouteservice's heavy-goods-vehicle profile.

Unlike the public OSRM server (cars only), driving-hgv keeps to roads a truck
may use. The truck's gross weight is passed along, so roads with a lower
weight limit are avoided.

Its travel times are another matter: its speeds look tuned to European truck
limits (80 km/h), and it drives rural US interstates at ~44 mph, where trucks
legally do 65-70. ETAs decide which hour's forecast each checkpoint
gets, so the path is timed with OSRM instead (see drive_time_along), capped at
the same truck speed as everywhere else. openrouteservice's own step times
are kept only as the shape: slower in town, faster on the highway. A route
that can't be timed this way is treated as failed, so the routes in one plan
are always compared on the same speeds.

The public API only computes alternatives for trips under 100 km, so this
returns one route per request; route_options.py finds the others through
via-points, the same way it does with OSRM.
"""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from ..geo import LatLon, cumulative, haversine_m
from . import ProviderError, http_request
from .osrm import Route, drive_time_along, make_route

CACHE_TTL_S = 6 * 3600
# If OSRM's path differs by more than this, it took other roads and its time
# isn't this route's time.
MAX_TIMING_PATH_DIFF = 0.03
LBS_PER_TONNE = 2204.62
# openrouteservice error codes that mean "there is no such route", not a failure
NO_ROUTE_CODES = {2009, 2010}  # route not found, no routable point near a coordinate


def is_enabled() -> bool:
    return bool(settings.ROUTING["ORS_API_KEY"])


def gross_lbs(load_lbs: float) -> float:
    return settings.ROUTING["EMPTY_TRUCK_LBS"] + load_lbs


def gross_tonnes(load_lbs: float) -> float:
    """Truck plus load, rounded to the tonne so similar loads share cached routes."""
    return round(gross_lbs(load_lbs) / LBS_PER_TONNE)


def fetch_routes(waypoints: list[LatLon], weight_t: float) -> list[Route]:
    coords = [[round(lon, 5), round(lat, 5)] for lat, lon in waypoints]
    key = "ors:{}:{}t".format(";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in coords), weight_t)
    if (cached := cache.get(key)) is not None:
        return cached

    body = {
        "coordinates": coords,
        "instructions": True,  # the steps carry the travel times
        # Snap to the nearest truck road however far away it is; city centres
        # and via-points often aren't within the default 350 m of one.
        "radiuses": [-1] * len(coords),
        "options": {"vehicle_type": "hgv", "profile_params": {"restrictions": {"weight": weight_t}}},
    }
    response = http_request(
        "POST",
        f"{settings.ROUTING['ORS_URL']}/v2/directions/driving-hgv/geojson",
        json=body,
        headers={"Authorization": settings.ROUTING["ORS_API_KEY"]},
    )
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(f"Truck routing returned an invalid response ({response.status_code}).") from exc

    error = data.get("error") if isinstance(data, dict) else None
    if response.status_code == 200 and not error:
        routes = [_parse_route(feature) for feature in data.get("features", [])]
    elif isinstance(error, dict) and error.get("code") in NO_ROUTE_CODES:
        routes = []
    else:
        message = error.get("message") if isinstance(error, dict) else error
        raise ProviderError(f"Truck routing failed: {message or response.status_code}")
    cache.set(key, routes, CACHE_TTL_S)
    return routes


def _parse_route(feature: dict) -> Route:
    coords = [(lat, lon) for lon, lat in feature["geometry"]["coordinates"]]
    seg_dist = [haversine_m(a, b) for a, b in zip(coords, coords[1:])]
    seg_time = [0.0] * len(seg_dist)

    # Each instruction step covers a run of vertices and gives its total time;
    # spread that over the step's segments by length. Steps are short in towns
    # and long on highways, where the speed is fairly even anyway.
    for segment in feature["properties"].get("segments", []):
        for step in segment.get("steps", []):
            first, last = step["way_points"]
            length = sum(seg_dist[first:last])
            for i in range(first, last):
                seg_time[i] = step["duration"] * (seg_dist[i] / length if length else 1 / (last - first))

    if not any(seg_time):
        # No steps came back: spread the total time over the whole route.
        total = sum(seg_dist) or 1.0
        duration = feature["properties"]["summary"]["duration"]
        seg_time = [duration * d / total for d in seg_dist]
    return make_route(coords, seg_dist, _us_truck_times(coords, seg_dist, seg_time))


def _us_truck_times(coords: list[LatLon], seg_dist: list[float], seg_time: list[float]) -> list[float]:
    """Rescale the step times so the whole path takes as long as OSRM says."""
    length = sum(seg_dist)
    ors_s = sum(seg_time)
    if len(coords) < 2 or not length or not ors_s:
        return seg_time
    osrm_s, osrm_m = drive_time_along(coords, cumulative(seg_dist))
    if abs(osrm_m - length) / length > MAX_TIMING_PATH_DIFF:
        raise ProviderError(f"Could not time the truck route (timed path {osrm_m:.0f} m vs {length:.0f} m).")
    return [t * osrm_s / ors_s for t in seg_time]
