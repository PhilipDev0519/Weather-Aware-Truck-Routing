from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from routing import views
from routing.services import ProviderError


@override_settings(ALLOWED_HOSTS=["testserver"])
class PlanApiTests(SimpleTestCase):
    def setUp(self):
        cache.clear()  # throttle counts live in the cache

    def payload(self, **overrides):
        body = {
            "origin": {"label": "Chicago", "lat": 41.88, "lon": -87.63},
            "destination": {"label": "Memphis", "lat": 35.15, "lon": -90.05},
            "departure": (timezone.now() + timedelta(hours=1)).isoformat(),
            "load_lbs": 42_000,
            "interval_miles": 25,
        }
        body.update(overrides)
        return body

    def post(self, body):
        return self.client.post("/api/plan", body, content_type="application/json")

    def test_rejects_unsupported_interval(self):
        response = self.post(self.payload(interval_miles=30))
        self.assertEqual(response.status_code, 400)
        self.assertIn("interval_miles", response.json())

    def test_rejects_past_departure(self):
        response = self.post(self.payload(departure=(timezone.now() - timedelta(days=1)).isoformat()))
        self.assertEqual(response.status_code, 400)

    def test_rejects_negative_load(self):
        self.assertEqual(self.post(self.payload(load_lbs=-5)).status_code, 400)

    def test_passes_inputs_to_planner(self):
        with mock.patch.object(views.planner, "plan_trip", return_value={"ok": True}) as plan:
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        origin, destination, _, load, interval, rest_breaks, include_heatmap = plan.call_args.args
        self.assertEqual((origin["lat"], destination["label"], load, interval), (41.88, "Memphis", 42_000, 25))
        self.assertTrue(rest_breaks)  # on unless the client turns it off
        self.assertTrue(include_heatmap)

    def test_heatmap_can_be_left_out(self):
        with mock.patch.object(views.planner, "plan_trip", return_value={}) as plan:
            self.post(self.payload(include_heatmap=False))
        self.assertFalse(plan.call_args.args[6])

    def test_too_many_plans_are_throttled(self):
        with (
            mock.patch.object(views.ScopedRateThrottle, "THROTTLE_RATES", {"plan": "2/min"}),
            mock.patch.object(views.planner, "plan_trip", return_value={}),
        ):
            codes = [self.post(self.payload()).status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])

    def test_geocodes_free_text(self):
        match = {"label": "Memphis, Tennessee", "lat": 35.1, "lon": -90.0}
        with (
            mock.patch.object(views.geocoding, "search", return_value=[match]),
            mock.patch.object(views.planner, "plan_trip", return_value={}) as plan,
        ):
            self.post(self.payload(destination={"label": "Memphis"}))
        self.assertEqual(plan.call_args.args[1], match)

    def test_provider_failure_is_502(self):
        with mock.patch.object(views.planner, "plan_trip", side_effect=ProviderError("down")):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "down")

    def test_no_route_is_400(self):
        error = LookupError("No drivable route was found between these places.")
        with mock.patch.object(views.planner, "plan_trip", side_effect=error):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 400)
        self.assertIn("No drivable route", response.json()["detail"])

    def test_unexpected_error_is_json(self):
        with mock.patch.object(views.planner, "plan_trip", side_effect=RuntimeError("bug")):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 500)
        self.assertIn("detail", response.json())


@override_settings(ALLOWED_HOSTS=["testserver"])
class HeatmapApiTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def payload(self, **overrides):
        body = {
            "corridor": [[[41.88, -87.63], [38.6, -89.0], [35.15, -90.05]]],
            "departure": (timezone.now() + timedelta(hours=1)).isoformat(),
            "load_lbs": 42_000,
        }
        body.update(overrides)
        return body

    def post(self, body):
        return self.client.post("/api/heatmap", body, content_type="application/json")

    def test_builds_heatmap_from_corridor(self):
        with mock.patch.object(views, "build_heatmap", return_value={"frames": {}}) as build:
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 200)
        lines, _, load = build.call_args.args
        self.assertEqual(lines[0][1], (38.6, -89.0))
        self.assertEqual(load, 42_000)

    def test_rejects_bad_corridor(self):
        for corridor in ([], [[[41.88]]], [[[95, 0]]], [[[0, 0]]] * 4):
            with self.subTest(corridor=corridor):
                self.assertEqual(self.post(self.payload(corridor=corridor)).status_code, 400)

    def test_weather_failure_is_502(self):
        with mock.patch.object(views, "build_heatmap", side_effect=ProviderError("weather down")):
            response = self.post(self.payload())
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "weather down")


@override_settings(ALLOWED_HOSTS=["testserver"])
class RulesApiTests(SimpleTestCase):
    def test_rules_are_exposed(self):
        data = self.client.get("/api/rules").json()
        self.assertEqual(data["wind"]["edges"], [25, 35, 45, 55])
        self.assertEqual(len(data["levels"]), 5)


@override_settings(ALLOWED_HOSTS=["testserver"])
class TileApiTests(SimpleTestCase):
    def test_serves_tile_with_cache_header(self):
        with mock.patch.object(views.tiles, "get_tile", return_value=(b"png-bytes", "image/png")):
            response = self.client.get("/api/tiles/streets/5/8/12")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"png-bytes")
        self.assertIn("max-age", response["Cache-Control"])

    def test_unknown_style_is_404(self):
        self.assertEqual(self.client.get("/api/tiles/nope/5/8/12").status_code, 404)

    def test_out_of_range_tile_is_404(self):
        self.assertEqual(self.client.get("/api/tiles/streets/3/9/1").status_code, 404)
