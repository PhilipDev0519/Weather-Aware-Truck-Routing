from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta

from . import hos, recommend
from .geo import METERS_PER_MILE, LatLon, point_at, simplify, simplify_indices, slice_line, value_at
from .heatmap import build_heatmap
from .risk import RiskLevel, assess
from .route_options import route_options
from .services import ProviderError
from .services.osrm import Route
from .services.weather import Forecast, floor_hour, get_forecasts, window_hours

logger = logging.getLogger(__name__)

LEVEL_KEYS = {
    RiskLevel.LOW: "low",
    RiskLevel.MODERATE: "moderate",
    RiskLevel.HIGH: "high",
    RiskLevel.SEVERE: "severe",
    RiskLevel.NO_TRAVEL: "no_travel",
}
SIMPLIFY_DEG = 0.0005  # ~50 m, plenty for drawing on the map
CORRIDOR_SIMPLIFY_DEG = 0.01  # the heatmap grid only needs the rough shape
HEATMAP_FAILED = "The weather heatmap could not be built for this trip."


@dataclass
class Checkpoint:
    index: int
    distance_m: float
    position: LatLon
    eta: datetime
    covers_m: tuple[float, float]  # the stretch of road this checkpoint stands for

    @property
    def miles_covered(self) -> float:
        return (self.covers_m[1] - self.covers_m[0]) / METERS_PER_MILE


def checkpoint_distances(total_m: float, interval_m: float) -> list[float]:
    distances = []
    d = 0.0
    while d < total_m:
        distances.append(d)
        d += interval_m
    if not distances or total_m - distances[-1] > 1.0:
        distances.append(total_m)  # always sample the destination too
    return distances


def build_checkpoints(
    route: Route, departure: datetime, interval_miles: float, rest_breaks: bool = True
) -> list[Checkpoint]:
    distances = checkpoint_distances(route.distance_m, interval_miles * METERS_PER_MILE)
    # Each checkpoint covers the road halfway to its neighbours, so the
    # covered stretches add up to exactly the route length.
    edges = [0.0] + [(a + b) / 2 for a, b in zip(distances, distances[1:])] + [route.distance_m]
    checkpoints = []
    for i, d in enumerate(distances):
        driving_s = value_at(route.cum_dist_m, route.cum_time_s, d)
        elapsed_s = hos.clock_time(driving_s) if rest_breaks else driving_s
        checkpoints.append(
            Checkpoint(
                index=i,
                distance_m=d,
                position=point_at(route.coords, route.cum_dist_m, d),
                eta=departure + timedelta(seconds=elapsed_s),
                covers_m=(edges[i], edges[i + 1]),
            )
        )
    return checkpoints


def plan_trip(
    origin: dict,
    destination: dict,
    departure: datetime,
    load_lbs: float,
    interval_miles: int,
    rest_breaks: bool = True,
    include_heatmap: bool = True,
) -> dict:
    """Routes, checkpoints, risk and the recommendation for one trip.

    Without include_heatmap the heatmap is left out and the client fetches it
    from /api/heatmap with the returned corridor, so the routes come back
    without waiting for ~130 more forecast locations.
    """
    options = route_options((origin["lat"], origin["lon"]), (destination["lat"], destination["lon"]), load_lbs)
    routes, warnings = options.routes, list(options.warnings)
    checkpoints = [build_checkpoints(r, departure, interval_miles, rest_breaks) for r in routes]

    # Simplify each route once; the coloured stretches are cut from this line too.
    display = [_display_line(r) for r in routes]
    corridor = [simplify(coords, CORRIDOR_SIMPLIFY_DEG) for coords, _ in display]

    # The heatmap and the checkpoint weather are independent, so fetch them side by side.
    with ThreadPoolExecutor(max_workers=1) as pool:
        heatmap_job = pool.submit(build_heatmap, corridor, departure, load_lbs) if include_heatmap else None

        # Weather for all checkpoints of all routes in one go, then split back up.
        start = floor_hour(departure)
        latest_eta = max(cp.eta for cps in checkpoints for cp in cps)
        hours = window_hours((latest_eta - start).total_seconds() / 3600)
        all_forecasts = get_forecasts([cp.position for cps in checkpoints for cp in cps], start, hours)

        # The heatmap is extra; if it fails the plan is still worth showing.
        heatmap, heatmap_error = None, None
        if heatmap_job:
            try:
                heatmap = heatmap_job.result()
            except ProviderError as exc:
                logger.warning("Heatmap failed: %s", exc)
                heatmap_error = str(exc)
            except Exception:
                logger.exception("Heatmap failed")
                heatmap_error = HEATMAP_FAILED

    forecasts = []
    for cps in checkpoints:
        forecasts.append(all_forecasts[: len(cps)])
        all_forecasts = all_forecasts[len(cps) :]

    results = [
        _evaluate(chr(ord("A") + i), route, line, cps, fcs, load_lbs, departure, rest_breaks)
        for i, (route, line, cps, fcs) in enumerate(zip(routes, display, checkpoints, forecasts))
    ]

    ranked = recommend.rank_routes(results)
    for rank, result in enumerate(ranked, start=1):
        result["rank"] = rank
    best = ranked[0]
    best["recommended"] = True

    warnings.extend(_extra_rest_warnings(results))
    if any(r["risk_miles"]["unknown"] > 0 for r in results):
        warnings.append("Part of the trip is past the end of the forecast; those miles are shown as Unknown.")
    if best["risk_miles"]["no_travel"] > 0:
        warnings.append(
            "Every route runs into No Travel conditions for this load. Consider leaving later or carrying less."
        )

    return {
        "origin": origin,
        "destination": destination,
        "departure": departure.isoformat(),
        "load_lbs": load_lbs,
        "interval_miles": interval_miles,
        "rest_breaks": rest_breaks,
        "routes": results,
        "recommended_route_id": best["id"],
        "recommendation_reason": recommend.explain(best, ranked[1] if len(ranked) > 1 else None),
        "warnings": warnings,
        "routing": {"profile": options.profile, "gross_lbs": options.gross_lbs},
        "heatmap": heatmap,
        "heatmap_error": heatmap_error,
        # the routes' rough shape, for building the heatmap in a second request
        "corridor": [_rounded(line) for line in corridor],
    }


def _evaluate(
    route_id: str,
    route: Route,
    line: tuple[list[LatLon], list[float]],
    checkpoints: list[Checkpoint],
    forecasts: list[Forecast | None],
    load_lbs: float,
    departure: datetime,
    rest_breaks: bool,
) -> dict:
    risk_miles = {key: 0.0 for key in LEVEL_KEYS.values()}
    risk_miles["unknown"] = 0.0
    weighted_sum = known_miles = 0.0
    levels: list[RiskLevel | None] = []
    rows = []

    for cp, forecast in zip(checkpoints, forecasts):
        conditions = forecast.at(cp.eta) if forecast else None
        if conditions:
            assessment = assess(conditions.wind_mph, conditions.rain_in_hr, conditions.snow_in_hr, load_lbs)
            level, reasons = assessment.level, assessment.reasons
            risk_miles[LEVEL_KEYS[level]] += cp.miles_covered
            weighted_sum += int(level) * cp.miles_covered
            known_miles += cp.miles_covered
        else:
            level, reasons = None, ["No forecast available for this time"]
            risk_miles["unknown"] += cp.miles_covered
        levels.append(level)
        rows.append(
            {
                "index": cp.index,
                "mile": round(cp.distance_m / METERS_PER_MILE, 1),
                "lat": round(cp.position[0], 5),
                "lon": round(cp.position[1], 5),
                "eta": cp.eta.isoformat(),
                "hours_from_departure": round((cp.eta - departure).total_seconds() / 3600, 2),
                "weather": conditions.as_dict() if conditions else None,
                "level": None if level is None else int(level),
                "reasons": reasons,
            }
        )

    known = [lvl for lvl in levels if lvl is not None]
    breaks, rests = hos.stops_before(route.duration_s) if rest_breaks else (0, 0)
    trip_s = hos.clock_time(route.duration_s) if rest_breaks else route.duration_s
    return {
        "id": route_id,
        "name": f"Route {route_id}",
        "recommended": False,
        "distance_miles": round(route.distance_m / METERS_PER_MILE, 1),
        # door-to-door time including any required stops; this is what routes are ranked on
        "duration_hours": round(trip_s / 3600, 3),
        "driving_hours": round(route.duration_s / 3600, 3),
        "stops": {"breaks": breaks, "rests": rests},
        "arrival": (departure + timedelta(seconds=trip_s)).isoformat(),
        "risk_miles": {k: round(v, 2) for k, v in risk_miles.items()},
        "avg_risk": round(weighted_sum / known_miles, 4) if known_miles else 0.0,
        "max_level": int(max(known)) if known else None,
        "checkpoints": rows,
        # the coloured stretches together make up the whole route line
        "segments": _risk_segments(line, checkpoints, levels),
    }


def _extra_rest_warnings(results: list[dict]) -> list[str]:
    """Point out routes that only work with more 10-hour rests than the others.

    Near the 11-hour driving limit, a route only a few percent longer needs a
    whole extra rest, which can double its door-to-door time. It's still a
    real option (and ranked on that time), but the reason should be obvious.
    """
    fewest = min(r["stops"]["rests"] for r in results)
    quickest = min(results, key=lambda r: r["duration_hours"])
    warnings = []
    for r in results:
        r["extra_rests"] = r["stops"]["rests"] - fewest
        if r["extra_rests"]:
            rests = "an extra 10-hour rest stop" if r["extra_rests"] == 1 else f"{r['extra_rests']} extra 10-hour rests"
            warnings.append(
                f"{r['name']} needs {rests} (its driving time passes the 11-hour limit), so it takes "
                f"{recommend.format_hours(r['duration_hours'])} door to door vs "
                f"{recommend.format_hours(quickest['duration_hours'])} on {quickest['name']}."
            )
    return warnings


def _display_line(route: Route) -> tuple[list[LatLon], list[float]]:
    keep = simplify_indices(route.coords, SIMPLIFY_DEG)
    return [route.coords[i] for i in keep], [route.cum_dist_m[i] for i in keep]


def _risk_segments(
    line: tuple[list[LatLon], list[float]], checkpoints: list[Checkpoint], levels: list[RiskLevel | None]
) -> list[dict]:
    coords, cum = line
    # Merge neighbouring checkpoints with the same level into one coloured stretch.
    runs: list[list] = []
    for cp, level in zip(checkpoints, levels):
        value = None if level is None else int(level)
        start, end = cp.covers_m
        if runs and runs[-1][0] == value:
            runs[-1][2] = end
        else:
            runs.append([value, start, end])

    return [{"level": value, "coords": _rounded(slice_line(coords, cum, start, end))} for value, start, end in runs]


def _rounded(coords: list[LatLon]) -> list[list[float]]:
    return [[round(lat, 5), round(lon, 5)] for lat, lon in coords]
