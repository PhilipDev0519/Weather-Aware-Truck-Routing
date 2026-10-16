from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import IntEnum


def truncate(value: float, decimals: int) -> float:
    """Round down for display, so a value never shows up in the band above its own.

    0.496 in/hr is High; rounded it would read "0.50", which is Severe.
    """
    scale = 10**decimals
    return math.floor(value * scale + 1e-9) / scale


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class Thresholds:
    name: str
    unit: str
    # lower edge of each band
    moderate: float
    high: float
    severe: float
    no_travel: float
    # the spec says ">=55 mph" for wind but ">1.00" / ">3.0" for rain and snow
    no_travel_inclusive: bool

    def classify(self, value: float) -> RiskLevel:
        if value > self.no_travel or (self.no_travel_inclusive and value >= self.no_travel):
            return RiskLevel.NO_TRAVEL
        if value >= self.severe:
            return RiskLevel.SEVERE
        if value >= self.high:
            return RiskLevel.HIGH
        if value >= self.moderate:
            return RiskLevel.MODERATE
        return RiskLevel.LOW

    def as_dict(self) -> dict:
        return {
            "unit": self.unit,
            "edges": [self.moderate, self.high, self.severe, self.no_travel],
            "no_travel_inclusive": self.no_travel_inclusive,
        }


# Bands are [lower, next lower), so 0.25 in/hr of rain is High, not Moderate.
WIND = Thresholds("Wind", "mph", 25, 35, 45, 55, no_travel_inclusive=True)
RAIN = Thresholds("Rain", "in/hr", 0.10, 0.25, 0.50, 1.00, no_travel_inclusive=False)
SNOW = Thresholds("Snow", "in/hr", 0.5, 1.0, 2.0, 3.0, no_travel_inclusive=False)

# (wind band, load must be above, level it becomes)
LOAD_RULES = (
    (RiskLevel.SEVERE, 30_000, RiskLevel.NO_TRAVEL),  # 45-54 mph
    (RiskLevel.HIGH, 40_000, RiskLevel.SEVERE),  # 35-44 mph
)


@dataclass
class Assessment:
    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    load_adjusted: bool
    reasons: list[str] = field(default_factory=list)


def wind_level_for_load(wind_mph: float, load_lbs: float) -> tuple[RiskLevel, bool]:
    base = WIND.classify(wind_mph)
    for wind_band, min_load, result in LOAD_RULES:
        if base == wind_band and load_lbs > min_load:
            return result, True
    return base, False


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lbs: float) -> Assessment:
    wind_level, adjusted = wind_level_for_load(wind_mph, load_lbs)
    rain_level = RAIN.classify(rain_in_hr)
    snow_level = SNOW.classify(snow_in_hr)

    reasons = []
    if wind_level > RiskLevel.LOW:
        load_note = f" with {load_lbs:,.0f} lb load" if adjusted else ""
        reasons.append(f"Wind {truncate(wind_mph, 0):.0f} mph{load_note} → {wind_level.label}")
    if rain_level > RiskLevel.LOW:
        reasons.append(f"Rain {truncate(rain_in_hr, 2):.2f} in/hr → {rain_level.label}")
    if snow_level > RiskLevel.LOW:
        reasons.append(f"Snow {truncate(snow_in_hr, 2):.2f} in/hr → {snow_level.label}")

    level = max(wind_level, rain_level, snow_level)
    return Assessment(level, wind_level, rain_level, snow_level, adjusted, reasons)


def rules_payload() -> dict:
    return {
        "levels": [{"value": int(level), "label": level.label} for level in RiskLevel],
        "wind": WIND.as_dict(),
        "rain": RAIN.as_dict(),
        "snow": SNOW.as_dict(),
        "load_rules": [
            "≥55 mph → No Travel for any load",
            "45–54 mph + >30,000 lb → No Travel",
            "35–44 mph + >40,000 lb → Severe",
        ],
        # the same rules as data, so the map can apply them exactly like we do
        "load_adjustments": [
            {"wind_level": int(band), "above_lbs": min_load, "level": int(result)}
            for band, min_load, result in LOAD_RULES
        ],
    }
