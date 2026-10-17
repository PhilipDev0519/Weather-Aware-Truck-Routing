"""Hours-of-service breaks for one driver (FMCSA property-carrying rules).

Two rules affect a single trip:
  * a 30-minute break once you've driven 8 hours
  * 10 hours off duty once you've driven 11 hours
The 14-hour on-duty window never kicks in on its own here, since 11 h of
driving plus a 30-minute break fits inside it.

Route times are pure driving time; these helpers turn driving time into
clock time so ETAs (and so the weather we look up) include the stops.
"""

from __future__ import annotations

import math

SHIFT_DRIVING_S = 11 * 3600
BREAK_AFTER_S = 8 * 3600
BREAK_S = 30 * 60
REST_S = 10 * 3600


def stops_before(driving_s: float) -> tuple[int, int]:
    """(30-minute breaks, 10-hour rests) taken before reaching this much driving."""
    if driving_s <= 0:
        return 0, 0
    # A rest is only taken if there's more driving after the 11 hours.
    rests = math.ceil(driving_s / SHIFT_DRIVING_S) - 1
    into_shift = driving_s - rests * SHIFT_DRIVING_S
    breaks = rests + (1 if into_shift > BREAK_AFTER_S else 0)
    return breaks, rests


def stop_schedule(driving_s: float) -> list[tuple[str, float, float]]:
    """Every stop on a drive of this length: (kind, driving time it starts at, length).

    Same rules as stops_before: a 30-minute break once a shift has passed
    8 hours of driving, and a 10-hour rest at every 11 hours if there's more
    driving after it.
    """
    stops = []
    shift_start = 0.0
    while True:
        if driving_s - shift_start > BREAK_AFTER_S:
            stops.append(("break", shift_start + BREAK_AFTER_S, BREAK_S))
        if driving_s - shift_start <= SHIFT_DRIVING_S:
            return stops
        shift_start += SHIFT_DRIVING_S
        stops.append(("rest", shift_start, REST_S))


def clock_time(driving_s: float) -> float:
    """Elapsed time once the required stops are added."""
    breaks, rests = stops_before(driving_s)
    return driving_s + breaks * BREAK_S + rests * REST_S
