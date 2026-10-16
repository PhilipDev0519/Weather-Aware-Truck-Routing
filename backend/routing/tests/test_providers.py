"""How the outside-API clients cope with slow, busy or unexpected providers."""

from datetime import UTC, datetime, timedelta
from unittest import mock

import requests
from django.core.cache import cache
from django.test import SimpleTestCase

from routing import route_options, services
from routing.services import ProviderError, geocoding, osrm, weather

from .helpers import DEPARTURE


def reply(status=200, payload=None, headers=None):
    response = mock.Mock(status_code=status, headers=headers or {})
    if isinstance(payload, Exception):
        response.json.side_effect = payload
    else:
        response.json.return_value = payload if payload is not None else {}
    return response


def limited(reason):
    return reply(429, {"error": True, "reason": reason})


class FakeClock:
    """Stands in for time.monotonic/time.sleep, so waits take no real time."""

    def __init__(self):
        self.now = 1000.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class HttpGetTests(SimpleTestCase):
    def setUp(self):
        self.clock = FakeClock()
        for name in ("sleep", "monotonic"):
            patcher = mock.patch.object(services.time, name, getattr(self.clock, name))
            patcher.start()
            self.addCleanup(patcher.stop)
        services._gates.clear()

    def get(self, replies, **kwargs):
        with mock.patch.object(services.session, "request", side_effect=replies) as get:
            try:
                return services.http_get("https://api.example.com/x", **kwargs)
            finally:
                self.calls = get.call_count

    def test_busy_server_is_retried(self):
        response = self.get([reply(503), reply(502), reply(200)])
        self.assertEqual((response.status_code, self.calls), (200, 3))

    def test_server_error_is_returned_once_retries_run_out(self):
        response = self.get([reply(503)] * (services.BUSY_RETRIES + 1))
        self.assertEqual(response.status_code, 503)

    def test_too_many_concurrent_requests_retries_quickly(self):
        response = self.get([limited("Too many concurrent requests"), reply(200)])
        self.assertEqual(response.status_code, 200)
        self.assertLess(self.clock.sleeps[-1], 5)

    def test_per_minute_limit_is_probed_every_few_seconds(self):
        minutely = limited("Minutely API request limit exceeded. Please try again in one minute.")
        response = self.get([minutely, minutely, reply(200)], wait_for_rate_limit=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.clock.sleeps, [services.RATE_LIMIT_PROBE_S] * 2)

    def test_per_minute_limit_gives_up_eventually(self):
        minutely = limited("Minutely API request limit exceeded.")
        with self.assertRaisesRegex(ProviderError, "rate limiting"):
            self.get([minutely] * 100, wait_for_rate_limit=True)
        self.assertLessEqual(sum(self.clock.sleeps), services.MAX_RATE_LIMIT_WAIT_S)
        self.assertGreater(sum(self.clock.sleeps), services.MAX_RATE_LIMIT_WAIT_S - services.RATE_LIMIT_PROBE_S)

    def test_requests_wait_while_another_is_rate_limited(self):
        # Another request has just been told "too many": this one waits for the
        # next probe slot instead of hitting the host straight away.
        services.rate_limit_gate("api.example.com").limited()
        self.assertEqual(self.get([reply(200)], wait_for_rate_limit=True).status_code, 200)
        self.assertEqual(self.clock.sleeps, [services.RATE_LIMIT_PROBE_S])
        # The success lifted the limit, so the next request goes straight through.
        self.get([reply(200)], wait_for_rate_limit=True)
        self.assertEqual(len(self.clock.sleeps), 1)

    def test_retry_after_header_is_respected(self):
        minutely = reply(429, {"reason": "Minutely API request limit exceeded."}, headers={"Retry-After": "20"})
        self.get([minutely, reply(200)], wait_for_rate_limit=True)
        self.assertEqual(self.clock.sleeps, [20])

    def test_hourly_limit_fails_straight_away(self):
        with self.assertRaisesRegex(ProviderError, "Hourly"):
            self.get([limited("Hourly API request limit exceeded.")], wait_for_rate_limit=True)
        self.assertEqual(self.clock.sleeps, [])

    def test_network_errors_are_retried_then_reported(self):
        error = requests.ConnectionError("reset")
        self.assertEqual(self.get([error, reply(200)]).status_code, 200)
        with self.assertRaisesRegex(ProviderError, "Could not reach api.example.com"):
            self.get([error] * (services.RETRIES + 1))


class ForecastHorizonTests(SimpleTestCase):
    def test_horizon_is_end_of_sixteenth_day(self):
        now = datetime(2026, 10, 16, 19, 30, tzinfo=UTC)
        self.assertEqual(weather.forecast_end(now), datetime(2026, 10, 31, 23, tzinfo=UTC))

    def test_request_stops_at_horizon_and_rest_is_unknown(self):
        start = datetime(2026, 10, 31, 12, tzinfo=UTC)
        horizon = datetime(2026, 10, 31, 23, tzinfo=UTC)
        hourly = {"wind_speed_10m": [10] * 12, "rain": [0] * 12, "showers": [0] * 12, "snowfall": [0] * 12}
        with (
            mock.patch.object(weather, "forecast_end", return_value=horizon),
            mock.patch.object(weather, "http_get", return_value=reply(200, {"hourly": hourly})) as get,
        ):
            [forecast] = weather._fetch([(40.0, -90.0)], start, hours=49)
        self.assertEqual(get.call_args.args[1]["end_hour"], "2026-10-31T23:00")
        self.assertIsNotNone(forecast.at_hour(11))
        self.assertIsNone(forecast.at_hour(12))

    def test_start_past_horizon_needs_no_request(self):
        start = datetime(2026, 11, 2, tzinfo=UTC)
        with (
            mock.patch.object(weather, "forecast_end", return_value=start - timedelta(days=1)),
            mock.patch.object(weather, "http_get") as get,
        ):
            self.assertEqual(weather._fetch([(40.0, -90.0)] * 2, start, hours=49), [None, None])
        get.assert_not_called()

    def test_non_json_reply_is_a_provider_error(self):
        with (
            mock.patch.object(weather, "http_get", return_value=reply(502, ValueError("html"))),
            self.assertRaises(ProviderError),
        ):
            weather._fetch([(40.0, -90.0)], DEPARTURE, hours=49)


class GeocoderRankingTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def search(self, query, results):
        with mock.patch.object(geocoding, "http_get", return_value=reply(200, {"results": results})):
            return [r["label"] for r in geocoding.search(query)]

    def test_bigger_place_beats_small_exact_name(self):
        results = [
            {"name": "Salt Lake", "admin1": "Hawaii", "population": 38_833, "latitude": 21.3, "longitude": -157.9},
            {"name": "Salt Lake City", "admin1": "Utah", "population": 215_548, "latitude": 40.8, "longitude": -111.9},
        ]
        self.assertEqual(self.search("Salt Lake", results)[0], "Salt Lake City, Utah")

    def test_names_that_dont_start_with_the_query_go_last(self):
        results = [
            {"name": "Willard", "admin1": "Ohio", "population": 6_000, "latitude": 41.0, "longitude": -82.7},
            {"name": "St Louis", "admin1": "Missouri", "population": 279_695, "latitude": 38.6, "longitude": -90.2},
        ]
        self.assertEqual(self.search("St. Louis", results), ["St Louis, Missouri", "Willard, Ohio"])


class NoRouteTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_point_far_from_any_road_means_no_routes(self):
        with mock.patch.object(osrm, "http_get", return_value=reply(400, {"code": "NoSegment"})):
            self.assertEqual(osrm.fetch_routes([(30.0, -40.0), (41.9, -87.6)]), [])

    def test_no_route_is_reported_as_a_lookup_error(self):
        with (
            mock.patch.object(route_options.ors, "is_enabled", return_value=False),
            mock.patch.object(route_options, "fetch_routes", return_value=[]),
            self.assertRaisesRegex(LookupError, "No drivable route"),
        ):
            route_options.route_options((21.3, -157.9), (41.9, -87.6))
