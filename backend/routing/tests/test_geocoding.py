from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase

from routing.services import geocoding


def response(payload, status=200):
    return mock.Mock(status_code=status, json=mock.Mock(return_value=payload))


OPEN_METEO = {
    "results": [
        {"name": "Memphis", "admin1": "Tennessee", "country": "United States", "latitude": 35.15, "longitude": -90.05},
        {"name": "Memphis", "admin1": "Texas", "country": "United States", "latitude": 34.72, "longitude": -100.53},
    ]
}
PHOTON = {
    "features": [
        {
            "properties": {"name": "1600 Pennsylvania Ave", "city": "Washington", "country": "United States"},
            "geometry": {"coordinates": [-77.04, 38.9]},
        }
    ]
}


class GeocodingTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_place_names_use_open_meteo_only(self):
        with mock.patch.object(geocoding, "http_get", return_value=response(OPEN_METEO)) as get:
            results = geocoding.search("Memphis")
        self.assertEqual(get.call_count, 1)
        self.assertEqual(results[0]["label"], "Memphis, Tennessee, United States")

    def test_text_after_comma_narrows_results(self):
        with mock.patch.object(geocoding, "http_get", return_value=response(OPEN_METEO)):
            results = geocoding.search("Memphis, Texas")
        self.assertEqual([r["label"] for r in results], ["Memphis, Texas, United States"])

    def test_falls_back_to_photon_for_addresses(self):
        replies = [response({}), response(PHOTON)]
        with mock.patch.object(geocoding, "http_get", side_effect=replies) as get:
            results = geocoding.search("1600 Pennsylvania Ave")
        self.assertEqual(get.call_count, 2)
        self.assertEqual(results[0]["label"], "1600 Pennsylvania Ave, Washington, United States")

    def test_results_are_cached(self):
        with mock.patch.object(geocoding, "http_get", return_value=response(OPEN_METEO)) as get:
            geocoding.search("Memphis")
            geocoding.search("memphis ")
        self.assertEqual(get.call_count, 1)
