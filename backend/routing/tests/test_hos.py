from django.test import SimpleTestCase

from routing import hos

H = 3600


class StopsTests(SimpleTestCase):
    def test_no_stops_on_a_short_drive(self):
        self.assertEqual(hos.stops_before(5 * H), (0, 0))
        self.assertEqual(hos.clock_time(5 * H), 5 * H)

    def test_break_comes_after_eight_hours(self):
        self.assertEqual(hos.stops_before(8 * H), (0, 0))  # reaching 8 h, not past it
        self.assertEqual(hos.stops_before(9 * H), (1, 0))
        self.assertEqual(hos.clock_time(9 * H), 9.5 * H)

    def test_rest_comes_after_eleven_hours(self):
        self.assertEqual(hos.stops_before(11 * H), (1, 0))  # done driving, no rest needed yet
        self.assertEqual(hos.stops_before(12 * H), (1, 1))
        self.assertEqual(hos.clock_time(12 * H), 12 * H + 0.5 * H + 10 * H)

    def test_second_shift_gets_its_own_break(self):
        # 11 h + break + rest, then 9 more hours: past 8 h in the new shift
        self.assertEqual(hos.stops_before(20 * H), (2, 1))
        self.assertEqual(hos.clock_time(20 * H), 20 * H + 2 * 0.5 * H + 10 * H)
