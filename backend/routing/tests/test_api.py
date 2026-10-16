from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from routing import views
from routing.services import ProviderError


@override_settings(ALLOWED_HOSTS=["testserver"])
class PlanApiTests(SimpleTestCase):
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
        origin, destination, _, load, interval, rest_breaks = plan.call_args.args
        self.assertEqual((origin["lat"], destination["label"], load, interval), (41.88, "Memphis", 42_000, 25))
        self.assertTrue(rest_breaks)  # on unless the client turns it off

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
