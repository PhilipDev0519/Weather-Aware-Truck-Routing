"""Pick the best route.

Routes are sorted by the spec's priorities: Severe miles, High miles, average
risk, then travel time. No Travel miles go in front of all of them because a
No Travel stretch is worse than any amount of Severe.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Criterion:
    id: str
    label: str
    key: Callable[[dict], float]
    describe: Callable[[dict], str]


def _miles(level: str) -> Criterion:
    label = level.replace("_", " ").title() + " miles"
    # rounded so 10.00001 vs 10.0 counts as a tie
    return Criterion(
        level, label, lambda r: round(r["risk_miles"][level], 1), lambda r: f"{r['risk_miles'][level]:.1f} mi"
    )


def format_hours(hours: float) -> str:
    minutes = round(hours * 60)
    return f"{minutes // 60}h {minutes % 60:02d}m"


CRITERIA = (
    _miles("no_travel"),
    _miles("severe"),
    _miles("high"),
    Criterion("avg_risk", "average risk", lambda r: round(r["avg_risk"], 2), lambda r: f"{r['avg_risk']:.2f}"),
    Criterion(
        "travel_time",
        "travel time",
        lambda r: round(r["duration_hours"] * 60),  # minutes
        lambda r: format_hours(r["duration_hours"]),
    ),
)


def rank_routes(routes: list[dict]) -> list[dict]:
    return sorted(routes, key=lambda r: tuple(c.key(r) for c in CRITERIA))


def rank_keys(route: dict) -> dict[str, float]:
    """The exact values a route is ranked on, so the UI can show the comparison as decided."""
    return {c.id: c.key(route) for c in CRITERIA}


def deciding_criterion(best: dict, runner_up: dict | None) -> str | None:
    """The first criterion that separates the winner from the runner-up, if any."""
    if runner_up is None:
        return None
    return next((c.id for c in CRITERIA if c.key(best) != c.key(runner_up)), None)


def ranking_summary(best: dict, runner_up: dict | None) -> dict:
    return {
        "criteria": [{"id": c.id, "label": c.label} for c in CRITERIA],
        "decided_by": deciding_criterion(best, runner_up),
    }


def explain(best: dict, runner_up: dict | None) -> str:
    if runner_up is None:
        return f"{best['name']} is the only available route."

    for i, criterion in enumerate(CRITERIA):
        if criterion.key(best) == criterion.key(runner_up):
            continue
        text = (
            f"{best['name']} has the lowest {criterion.label} "
            f"({criterion.describe(best)} vs {criterion.describe(runner_up)} on {runner_up['name']})"
        )
        tied = [c.label for c in CRITERIA[1:i]]  # no point mentioning No Travel when it's 0 everywhere
        return text + (f", with {', '.join(tied)} tied." if tied else ".")

    return f"{best['name']} and {runner_up['name']} are equivalent on every criterion."
