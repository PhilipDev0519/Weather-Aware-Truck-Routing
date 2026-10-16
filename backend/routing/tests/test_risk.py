from django.test import SimpleTestCase

from routing.risk import RAIN, SNOW, WIND, RiskLevel, assess, rules_payload, truncate, wind_level_for_load

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


class ThresholdTests(SimpleTestCase):
    def check(self, thresholds, cases):
        for value, expected in cases:
            with self.subTest(condition=thresholds.name, value=value):
                self.assertEqual(thresholds.classify(value), expected)

    def test_wind_bands(self):
        # <25 | 25–34 | 35–44 | 45–54 | >=55 mph
        self.check(
            WIND, [(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, NT), (80, NT)]
        )

    def test_rain_bands(self):
        # <0.10 | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | >1.00 in/hr
        self.check(
            RAIN, [(0, L), (0.099, L), (0.10, M), (0.249, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S), (1.001, NT)]
        )

    def test_snow_bands(self):
        # <0.5 | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | >3.0 in/hr
        self.check(SNOW, [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, NT)])


class LoadRuleTests(SimpleTestCase):
    def test_55_mph_is_no_travel_for_any_load(self):
        self.assertEqual(wind_level_for_load(55, 0), (NT, False))
        self.assertEqual(wind_level_for_load(60, 80_000)[0], NT)

    def test_45_to_54_mph_over_30k_is_no_travel(self):
        self.assertEqual(wind_level_for_load(45, 30_001), (NT, True))
        self.assertEqual(wind_level_for_load(54.9, 45_000), (NT, True))

    def test_45_to_54_mph_at_or_below_30k_stays_severe(self):
        self.assertEqual(wind_level_for_load(50, 30_000), (S, False))

    def test_35_to_44_mph_over_40k_is_severe(self):
        self.assertEqual(wind_level_for_load(35, 40_001), (S, True))
        self.assertEqual(wind_level_for_load(44.9, 80_000), (S, True))

    def test_35_to_44_mph_at_or_below_40k_stays_high(self):
        self.assertEqual(wind_level_for_load(40, 40_000), (H, False))

    def test_load_does_not_affect_lower_winds(self):
        self.assertEqual(wind_level_for_load(30, 80_000), (M, False))
        self.assertEqual(wind_level_for_load(10, 80_000), (L, False))


class AssessTests(SimpleTestCase):
    def test_overall_level_is_worst_condition(self):
        result = assess(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0.6, load_lbs=20_000)
        self.assertEqual(result.level, H)
        self.assertEqual((result.wind_level, result.rain_level, result.snow_level), (L, H, M))

    def test_load_rule_can_dominate(self):
        result = assess(wind_mph=38, rain_in_hr=0.12, snow_in_hr=0, load_lbs=45_000)
        self.assertEqual(result.level, S)
        self.assertTrue(result.load_adjusted)
        self.assertIn("45,000 lb", result.reasons[0])

    def test_calm_weather_has_no_reasons(self):
        result = assess(5, 0, 0, 80_000)
        self.assertEqual(result.level, L)
        self.assertEqual(result.reasons, [])

    def test_reason_text_never_shows_the_next_band(self):
        # 34.6 mph is Moderate; rounded it would read "35 mph", which is High
        self.assertEqual(assess(34.6, 0.496, 0, 0).reasons, ["Wind 34 mph → Moderate", "Rain 0.49 in/hr → High"])


class TruncateTests(SimpleTestCase):
    def test_never_rounds_up_into_next_band(self):
        self.assertEqual(truncate(0.4996, 3), 0.499)
        self.assertEqual(truncate(24.96, 1), 24.9)

    def test_exact_values_survive_float_error(self):
        self.assertEqual(truncate(0.29, 2), 0.29)
        self.assertEqual(truncate(0.1, 3), 0.1)


class RulesPayloadTests(SimpleTestCase):
    def test_load_rules_are_also_sent_as_data(self):
        self.assertEqual(
            rules_payload()["load_adjustments"],
            [
                {"wind_level": 3, "above_lbs": 30_000, "level": 4},
                {"wind_level": 2, "above_lbs": 40_000, "level": 3},
            ],
        )
