from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase

from routing import planner
from routing.geo import METERS_PER_MILE
from routing.route_options import RouteOptions
from routing.services import ProviderError

from .helpers import DEPARTURE, constant_forecast, straight_route


class CheckpointTests(SimpleTestCase):
    def test_distances_include_origin_and_destination(self):
        miles = [d / METERS_PER_MILE for d in planner.checkpoint_distances(60 * METERS_PER_MILE, 25 * METERS_PER_MILE)]
        self.assertEqual([round(m, 6) for m in miles], [0, 25, 50, 60])

    def test_exact_multiple_does_not_duplicate_destination(self):
        miles = planner.checkpoint_distances(100 * METERS_PER_MILE, 50 * METERS_PER_MILE)
        self.assertEqual(len(miles), 3)

    def test_each_interval_option(self):
        route = straight_route(miles=100)
        for interval, expected in [(10, 11), (25, 5), (50, 3)]:
            with self.subTest(interval=interval):
                self.assertEqual(len(planner.build_checkpoints(route, DEPARTURE, interval)), expected)

    def test_eta_uses_travel_time_to_checkpoint(self):
        checkpoints = planner.build_checkpoints(straight_route(miles=100, hours=2), DEPARTURE, 25)
        self.assertEqual(checkpoints[1].eta, DEPARTURE + timedelta(minutes=30))
        self.assertEqual(checkpoints[-1].eta, DEPARTURE + timedelta(hours=2))

    def test_coverage_partitions_the_route(self):
        checkpoints = planner.build_checkpoints(straight_route(miles=60), DEPARTURE, 25)
        covered = [round(cp.miles_covered, 6) for cp in checkpoints]
        self.assertEqual(covered, [12.5, 25.0, 17.5, 5.0])
        self.assertAlmostEqual(sum(covered), 60)


class PlanTripTests(SimpleTestCase):
    """plan_trip with routing and weather replaced by fakes."""

    def plan(self, routes, forecast_for_route, load_lbs=20_000):
        def fake_forecasts(points, start, hours):
            # Route i starts at longitude -90 + i, so pick its forecast by longitude.
            return [forecast_for_route[round(lon + 90)] for _, lon in points]

        with (
            mock.patch.object(planner, "route_options", return_value=RouteOptions(routes)),
            mock.patch.object(planner, "get_forecasts", side_effect=fake_forecasts),
            mock.patch.object(planner, "build_heatmap", side_effect=self.heatmap),
        ):
            return planner.plan_trip(
                {"label": "A", "lat": 35, "lon": -90}, {"label": "B", "lat": 36, "lon": -90}, DEPARTURE, load_lbs, 10
            )

    heatmap = mock.Mock(return_value={"frames": {}})

    def test_heatmap_is_included(self):
        result = self.plan([straight_route(100, 2)], [constant_forecast()])
        self.assertEqual(result["heatmap"], {"frames": {}})
        self.assertIsNone(result["heatmap_error"])

    def test_heatmap_failure_does_not_break_the_plan(self):
        self.heatmap = mock.Mock(side_effect=ProviderError("weather down"))
        result = self.plan([straight_route(100, 2)], [constant_forecast()])
        self.assertIsNone(result["heatmap"])
        self.assertEqual(result["heatmap_error"], "weather down")
        self.assertEqual(len(result["routes"]), 1)

    def test_risk_miles_sum_to_route_distance(self):
        result = self.plan([straight_route(100, 2)], [constant_forecast(wind=38)])
        route = result["routes"][0]
        self.assertAlmostEqual(sum(route["risk_miles"].values()), 100, places=1)
        self.assertAlmostEqual(route["risk_miles"]["high"], 100, places=1)
        self.assertEqual(route["avg_risk"], 2)

    def test_heavy_load_turns_high_wind_severe(self):
        result = self.plan([straight_route(100, 2)], [constant_forecast(wind=38)], load_lbs=45_000)
        self.assertAlmostEqual(result["routes"][0]["risk_miles"]["severe"], 100, places=1)

    def test_recommends_safer_slower_route(self):
        fast_windy = straight_route(100, 2, start=(35.0, -90.0))
        slow_calm = straight_route(120, 3, start=(35.0, -89.0))
        result = self.plan([fast_windy, slow_calm], [constant_forecast(wind=48), constant_forecast(wind=5)])
        self.assertEqual(result["recommended_route_id"], "B")
        ranks = {r["id"]: r["rank"] for r in result["routes"]}
        self.assertEqual(ranks, {"A": 2, "B": 1})
        self.assertIn("Severe miles", result["recommendation_reason"])

    def test_missing_forecast_is_unknown(self):
        result = self.plan([straight_route(100, 2)], [None])
        route = result["routes"][0]
        self.assertAlmostEqual(route["risk_miles"]["unknown"], 100, places=1)
        self.assertIsNone(route["checkpoints"][0]["level"])
        self.assertTrue(result["warnings"])

    def test_segments_merge_equal_levels(self):
        result = self.plan([straight_route(100, 2)], [constant_forecast(wind=5)])
        self.assertEqual(len(result["routes"][0]["segments"]), 1)


class RestBreakTests(SimpleTestCase):
    def test_etas_include_stops_on_long_drives(self):
        route = straight_route(miles=650, hours=13)
        with_breaks = planner.build_checkpoints(route, DEPARTURE, 50, rest_breaks=True)
        without = planner.build_checkpoints(route, DEPARTURE, 50, rest_breaks=False)
        # 13 h of driving: 30 min break after 8 h, 10 h rest after 11 h
        self.assertEqual(without[-1].eta, DEPARTURE + timedelta(hours=13))
        self.assertEqual(with_breaks[-1].eta, DEPARTURE + timedelta(hours=13 + 0.5 + 10))
        # before the first stop the two agree
        self.assertEqual(with_breaks[1].eta, without[1].eta)
