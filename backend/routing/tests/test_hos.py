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


class StopScheduleTests(SimpleTestCase):
    def test_stops_on_a_long_drive(self):
        # 23 h of driving: break at 8 h, rest at 11 h, break at 19 h, rest at 22 h
        hours = [(kind, at / 3600, length / 3600) for kind, at, length in hos.stop_schedule(23 * 3600)]
        self.assertEqual(hours, [("break", 8, 0.5), ("rest", 11, 10), ("break", 19, 0.5), ("rest", 22, 10)])

    def test_agrees_with_the_stop_counts(self):
        for driving_h in (0, 7.9, 8, 8.1, 10.9, 11, 11.1, 16, 19.5, 22, 22.5, 30, 40):
            with self.subTest(driving_h=driving_h):
                kinds = [kind for kind, _, _ in hos.stop_schedule(driving_h * 3600)]
                self.assertEqual((kinds.count("break"), kinds.count("rest")), hos.stops_before(driving_h * 3600))
