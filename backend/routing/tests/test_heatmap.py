from unittest import mock

from django.test import SimpleTestCase

from routing import heatmap
from routing.geo import haversine_m

from .helpers import DEPARTURE, constant_forecast

LINE = [(41.88, -87.63), (39.8, -89.6), (38.6, -90.2), (35.15, -90.05)]  # Chicago → Memphis-ish


class CorridorGridTests(SimpleTestCase):
    def test_cells_stay_within_budget_and_buffer(self):
        grid = heatmap.corridor_grid([LINE], buffer_km=60, max_cells=200)
        self.assertLessEqual(len(grid["cells"]), 200)
        self.assertGreater(len(grid["cells"]), 20)
        self.assertEqual(len(grid["cells"]), len(grid["points"]))
        # Cell indices are valid and unique in the rows × cols image.
        self.assertEqual(len(set(grid["cells"])), len(grid["cells"]))
        self.assertTrue(all(0 <= i < grid["rows"] * grid["cols"] for i in grid["cells"]))

    def test_bounds_contain_route(self):
        (south, west), (north, east) = heatmap.corridor_grid([LINE])["bounds"]
        for lat, lon in LINE:
            self.assertTrue(south < lat < north and west < lon < east)

    def test_far_cells_are_excluded(self):
        grid = heatmap.corridor_grid([LINE], buffer_km=60)
        for p in grid["points"]:
            nearest = min(haversine_m(p, q) for q in LINE)
            self.assertLess(nearest, 400_000)


class BuildHeatmapTests(SimpleTestCase):
    def test_frames_cover_0_to_48_hours(self):
        def fake(points, start, hours):
            return [constant_forecast(wind=47) for _ in points]

        with mock.patch.object(heatmap, "get_forecasts", side_effect=fake):
            result = heatmap.build_heatmap([LINE], DEPARTURE, load_lbs=35_000)

        self.assertEqual(len(result["frames"]["risk"]), 49)
        n = len(result["cells"])
        self.assertTrue(all(len(frame) == n for frame in result["frames"]["wind"]))
        # 47 mph with a 35,000 lb load is No Travel (load rule).
        self.assertEqual(set(result["frames"]["risk"][0]), {4})
