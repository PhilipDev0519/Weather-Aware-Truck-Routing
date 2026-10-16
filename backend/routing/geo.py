from __future__ import annotations

import math
from bisect import bisect_right
from collections import defaultdict

LatLon = tuple[float, float]  # (lat, lon) in degrees

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_MILE = 1609.344


def haversine_m(a: LatLon, b: LatLon) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def bearing_deg(a: LatLon, b: LatLon) -> float:
    """Compass direction from a to b, 0-360 (0 = north, 90 = east)."""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def cumulative(values: list[float]) -> list[float]:
    """[a, b, c] -> [0, a, a+b, a+b+c]"""
    total, out = 0.0, [0.0]
    for v in values:
        total += v
        out.append(total)
    return out


def locate(cum: list[float], target: float) -> tuple[int, float]:
    """Segment index i and fraction t so that target sits between vertex i and i+1."""
    if target <= cum[0]:
        return 0, 0.0
    if target >= cum[-1]:
        return len(cum) - 2, 1.0
    i = bisect_right(cum, target) - 1
    span = cum[i + 1] - cum[i]
    return i, (target - cum[i]) / span if span > 0 else 0.0


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def point_at(coords: list[LatLon], cum: list[float], distance: float) -> LatLon:
    i, t = locate(cum, distance)
    (lat1, lon1), (lat2, lon2) = coords[i], coords[i + 1]
    return lerp(lat1, lat2, t), lerp(lon1, lon2, t)


def value_at(cum: list[float], values: list[float], distance: float) -> float:
    i, t = locate(cum, distance)
    return lerp(values[i], values[i + 1], t)


def slice_line(coords: list[LatLon], cum: list[float], start: float, end: float) -> list[LatLon]:
    i0, _ = locate(cum, start)
    i1, _ = locate(cum, end)
    out = [point_at(coords, cum, start)]
    out.extend(coords[i0 + 1 : i1 + 1])
    out.append(point_at(coords, cum, end))
    return out


def resample(coords: list[LatLon], cum: list[float], step_m: float) -> list[LatLon]:
    """Evenly spaced points along the line, no more than step_m apart, ends included."""
    total = cum[-1]
    n = max(1, math.ceil(total / step_m))
    return [point_at(coords, cum, total * k / n) for k in range(n + 1)]


def simplify(coords: list[LatLon], tolerance_deg: float) -> list[LatLon]:
    return [coords[i] for i in simplify_indices(coords, tolerance_deg)]


def simplify_indices(coords: list[LatLon], tolerance_deg: float) -> list[int]:
    """Indices of the points to keep, treating degrees as flat (fine for drawing).

    A quick pass first drops points sitting almost on top of the previous one,
    then Douglas-Peucker runs on what's left. Same idea as simplify.js.
    """
    if len(coords) < 3:
        return list(range(len(coords)))

    tol2 = tolerance_deg**2
    idx = [0]
    for i in range(1, len(coords) - 1):
        (ay, ax), (py, px) = coords[idx[-1]], coords[i]
        if (px - ax) ** 2 + (py - ay) ** 2 > tol2:
            idx.append(i)
    idx.append(len(coords) - 1)

    keep = [False] * len(idx)
    keep[0] = keep[-1] = True
    stack = [(0, len(idx) - 1)]
    while stack:
        first, last = stack.pop()
        (ay, ax), (by, bx) = coords[idx[first]], coords[idx[last]]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best_i, best_d = -1, tol2
        for i in range(first + 1, last):
            py, px = coords[idx[i]]
            if seg2 == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best_d:
                best_i, best_d = i, d
        if best_i > 0:
            keep[best_i] = True
            stack.append((first, best_i))
            stack.append((best_i, last))
    return [i for i, k in zip(idx, keep) if k]


def mercator_y(lat: float) -> float:
    lat = max(-85.0, min(85.0, lat))
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def inverse_mercator_y(y: float) -> float:
    return math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)


class PointIndex:
    """Points bucketed by grid cell, for quick "anything within r metres?" checks."""

    def __init__(self, points: list[LatLon], cell_deg: float):
        self.cell = cell_deg
        self.buckets: dict[tuple[int, int], list[LatLon]] = defaultdict(list)
        for p in points:
            self.buckets[self._key(p)].append(p)

    def _key(self, p: LatLon) -> tuple[int, int]:
        return math.floor(p[0] / self.cell), math.floor(p[1] / self.cell)

    def has_within(self, p: LatLon, radius_m: float) -> bool:
        ky, kx = self._key(p)
        # a degree of longitude gets shorter towards the poles, so look further in x
        reach_y = math.ceil(radius_m / 111_000 / self.cell)
        reach_x = math.ceil(radius_m / (111_000 * max(0.2, math.cos(math.radians(p[0])))) / self.cell)
        for dy in range(-reach_y, reach_y + 1):
            for dx in range(-reach_x, reach_x + 1):
                for q in self.buckets.get((ky + dy, kx + dx), ()):
                    if haversine_m(p, q) <= radius_m:
                        return True
        return False
