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


def clock_time(driving_s: float) -> float:
    """Elapsed time once the required stops are added."""
    breaks, rests = stops_before(driving_s)
    return driving_s + breaks * BREAK_S + rests * REST_S
