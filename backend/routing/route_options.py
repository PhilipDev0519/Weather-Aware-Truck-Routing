"""Find three different routes between two points.

Routes come from openrouteservice's truck profile when an API key is set, and
from the public OSRM server (cars, capped at truck speed) otherwise or if the
truck service fails. Neither gives three alternatives on its own for a long
trip, so the rest come from routing through a via-point pushed off to one side
of the straight line between the two places.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from django.core.cache import cache

from . import hos
from .geo import LatLon, PointIndex, cumulative, point_at, resample
from .services import ProviderError, ors
from .services.osrm import Route, fetch_routes

logger = logging.getLogger(__name__)

ROUTE_COUNT = 3
MAX_SLOWDOWN = 1.5  # driving time, compared with the fastest route
MAX_TRIP_SLOWDOWN = 1.5  # door-to-door, rest stops included
MAX_SHARED_FRACTION = 0.8
MAX_BACKTRACK_M = 3_000
CACHE_TTL_S = 6 * 3600

# (how far along the fastest route, sideways offset as a share of trip length)
# fmt: off
VIA_CANDIDATES = [
    (0.5, 0.15), (0.5, -0.15),
    (0.5, 0.3), (0.5, -0.3),
    (0.33, 0.2), (0.33, -0.2),
    (0.67, 0.2), (0.67, -0.2),
    # Tighter detours, tried last. Wide ones often add enough driving to need
    # an overnight rest; these find a nearby parallel road instead.
    (0.5, 0.07), (0.5, -0.07),
    (0.25, 0.1), (0.25, -0.1),
    (0.75, 0.1), (0.75, -0.1),
]
# fmt: on

Fetch = Callable[[list[LatLon]], list[Route]]


@dataclass
class RouteOptions:
    routes: list[Route]
    warnings: list[str] = field(default_factory=list)
    profile: str = "car"  # "truck" (openrouteservice HGV) or "car" (OSRM)
    gross_lbs: float | None = None  # truck + load, for truck routing
    # False when a via-point request failed, so a better set may exist; not cached.
    complete: bool = True


def route_options(origin: LatLon, destination: LatLon, load_lbs: float = 0) -> RouteOptions:
    ends = "{:.4f},{:.4f}:{:.4f},{:.4f}".format(*origin, *destination)
    note = None
    if ors.is_enabled():
        weight_t = ors.gross_tonnes(load_lbs)
        try:
            options = _cached(f"options:hgv{weight_t}:{ends}", lambda: _truck_options(origin, destination, weight_t))
            # Loads within the same tonne share cached routes, so set the exact weight here.
            options.gross_lbs = ors.gross_lbs(load_lbs)
            return options
        except ProviderError as exc:
            logger.warning("Truck routing failed, using OSRM: %s", exc)
            note = f"Truck routing is unavailable right now ({exc}), so these are car routes capped at truck speed."

    options = _cached(f"options:car:{ends}", lambda: _car_options(origin, destination))
    if note:
        options.warnings.insert(0, note)
    return options


def _cached(key: str, find: Callable[[], RouteOptions]) -> RouteOptions:
    if (cached := cache.get(key)) is not None:
        return cached
    result = find()
    if result.complete:
        cache.set(key, result, CACHE_TTL_S)
    return result


def _car_options(origin: LatLon, destination: LatLon) -> RouteOptions:
    routes, warnings, complete = _find_options(origin, destination, _osrm_main, _osrm_via)
    return RouteOptions(routes, warnings, profile="car", complete=complete)


def _osrm_main(waypoints: list[LatLon]) -> list[Route]:
    return fetch_routes(waypoints, ROUTE_COUNT)  # ask OSRM for its own alternatives too


def _osrm_via(waypoints: list[LatLon]) -> list[Route]:
    return fetch_routes(waypoints)


def _truck_options(origin: LatLon, destination: LatLon, weight_t: float) -> RouteOptions:
    failures: list[ProviderError] = []

    def fetch(waypoints: list[LatLon]) -> list[Route]:
        try:
            return ors.fetch_routes(waypoints, weight_t)
        except ProviderError as exc:
            failures.append(exc)
            raise

    routes, warnings, complete = _find_options(origin, destination, fetch, fetch)
    # Running out of daily quota half-way would leave fewer than three options;
    # car routes for all three are more useful than a short list.
    if len(routes) < ROUTE_COUNT and failures:
        raise failures[0]
    return RouteOptions(routes, warnings, profile="truck", complete=complete)


def _find_options(
    origin: LatLon, destination: LatLon, fetch_main: Fetch, fetch_via: Fetch
) -> tuple[list[Route], list[str], bool]:
    """The options, any warnings, and whether every via-point request worked."""
    vias = [_via_point(origin, destination, f, o) for f, o in VIA_CANDIDATES]
    failed: list[LatLon] = []

    def try_via(v: LatLon) -> list[Route]:
        try:
            return fetch_via([origin, v, destination])
        except ProviderError as exc:
            # One flaky request shouldn't fail the plan, but it can leave a worse
            # third route, so the result isn't cached and the next plan retries.
            logger.warning("Via-point route failed: %s", exc)
            failed.append(v)
            return []

    pool = ThreadPoolExecutor(max_workers=5)
    try:
        # The router rarely gives three alternatives on its own, so the first
        # via-point routes are requested at the same time as the main one.
        main = pool.submit(fetch_main, [origin, destination])
        batch = [pool.submit(try_via, v) for v in vias[:4]]
        pending = vias[4:]

        candidates = main.result()
        if not candidates:
            raise LookupError("No drivable route was found between these places.")
        fastest = min(candidates, key=lambda r: r.duration_s)

        while True:
            for future in batch:
                candidates.extend(map(remove_spurs, future.result()))
            options = _pick(candidates, fastest)
            # Stop once there are three and the third is a fair alternative. One
            # that only works with an extra overnight rest is worth replacing if
            # the remaining via-points can do better.
            good_enough = len(options) == ROUTE_COUNT and trip_s(options[-1]) <= trip_s(fastest) * MAX_TRIP_SLOWDOWN
            if good_enough or not pending:
                break
            batch = [pool.submit(try_via, v) for v in pending[:4]]
            pending = pending[4:]
    finally:
        # Don't wait for via-point requests we no longer need.
        pool.shutdown(wait=False, cancel_futures=True)

    warnings = []
    if len(options) < ROUTE_COUNT:
        warnings.append(f"Only {len(options)} sensible route(s) exist between these places, showing all of them.")
    return options, warnings, not failed


def trip_s(route: Route) -> float:
    """Door-to-door time, with the rest stops a driver would have to take."""
    return hos.clock_time(route.duration_s)


def _pick(candidates: list[Route], fastest: Route) -> list[Route]:
    # Quickest first, skipping any that are too slow or mostly the same road as
    # one already picked. The result comes out sorted by trip time.
    options: list[Route] = []
    for route in sorted(candidates, key=trip_s):
        if len(options) == ROUTE_COUNT:
            break
        if _acceptable(route, options, fastest):
            options.append(route)
    return options


def remove_spurs(route: Route) -> Route:
    """Drop out-and-back detours.

    A via-point often snaps onto a side road, so the route drives in and comes
    back out the same way. Whenever we reach a node we've already passed,
    everything since then is thrown away.
    """

    def node(p: LatLon) -> tuple[float, float]:
        return round(p[0], 5), round(p[1], 5)

    coords = [route.coords[0]]
    seg_dist: list[float] = []
    seg_time: list[float] = []
    seen = {node(route.coords[0]): 0}

    for i in range(1, len(route.coords)):
        key = node(route.coords[i])
        j = seen.get(key)
        if j is not None:
            for dropped in coords[j + 1 :]:
                seen.pop(node(dropped), None)
            del coords[j + 1 :], seg_dist[j:], seg_time[j:]
            continue
        coords.append(route.coords[i])
        seg_dist.append(route.cum_dist_m[i] - route.cum_dist_m[i - 1])
        seg_time.append(route.cum_time_s[i] - route.cum_time_s[i - 1])
        seen[key] = len(coords) - 1

    if len(coords) < 2:
        return route
    return Route(coords=coords, cum_dist_m=cumulative(seg_dist), cum_time_s=cumulative(seg_time))


def _via_point(origin: LatLon, destination: LatLon, fraction: float, offset: float) -> LatLon:
    """A point part-way along the straight line, pushed off to one side."""
    lat = origin[0] + (destination[0] - origin[0]) * fraction
    lon = origin[1] + (destination[1] - origin[1]) * fraction
    # Work in roughly equal-distance degrees so the offset is perpendicular on the ground.
    cos_lat = math.cos(math.radians(lat))
    dx = (destination[1] - origin[1]) * cos_lat
    dy = destination[0] - origin[0]
    length = math.hypot(dx, dy) or 1e-9
    shift = offset * length
    return lat + dx / length * shift, lon - dy / length * shift / max(cos_lat, 0.2)


def _acceptable(route: Route, existing: list[Route], fastest: Route) -> bool:
    if route.duration_s > fastest.duration_s * MAX_SLOWDOWN:
        return False
    if _backtrack_m(route) > MAX_BACKTRACK_M:
        return False
    return all(shared_fraction(route, other) < MAX_SHARED_FRACTION for other in existing)


def shared_fraction(a: Route, b: Route, tolerance_m: float = 300) -> float:
    """How much of route a runs along route b (0-1)."""
    index = PointIndex(resample(b.coords, b.cum_dist_m, 200), cell_deg=0.01)
    samples = resample(a.coords, a.cum_dist_m, 1_000)
    return sum(index.has_within(p, tolerance_m) for p in samples) / len(samples)


def _backtrack_m(route: Route, step_m: float = 100) -> float:
    """Metres driven on road the route already used more than 2 km earlier."""
    first_seen: dict[tuple[int, int], float] = {}
    total = route.distance_m
    steps = max(1, int(total / step_m))
    backtracked = 0.0
    for k in range(steps + 1):
        d = total * k / steps
        lat, lon = point_at(route.coords, route.cum_dist_m, d)
        cell = (round(lat / 0.002), round(lon / 0.002))
        if d - first_seen.setdefault(cell, d) > 2_000:
            backtracked += total / steps
    return backtracked
