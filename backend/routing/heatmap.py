"""Weather grid around the routes, one frame per hour for 0-48 h after departure.

Rows are evenly spaced in Web Mercator (not in latitude) so the frontend can
paint a frame as a small image and stretch it over the map without it drifting
out of place.
"""

from __future__ import annotations

import math
from datetime import datetime

from django.conf import settings

from .geo import LatLon, cumulative, haversine_m, inverse_mercator_y, mercator_y, resample
from .risk import assess, rules_payload, truncate
from .services.weather import floor_hour, get_forecasts, window_hours

HEATMAP_HOURS = 48
CORRIDOR_BUFFER_KM = 60
MAX_CELLS = 160  # default; every cell is a forecast location, and Open-Meteo rate-limits per location
MIN_CELL_DEG = 0.1


def build_heatmap(lines: list[list[LatLon]], departure: datetime, load_lbs: float) -> dict:
    grid = corridor_grid(lines, max_cells=settings.ROUTING["HEATMAP_MAX_CELLS"])
    start = floor_hour(departure)
    forecasts = get_forecasts(grid["points"], start, window_hours(HEATMAP_HOURS))

    frames: dict[str, list[list]] = {"risk": [], "wind": [], "wind_from": [], "rain": [], "snow": []}
    for hour in range(HEATMAP_HOURS + 1):
        frame: dict[str, list] = {name: [] for name in frames}
        for forecast in forecasts:
            c = forecast.at_hour(hour) if forecast else None
            if c is None:
                for values in frame.values():
                    values.append(None)
                continue
            frame["risk"].append(int(assess(c.wind_mph, c.rain_in_hr, c.snow_in_hr, load_lbs).level))
            frame["wind"].append(truncate(c.wind_mph, 1))
            frame["wind_from"].append(None if c.wind_from_deg is None else round(c.wind_from_deg))
            frame["rain"].append(truncate(c.rain_in_hr, 3))
            frame["snow"].append(truncate(c.snow_in_hr, 3))
        for name, values in frame.items():
            frames[name].append(values)

    return {
        "start": start.isoformat(),
        "hours": HEATMAP_HOURS,
        "bounds": grid["bounds"],
        "rows": grid["rows"],
        "cols": grid["cols"],
        "cells": grid["cells"],
        "points": [[round(lat, 4), round(lon, 4)] for lat, lon in grid["points"]],
        "frames": frames,
        "rules": rules_payload(),
    }


def corridor_grid(lines: list[list[LatLon]], buffer_km: float = CORRIDOR_BUFFER_KM, max_cells: int = MAX_CELLS) -> dict:
    samples: list[LatLon] = []
    for line in lines:
        if len(line) < 2:
            samples.extend(line)
            continue
        cum = cumulative([haversine_m(a, b) for a, b in zip(line, line[1:])])
        samples.extend(resample(line, cum, 5_000))
    if not samples:
        raise ValueError("No route geometry supplied.")
    # Routes share a lot of road; drop the duplicates.
    samples = list(dict.fromkeys((round(lat, 2), round(lon, 2)) for lat, lon in samples))

    lats = [p[0] for p in samples]
    lons = [p[1] for p in samples]
    cos_mid = max(0.2, math.cos(math.radians((min(lats) + max(lats)) / 2)))
    pad_lat = buffer_km / 111
    pad_lon = pad_lat / cos_mid
    south, north = min(lats) - pad_lat, max(lats) + pad_lat
    west, east = min(lons) - pad_lon, max(lons) + pad_lon

    # Guess the cell size from the corridor's area (length x width), then grow
    # the cells a little at a time if there are still too many.
    corridor_km2 = len(samples) * 5 * 2 * buffer_km
    cell_deg = max(MIN_CELL_DEG, math.sqrt(corridor_km2 / max_cells) / (111 * cos_mid) * 0.9)
    while True:
        grid = _grid(south, north, west, east, cell_deg, samples, buffer_km * 1000)
        if len(grid["cells"]) <= max_cells:
            return grid
        cell_deg *= 1.1


def _grid(
    south: float, north: float, west: float, east: float, cell_deg: float, samples: list[LatLon], radius_m: float
) -> dict:
    step_y = math.radians(cell_deg)
    cols = max(1, math.ceil((east - west) / cell_deg))
    y_north = mercator_y(north)
    rows = max(1, math.ceil((y_north - mercator_y(south)) / step_y))
    # row 0 is the top of the image, i.e. the north edge
    row_lat = [inverse_mercator_y(y_north - (r + 0.5) * step_y) for r in range(rows)]

    # Each sample marks the cells around it, instead of every cell searching
    # for samples; far less work for a long, thin corridor.
    radius_deg = radius_m / 111_000
    hit: set[int] = set()
    for lat, lon in samples:
        cos_lat = max(0.2, math.cos(math.radians(lat)))
        reach_lon = radius_deg / cos_lat
        r0 = max(0, math.floor((y_north - mercator_y(lat + radius_deg)) / step_y))
        r1 = min(rows - 1, math.floor((y_north - mercator_y(lat - radius_deg)) / step_y))
        c0 = max(0, math.floor((lon - reach_lon - west) / cell_deg))
        c1 = min(cols - 1, math.floor((lon + reach_lon - west) / cell_deg))
        for r in range(r0, r1 + 1):
            dy = row_lat[r] - lat
            for c in range(c0, c1 + 1):
                dx = (west + (c + 0.5) * cell_deg - lon) * cos_lat
                if dx * dx + dy * dy <= radius_deg * radius_deg:
                    hit.add(r * cols + c)

    cells = sorted(hit)
    points = [(row_lat[k // cols], west + (k % cols + 0.5) * cell_deg) for k in cells]
    south_edge = inverse_mercator_y(y_north - rows * step_y)
    east_edge = west + cols * cell_deg
    bounds = [[round(south_edge, 5), round(west, 5)], [round(north, 5), round(east_edge, 5)]]
    return {"rows": rows, "cols": cols, "cells": cells, "points": points, "bounds": bounds}
