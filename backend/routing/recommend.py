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


# How each criterion reads when it's the one that picked the winner.
_WINS_BY = {
    "no_travel": "has the fewest No Travel miles",
    "severe": "has the fewest Severe miles",
    "high": "has the fewest High miles",
    "avg_risk": "has the lowest average risk",
    "travel_time": "is the quickest",
}


def explain(best: dict, runner_up: dict | None) -> str:
    """One plain sentence on why the winner beat the runner-up."""
    if runner_up is None:
        return f"{best['name']} is the only route found."

    decided = deciding_criterion(best, runner_up)
    if decided is None:
        return f"{best['name']} and {runner_up['name']} are equal on every rule."

    i = next(i for i, c in enumerate(CRITERIA) if c.id == decided)
    criterion = CRITERIA[i]
    text = (
        f"{best['name']} {_WINS_BY[decided]}: {criterion.describe(best)}, "
        f"against {criterion.describe(runner_up)} on {runner_up['name']}."
    )
    # The safety rules it didn't win on were equal; say so (No Travel goes
    # unmentioned, since it's zero almost every time).
    tied = [c.label for c in CRITERIA[1:i]]
    if tied:
        names = tied[0] if len(tied) == 1 else ", ".join(tied[:-1]) + " and " + tied[-1]
        text += f" {names[0].upper()}{names[1:]} {'is' if len(tied) == 1 else 'are'} the same on both."
    return text
