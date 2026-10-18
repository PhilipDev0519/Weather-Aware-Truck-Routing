"""The risk rules, checked against the case table shared with the frontend.

The browser classifies the heatmap itself (frontend/src/risk.ts), so the rules
exist in two languages. Both test suites read the same case table,
frontend/src/test/risk-cases.json: this one checks that its `rules` are what
the server sends and that Python gives every case's level;
frontend/src/risk.test.ts checks the TypeScript the same way.
"""

import json
from pathlib import Path

from django.test import SimpleTestCase

from routing.risk import assess, rules_payload

CASES_FILE = Path(__file__).resolve().parents[3] / "frontend" / "src" / "test" / "risk-cases.json"


class SharedRiskCasesTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.spec = json.loads(CASES_FILE.read_text(encoding="utf-8"))

    def test_rules_are_what_the_server_sends(self):
        # The frontend tests classify with these, so they must match /api/rules exactly.
        self.assertEqual(self.spec["rules"], rules_payload())

    def test_every_case_gets_its_level(self):
        self.assertGreater(len(self.spec["cases"]), 30)
        for case in self.spec["cases"]:
            with self.subTest(**case):
                level = assess(case["wind_mph"], case["rain_in_hr"], case["snow_in_hr"], case["load_lbs"]).level
                self.assertEqual(level.label, case["level"])
