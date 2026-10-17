import type { Checkpoint, RouteOption } from "../types";

// Small, readable stand-ins for API data in component tests.

export function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    index: 0,
    mile: 0,
    lat: 35,
    lon: -90,
    eta: "2026-01-10T12:00:00+00:00",
    hours_from_departure: 0,
    weather: { wind_mph: 10, gust_mph: 15, wind_from_deg: 270, rain_in_hr: 0, snow_in_hr: 0, temp_f: 40 },
    level: 0,
    reasons: [],
    ...overrides,
  };
}

export function route(overrides: Partial<RouteOption> = {}): RouteOption {
  return {
    id: "A",
    name: "Route A",
    recommended: false,
    rank: 1,
    distance_miles: 100,
    duration_hours: 2,
    driving_hours: 2,
    stops: { breaks: 0, rests: 0 },
    extra_rests: 0,
    stop_timeline: [],
    arrival: "2026-01-10T14:00:00+00:00",
    risk_miles: { low: 100, moderate: 0, high: 0, severe: 0, no_travel: 0, unknown: 0 },
    avg_risk: 0,
    max_level: 0,
    checkpoints: [checkpoint()],
    segments: [],
    geometry: [],
    ...overrides,
  };
}
