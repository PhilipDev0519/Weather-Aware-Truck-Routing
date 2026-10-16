"""Hourly forecasts from Open-Meteo.

Wind in the hourly data is the value at that moment; rain, showers and
snowfall are totals for the hour *before* the timestamp. Totals per hour are
already per-hour rates, so after unit conversion they're in in/hr.
"""

from __future__ import annotations

import math
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from ..geo import LatLon
from ..risk import truncate
from . import ProviderError, http_get

HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,wind_direction_10m,rain,showers,snowfall,temperature_2m"
GRID_DEG = 0.05  # ~5 km, close to the models' own resolution
BATCH_SIZE = 10  # small multi-location requests come back much faster than big ones
MAX_PARALLEL = 8
# Open-Meteo refuses too many requests in flight at once ("Too many concurrent
# requests"). The plan and its heatmap fetch side by side, so cap them together.
MAX_IN_FLIGHT = 4
_in_flight = threading.BoundedSemaphore(MAX_IN_FLIGHT)
MM_PER_INCH = 25.4
CM_PER_INCH = 2.54
# Open-Meteo forecasts run to the end of the 16th day (today included, UTC);
# asking for any hour past that fails the whole request.
FORECAST_DAYS = 16


@dataclass(frozen=True)
class Conditions:
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float
    snow_in_hr: float
    temp_f: float | None
    wind_from_deg: float | None = None  # meteorological: the direction the wind blows *from*

    def as_dict(self) -> dict:
        return {
            "wind_mph": truncate(self.wind_mph, 1),
            "gust_mph": None if self.gust_mph is None else truncate(self.gust_mph, 1),
            "wind_from_deg": None if self.wind_from_deg is None else round(self.wind_from_deg),
            "rain_in_hr": truncate(self.rain_in_hr, 3),
            "snow_in_hr": truncate(self.snow_in_hr, 3),
            "temp_f": None if self.temp_f is None else round(self.temp_f),
        }


@dataclass
class Forecast:
    start: datetime  # UTC hour of index 0
    wind_mph: list[float | None]
    gust_mph: list[float | None]
    wind_from_deg: list[float | None]
    rain_in: list[float | None]
    snow_in: list[float | None]
    temp_f: list[float | None]

    @staticmethod
    def _get(series: list, i: int):
        return series[i] if 0 <= i < len(series) else None

    def at_hour(self, wind_i: int, precip_i: int | None = None) -> Conditions | None:
        if precip_i is None:
            precip_i = wind_i
        wind = self._get(self.wind_mph, wind_i)
        rain = self._get(self.rain_in, precip_i)
        snow = self._get(self.snow_in, precip_i)
        if wind is None or rain is None or snow is None:
            return None
        return Conditions(
            wind,
            self._get(self.gust_mph, wind_i),
            rain,
            snow,
            self._get(self.temp_f, wind_i),
            self._get(self.wind_from_deg, wind_i),
        )

    def at(self, when: datetime) -> Conditions | None:
        # Nearest hour for wind; for precipitation, the hour that ends after `when`.
        hours = (when - self.start).total_seconds() / 3600
        return self.at_hour(round(hours), math.ceil(hours - 1e-9))


def floor_hour(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def window_hours(span_hours: float) -> int:
    # Whole days and never less than 0-48 h, so the plan and the heatmap share cache entries.
    days = max(2, math.ceil(math.ceil(span_hours) / 24))
    return days * 24 + 1


def forecast_end(now: datetime | None = None) -> datetime:
    """Last hour the provider has a forecast for."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight + timedelta(days=FORECAST_DAYS) - timedelta(hours=1)


def snap(point: LatLon) -> LatLon:
    lat, lon = point
    return round(round(lat / GRID_DEG) * GRID_DEG, 4), round(round(lon / GRID_DEG) * GRID_DEG, 4)


def get_forecasts(points: list[LatLon], start: datetime, hours: int) -> list[Forecast | None]:
    start = floor_hour(start)
    snapped = [snap(p) for p in points]
    unique = list(dict.fromkeys(snapped))

    def key(p: LatLon) -> str:
        return f"wx:{p[0]}:{p[1]}:{start:%Y%m%d%H}:{hours}"

    cached = cache.get_many([key(p) for p in unique])
    found = {p: cached[key(p)] for p in unique if key(p) in cached}
    missing = [p for p in unique if p not in found]

    if missing:
        ttl = settings.ROUTING["WEATHER_CACHE_TTL_S"]

        def fetch_and_cache(batch: list[LatLon]) -> None:
            forecasts = _fetch(batch, start, hours)
            # Cache each batch straight away, so if another batch fails (usually a
            # rate limit) a retry doesn't spend the free quota on these again.
            cache.set_many({key(p): f for p, f in zip(batch, forecasts)}, ttl)
            found.update(zip(batch, forecasts))

        batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
            list(pool.map(fetch_and_cache, batches))  # list() re-raises the first error

    return [found[p] for p in snapped]


def _fetch(points: list[LatLon], start: datetime, hours: int) -> list[Forecast | None]:
    # Hours past the forecast horizon are left empty (shown as Unknown) instead
    # of failing the request.
    end = min(start + timedelta(hours=hours - 1), forecast_end())
    if end < start:
        return [None] * len(points)
    params = {
        "latitude": ",".join(f"{lat:g}" for lat, _ in points),
        "longitude": ",".join(f"{lon:g}" for _, lon in points),
        "hourly": HOURLY_VARS,
        "wind_speed_unit": "mph",
        "temperature_unit": "fahrenheit",
        "timezone": "GMT",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
    }
    if api_key := settings.ROUTING["OPEN_METEO_API_KEY"]:
        params["apikey"] = api_key

    with _in_flight:
        response = http_get(settings.ROUTING["OPEN_METEO_URL"], params, wait_for_rate_limit=True)
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(f"Weather service returned an invalid response ({response.status_code}).") from exc
    if response.status_code != 200 or (isinstance(data, dict) and data.get("error")):
        reason = data.get("reason") if isinstance(data, dict) else None
        raise ProviderError(f"Weather service error: {reason or response.status_code}")

    # One location comes back as an object, several as a list.
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise ProviderError("Weather service returned the wrong number of locations.")
    return [_parse(item, start, hours) for item in items]


def _parse(item: dict, start: datetime, hours: int) -> Forecast | None:
    hourly = item.get("hourly")
    if not hourly:
        return None

    def series(name: str, divisor: float = 1.0) -> list[float | None]:
        values = [None if v is None else v / divisor for v in hourly.get(name) or []]
        return (values + [None] * hours)[:hours]

    rain = series("rain", MM_PER_INCH)
    showers = series("showers", MM_PER_INCH)
    return Forecast(
        start=start,
        wind_mph=series("wind_speed_10m"),
        gust_mph=series("wind_gusts_10m"),
        wind_from_deg=series("wind_direction_10m"),
        rain_in=[None if r is None else r + (s or 0.0) for r, s in zip(rain, showers)],
        snow_in=series("snowfall", CM_PER_INCH),
        temp_f=series("temperature_2m"),
    )
