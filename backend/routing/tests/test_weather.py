from datetime import timedelta

from django.test import SimpleTestCase

from routing.services import weather

from .helpers import DEPARTURE


class ForecastSamplingTests(SimpleTestCase):
    def setUp(self):
        self.forecast = weather.Forecast(
            start=DEPARTURE,
            wind_mph=[0, 10, 20, 30],
            gust_mph=[0, 15, 25, 35],
            wind_from_deg=[180, 190, 200, 210],
            rain_in=[0.0, 0.1, 0.2, 0.3],
            snow_in=[0.0, 0.0, 0.0, 0.0],
            temp_f=[30, 30, 30, 30],
        )

    def test_wind_uses_nearest_hour_precip_uses_containing_hour(self):
        c = self.forecast.at(DEPARTURE + timedelta(hours=1, minutes=20))
        self.assertEqual(c.wind_mph, 10)  # nearest: 01:00
        self.assertEqual(c.wind_from_deg, 190)
        self.assertEqual(c.rain_in_hr, 0.2)  # rain summed over 01:00–02:00

    def test_on_the_hour(self):
        c = self.forecast.at(DEPARTURE + timedelta(hours=2))
        self.assertEqual((c.wind_mph, c.rain_in_hr), (20, 0.2))

    def test_beyond_window_is_none(self):
        self.assertIsNone(self.forecast.at(DEPARTURE + timedelta(hours=10)))


class ParsingTests(SimpleTestCase):
    def test_units_are_converted_to_inches(self):
        raw = {"hourly": {"wind_speed_10m": [12], "rain": [20.4], "showers": [5.0], "snowfall": [2.54]}}
        forecast = weather._parse(raw, DEPARTURE, hours=1)
        self.assertAlmostEqual(forecast.rain_in[0], 1.0)  # (20.4 + 5.0) mm
        self.assertAlmostEqual(forecast.snow_in[0], 1.0)  # 2.54 cm
        self.assertEqual(forecast.wind_mph[0], 12)

    def test_nulls_are_preserved(self):
        raw = {"hourly": {"wind_speed_10m": [None], "rain": [None], "showers": [None], "snowfall": [None]}}
        self.assertIsNone(weather._parse(raw, DEPARTURE, hours=1).at_hour(0))


class WindowTests(SimpleTestCase):
    def test_window_always_covers_48_hours(self):
        self.assertEqual(weather.window_hours(0), 49)
        self.assertEqual(weather.window_hours(48), 49)

    def test_window_grows_in_whole_days(self):
        self.assertEqual(weather.window_hours(48.2), 73)
        self.assertEqual(weather.window_hours(80), 97)


class PartialFailureTests(SimpleTestCase):
    def test_batches_that_worked_are_cached_when_another_fails(self):
        from unittest import mock

        from django.core.cache import cache

        from routing.services import ProviderError

        cache.clear()
        points = [(30 + i, -90.0) for i in range(weather.BATCH_SIZE + 1)]  # two batches
        calls = []

        def fake_fetch(batch, start, hours):
            calls.append(len(batch))
            if len(batch) == 1:
                raise ProviderError("rate limited")
            return [None] * len(batch)

        with mock.patch.object(weather, "_fetch", side_effect=fake_fetch):
            with self.assertRaises(ProviderError):
                weather.get_forecasts(points, DEPARTURE, 49)
            calls.clear()
            with self.assertRaises(ProviderError):
                weather.get_forecasts(points, DEPARTURE, 49)
        self.assertEqual(calls, [1])  # only the failed point is asked for again
