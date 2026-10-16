from datetime import UTC, datetime

from routing.geo import METERS_PER_MILE
from routing.services.osrm import Route
from routing.services.weather import Forecast

DEPARTURE = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)


def straight_route(miles: float = 100, hours: float = 2, start=(35.0, -90.0)) -> Route:
    """A due-north route with constant speed."""
    lat, lon = start
    end = (lat + miles * METERS_PER_MILE / 111_195, lon)
    return Route(coords=[start, end], cum_dist_m=[0.0, miles * METERS_PER_MILE], cum_time_s=[0.0, hours * 3600])


def constant_forecast(wind=5.0, rain=0.0, snow=0.0, hours=73, start=DEPARTURE) -> Forecast:
    return Forecast(
        start=start,
        wind_mph=[wind] * hours,
        gust_mph=[wind * 1.3] * hours,
        wind_from_deg=[270.0] * hours,
        rain_in=[rain] * hours,
        snow_in=[snow] * hours,
        temp_f=[30.0] * hours,
    )
