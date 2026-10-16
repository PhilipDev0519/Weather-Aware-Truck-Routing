"""openrouteservice truck routing, and falling back to OSRM when it fails."""

from unittest import mock

from django.conf import settings
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from routing import route_options
from routing.geo import METERS_PER_MILE
from routing.services import ProviderError, ors

from .helpers import straight_route


def reply(status, payload):
    return mock.Mock(status_code=status, headers={}, json=mock.Mock(return_value=payload))


# Same shape as a real /v2/directions/driving-hgv/geojson response, cut down:
# three vertices due north, two instruction steps of 60 s and 240 s.
FEATURE = {
    "geometry": {"coordinates": [[-90.0, 35.0], [-90.0, 35.01], [-90.0, 35.03]]},
    "properties": {
        "summary": {"distance": 3336.0, "duration": 300.0},
        "segments": [
            {
                "steps": [
                    {"distance": 1112.0, "duration": 60.0, "way_points": [0, 1]},
                    {"distance": 2224.0, "duration": 240.0, "way_points": [1, 2]},
                    {"distance": 0.0, "duration": 0.0, "way_points": [2, 2]},  # "arrive"
                ]
            }
        ],
    },
}

ROUTING = {**settings.ROUTING, "ORS_API_KEY": "test-key", "EMPTY_TRUCK_LBS": 33_000, "TRUCK_MAX_SPEED_MPH": 65}


@override_settings(ROUTING=ROUTING)
class FetchTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        # timing is tested on its own below; here, OSRM agrees with openrouteservice's 300 s
        patcher = mock.patch.object(ors, "drive_time_along", side_effect=lambda coords, cum: (300.0, cum[-1]))
        patcher.start()
        self.addCleanup(patcher.stop)

    def fetch(self, response, weight_t=34):
        with mock.patch.object(ors, "http_request", return_value=response) as request:
            routes = ors.fetch_routes([(35.0, -90.0), (35.03, -90.0)], weight_t)
        return routes, request

    def test_parses_geometry_and_step_times(self):
        [route], _ = self.fetch(reply(200, {"features": [FEATURE]}))
        self.assertEqual(route.coords[0], (35.0, -90.0))
        self.assertAlmostEqual(route.duration_s, 300.0)
        self.assertAlmostEqual(route.cum_time_s[1], 60.0)  # the first step's time stays on its own stretch

    def test_sends_truck_profile_weight_and_key(self):
        _, request = self.fetch(reply(200, {"features": [FEATURE]}), weight_t=36)
        method, url = request.call_args.args
        body = request.call_args.kwargs["json"]
        self.assertEqual(method, "POST")
        self.assertIn("/driving-hgv/", url)
        self.assertEqual(body["coordinates"][0], [-90.0, 35.0])  # lon, lat
        self.assertEqual(body["options"]["profile_params"]["restrictions"]["weight"], 36)
        self.assertEqual(body["radiuses"], [-1, -1])
        self.assertEqual(request.call_args.kwargs["headers"]["Authorization"], "test-key")

    def test_no_route_is_an_empty_list(self):
        routes, _ = self.fetch(reply(404, {"error": {"code": 2009, "message": "Route could not be found"}}))
        self.assertEqual(routes, [])

    def test_other_errors_are_provider_errors(self):
        too_far = {"error": {"code": 2004, "message": "route distance must not be greater than 6000000.0 meters"}}
        with self.assertRaisesRegex(ProviderError, "6000000"):
            self.fetch(reply(400, too_far))

    def test_speeds_are_capped_like_osrm(self):
        # even if the timing says 1 second for 3.3 km, the truck can't beat 65 mph
        with mock.patch.object(ors, "drive_time_along", return_value=(1.0, 3336.0)):
            [route], _ = self.fetch(reply(200, {"features": [FEATURE]}))
        mph = route.distance_m / METERS_PER_MILE / (route.duration_s / 3600)
        self.assertAlmostEqual(mph, 65, places=3)

    def test_gross_weight_adds_the_empty_truck(self):
        self.assertEqual(ors.gross_tonnes(42_000), 34)  # 75,000 lb
        self.assertEqual(ors.gross_tonnes(0), 15)


@override_settings(ROUTING=ROUTING)
class UsTruckTimeTests(SimpleTestCase):
    """openrouteservice picks the roads; OSRM's (capped) speeds time them."""

    def setUp(self):
        cache.clear()

    def parse(self, osrm_result):
        with mock.patch.object(ors, "drive_time_along", **osrm_result) as timing:
            route = ors._parse_route(FEATURE)
        return route, timing

    def test_whole_route_takes_osrms_time_with_the_step_shape_kept(self):
        route, _ = self.parse({"return_value": (200.0, 3336.0)})  # two thirds of openrouteservice's 300 s
        self.assertAlmostEqual(route.duration_s, 200.0)
        self.assertAlmostEqual(route.cum_time_s[1], 40.0)  # first step was 60 of 300 s, so 40 of 200

    def test_route_fails_when_osrm_takes_other_roads(self):
        # mixing openrouteservice's slow times with OSRM's would make the comparison unfair
        with self.assertRaisesRegex(ProviderError, "Could not time"):
            self.parse({"return_value": (200.0, 3336.0 * 1.2)})

    def test_route_fails_when_osrm_is_down(self):
        with self.assertRaises(ProviderError):
            self.parse({"side_effect": ProviderError("down")})


@override_settings(ROUTING=ROUTING)
class DriveTimeAlongTests(SimpleTestCase):
    def test_samples_the_path_with_bearings_and_caps_speed(self):
        from routing.services import osrm

        # 100 km due north, a vertex every km
        coords = [(35.0 + i * 0.009, -90.0) for i in range(101)]
        cum = [i * 1000.0 for i in range(101)]
        answer = {"code": "Ok", "routes": [{"legs": [{"annotation": {"distance": [100_000.0], "duration": [3000.0]}}]}]}
        with mock.patch.object(osrm, "http_get", return_value=reply(200, answer)) as get:
            seconds, metres = osrm.drive_time_along(coords, cum)

        url, params = get.call_args.args
        self.assertEqual(url.count(";"), 5)  # every 20 km: 0, 20, 40, 60, 80, 100 km
        bearings = params["bearings"].split(";")
        self.assertEqual((bearings[0], bearings[-1]), ("", ""))
        self.assertTrue(all(b == "0,45" for b in bearings[1:-1]))  # heading north, ±45°
        self.assertEqual(metres, 100_000.0)
        # 100 km in 3000 s is 74.6 mph; capped at 65 mph it takes longer
        self.assertAlmostEqual(seconds, 100_000 / (65 * METERS_PER_MILE / 3600))

    def test_long_paths_are_timed_in_pieces(self):
        from routing.services import osrm

        # 4,000 km: 201 sample points, so three requests of up to 80 that share their ends
        coords = [(30.0 + i * 0.009, -90.0) for i in range(4001)]
        cum = [i * 1000.0 for i in range(4001)]
        answer = {"code": "Ok", "routes": [{"legs": [{"annotation": {"distance": [1000.0], "duration": [60.0]}}]}]}
        with mock.patch.object(osrm, "http_get", return_value=reply(200, answer)) as get:
            seconds, _ = osrm.drive_time_along(coords, cum)
        sizes = [call.args[0].count(";") + 1 for call in get.call_args_list]
        self.assertEqual(sizes, [80, 80, 43])
        self.assertTrue(all(n <= osrm.WAYPOINTS_PER_REQUEST for n in sizes))
        self.assertAlmostEqual(seconds, 3 * 60.0)


@override_settings(ROUTING=ROUTING)
class TruckOrCarTests(SimpleTestCase):
    ORIGIN, DESTINATION = (35.0, -90.0), (36.5, -90.0)

    def setUp(self):
        cache.clear()
        # three clearly different roads
        self.roads = [straight_route(hours=h, start=(35.0, -90.0 - i)) for i, h in enumerate((10, 10.5, 11))]

    def by_waypoints(self, waypoints, *_):
        # main route -> road 0, each via-point -> the next road
        vias = [route_options._via_point(self.ORIGIN, self.DESTINATION, f, o) for f, o in route_options.VIA_CANDIDATES]
        if len(waypoints) == 2:
            return [self.roads[0]]
        i = vias.index(waypoints[1])
        return [self.roads[i + 1]] if i < 2 else []

    def test_uses_truck_routes_when_a_key_is_set(self):
        with (
            mock.patch.object(ors, "fetch_routes", side_effect=self.by_waypoints) as truck,
            mock.patch.object(route_options, "fetch_routes") as car,
        ):
            result = route_options.route_options(self.ORIGIN, self.DESTINATION, load_lbs=42_000)
        self.assertEqual(result.profile, "truck")
        self.assertEqual(len(result.routes), 3)
        self.assertEqual(result.gross_lbs, 75_000)
        self.assertEqual(truck.call_args.args[1], 34)  # tonnes
        car.assert_not_called()

    def test_cached_routes_report_this_requests_weight(self):
        with mock.patch.object(ors, "fetch_routes", side_effect=self.by_waypoints):
            route_options.route_options(self.ORIGIN, self.DESTINATION, load_lbs=40_000)  # 73,000 lb: 33 t
            again = route_options.route_options(self.ORIGIN, self.DESTINATION, load_lbs=40_400)  # also 33 t, cached
        self.assertEqual(again.gross_lbs, 73_400)

    def test_falls_back_to_car_routes_when_truck_routing_fails(self):
        with (
            mock.patch.object(ors, "fetch_routes", side_effect=ProviderError("quota used up")),
            mock.patch.object(route_options, "fetch_routes", side_effect=self.by_waypoints),
        ):
            result = route_options.route_options(self.ORIGIN, self.DESTINATION, load_lbs=42_000)
        self.assertEqual(result.profile, "car")
        self.assertEqual(len(result.routes), 3)
        self.assertIn("Truck routing is unavailable right now (quota used up)", result.warnings[0])

    def test_quota_running_out_midway_falls_back_instead_of_showing_fewer_routes(self):
        def main_only(waypoints, weight_t):
            if len(waypoints) == 2:
                return [self.roads[0]]
            raise ProviderError("quota used up")

        with (
            mock.patch.object(ors, "fetch_routes", side_effect=main_only),
            mock.patch.object(route_options, "fetch_routes", side_effect=self.by_waypoints),
        ):
            result = route_options.route_options(self.ORIGIN, self.DESTINATION)
        self.assertEqual((result.profile, len(result.routes)), ("car", 3))

    def test_fallback_is_not_cached(self):
        with (
            mock.patch.object(ors, "fetch_routes", side_effect=ProviderError("down")),
            mock.patch.object(route_options, "fetch_routes", side_effect=self.by_waypoints),
        ):
            route_options.route_options(self.ORIGIN, self.DESTINATION)
        with mock.patch.object(ors, "fetch_routes", side_effect=self.by_waypoints):
            result = route_options.route_options(self.ORIGIN, self.DESTINATION)
        self.assertEqual(result.profile, "truck")  # back to trucks as soon as the service is
