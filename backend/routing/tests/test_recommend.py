from django.test import SimpleTestCase

from routing.recommend import deciding_criterion, explain, rank_keys, rank_routes, ranking_summary


def route(name, hours, severe=0.0, high=0.0, avg=0.0, no_travel=0.0):
    return {
        "name": name,
        "duration_hours": hours,
        "avg_risk": avg,
        "risk_miles": {"no_travel": no_travel, "severe": severe, "high": high},
    }


class RankingTests(SimpleTestCase):
    def names(self, routes):
        return [r["name"] for r in rank_routes(routes)]

    def test_fewest_severe_miles_wins_over_time(self):
        fast = route("fast", 8, severe=20)
        slow = route("slow", 12, severe=0, high=300)
        self.assertEqual(self.names([fast, slow]), ["slow", "fast"])

    def test_high_miles_break_severe_tie(self):
        a = route("a", 8, severe=5, high=50)
        b = route("b", 10, severe=5, high=10)
        self.assertEqual(self.names([a, b]), ["b", "a"])

    def test_average_risk_breaks_high_tie(self):
        a = route("a", 8, high=10, avg=0.9)
        b = route("b", 10, high=10, avg=0.4)
        self.assertEqual(self.names([a, b]), ["b", "a"])

    def test_travel_time_is_last_tiebreaker(self):
        a = route("a", 10.5)
        b = route("b", 9.75)
        self.assertEqual(self.names([a, b]), ["b", "a"])

    def test_no_travel_miles_rank_worst(self):
        blocked = route("blocked", 8, no_travel=1)
        severe = route("severe", 9, severe=100)
        self.assertEqual(self.names([blocked, severe]), ["severe", "blocked"])

    def test_float_noise_does_not_decide(self):
        a = route("a", 9, severe=10.00001)
        b = route("b", 10, severe=10.0)
        self.assertEqual(self.names([a, b]), ["a", "b"])


class ExplainTests(SimpleTestCase):
    def test_says_which_rule_won_and_what_was_equal(self):
        best, other = route("Route B", 10, high=10), route("Route A", 8, high=50)
        self.assertEqual(
            explain(best, other),
            "Route B has the fewest High miles: 10.0 mi, against 50.0 mi on Route A. Severe miles is the same on both.",
        )

    def test_quickest_route_when_safety_is_equal(self):
        self.assertEqual(
            explain(route("Route A", 24 + 38 / 60), route("Route B", 25 + 19 / 60)),
            "Route A is the quickest: 24h 38m, against 25h 19m on Route B. "
            "Severe miles, High miles and average risk are the same on both.",
        )

    def test_safety_wins_without_mentioning_ties(self):
        text = explain(route("Route B", 12), route("Route A", 9, severe=42))
        self.assertEqual(text, "Route B has the fewest Severe miles: 0.0 mi, against 42.0 mi on Route A.")

    def test_single_route_and_full_tie(self):
        self.assertEqual(explain(route("Route A", 5), None), "Route A is the only route found.")
        self.assertEqual(
            explain(route("Route A", 5), route("Route B", 5)), "Route A and Route B are equal on every rule."
        )


class DecidingCriterionTests(SimpleTestCase):
    def test_names_the_first_criterion_that_differs(self):
        self.assertEqual(deciding_criterion(route("b", 10, high=10), route("a", 8, high=50)), "high")
        self.assertEqual(deciding_criterion(route("b", 9), route("a", 10)), "travel_time")
        self.assertEqual(deciding_criterion(route("b", 9, severe=0), route("a", 8, severe=5)), "severe")

    def test_float_noise_is_a_tie(self):
        self.assertEqual(deciding_criterion(route("a", 9, severe=10.00001), route("b", 10, severe=10.0)), "travel_time")

    def test_nothing_decides_without_a_runner_up_or_on_a_full_tie(self):
        self.assertIsNone(deciding_criterion(route("a", 9), None))
        self.assertIsNone(deciding_criterion(route("a", 9), route("b", 9)))

    def test_summary_lists_criteria_in_the_briefs_order(self):
        summary = ranking_summary(route("b", 9), route("a", 10))
        self.assertEqual(
            [c["id"] for c in summary["criteria"]], ["no_travel", "severe", "high", "avg_risk", "travel_time"]
        )
        self.assertEqual(summary["decided_by"], "travel_time")

    def test_rank_keys_are_the_rounded_values_ranked_on(self):
        keys = rank_keys(route("a", 10.25, severe=12.34, avg=0.456))
        self.assertEqual(keys, {"no_travel": 0.0, "severe": 12.3, "high": 0.0, "avg_risk": 0.46, "travel_time": 615})
