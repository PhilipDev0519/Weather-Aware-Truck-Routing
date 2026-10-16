from django.test import SimpleTestCase

from routing.route_options import VIA_CANDIDATES, remove_spurs
from routing.services import ProviderError
from routing.services.osrm import Route

from .helpers import straight_route


class SpurRemovalTests(SimpleTestCase):
    def test_out_and_back_detour_is_cut(self):
        a, b, c, d = (35.0, -90.0), (35.1, -90.0), (35.1, -90.1), (35.2, -90.0)
        # a → b → c → b → d: the trip to c and back is pointless.
        route = Route(
            coords=[a, b, c, b, d],
            cum_dist_m=[0, 10, 20, 30, 40],
            cum_time_s=[0, 100, 200, 300, 400],
        )
        cleaned = remove_spurs(route)
        self.assertEqual(cleaned.coords, [a, b, d])
        self.assertEqual(cleaned.cum_dist_m, [0, 10, 20])
        self.assertEqual(cleaned.cum_time_s, [0, 100, 200])


class OptionChoiceTests(SimpleTestCase):
    """Which three routes get picked, with OSRM faked out."""

    ORIGIN, DESTINATION = (35.0, -90.0), (36.5, -90.0)

    def setUp(self):
        from django.core.cache import cache

        cache.clear()

    def options(self, main, by_via):
        # by_via: index into VIA_CANDIDATES -> routes through that via-point
        from unittest import mock

        from routing import route_options

        vias = [route_options._via_point(self.ORIGIN, self.DESTINATION, f, o) for f, o in VIA_CANDIDATES]

        def fake_fetch(waypoints, alternatives=0):
            if len(waypoints) == 2:
                return main
            routes = by_via.get(vias.index(waypoints[1]), [])
            if isinstance(routes, Exception):
                raise routes
            return routes

        with (
            mock.patch.object(route_options.ors, "is_enabled", return_value=False),
            mock.patch.object(route_options, "fetch_routes", side_effect=fake_fetch),
        ):
            result = route_options.route_options(self.ORIGIN, self.DESTINATION)
        return result.routes, result.warnings

    def test_route_needing_an_overnight_rest_is_swapped_for_a_better_one(self):
        fastest = straight_route(hours=10, start=(35.0, -90.0))
        close_second = straight_route(hours=10.5, start=(35.0, -91.0))
        overnight = straight_route(hours=13, start=(35.0, -92.0))  # 13 h driving means a 10 h rest
        later_find = straight_route(hours=11, start=(35.0, -93.0))  # only from the second batch of via-points

        routes, warnings = self.options([fastest], {0: [close_second], 1: [overnight], 4: [later_find]})
        self.assertEqual(routes, [fastest, close_second, later_find])
        self.assertEqual(warnings, [])

    def test_keeps_a_slow_third_route_when_nothing_better_exists(self):
        fastest = straight_route(hours=10, start=(35.0, -90.0))
        close_second = straight_route(hours=10.5, start=(35.0, -91.0))
        overnight = straight_route(hours=13, start=(35.0, -92.0))

        routes, _ = self.options([fastest], {0: [close_second], 1: [overnight]})
        self.assertEqual(routes, [fastest, close_second, overnight])

    def test_copies_of_the_same_road_are_not_separate_options(self):
        fastest = straight_route(hours=10, start=(35.0, -90.0))
        same_road = straight_route(hours=10.2, start=(35.0, -90.0))

        routes, warnings = self.options([fastest, same_road], {})
        self.assertEqual(routes, [fastest])
        self.assertIn("Only 1 sensible route", warnings[0])

    def test_result_with_a_failed_via_point_is_not_cached(self):
        fastest = straight_route(hours=10, start=(35.0, -90.0))
        close_second = straight_route(hours=10.5, start=(35.0, -91.0))
        better_third = straight_route(hours=11, start=(35.0, -92.0))
        overnight = straight_route(hours=13, start=(35.0, -93.0))

        # The first time, the via-point with the better third route fails...
        flaky = {0: [close_second], 1: ProviderError("timed out"), 2: [overnight]}
        routes, _ = self.options([fastest], flaky)
        self.assertEqual(routes, [fastest, close_second, overnight])

        # ...so the next plan asks again instead of reusing that weaker set.
        routes, _ = self.options([fastest], {0: [close_second], 1: [better_third], 2: [overnight]})
        self.assertEqual(routes, [fastest, close_second, better_third])

    def test_complete_result_is_cached(self):
        fastest = straight_route(hours=10, start=(35.0, -90.0))
        close_second = straight_route(hours=10.5, start=(35.0, -91.0))
        third = straight_route(hours=11, start=(35.0, -92.0))

        first, _ = self.options([fastest], {0: [close_second], 1: [third]})
        again, _ = self.options([], {})  # would find nothing if it asked again
        self.assertEqual(again, first)
