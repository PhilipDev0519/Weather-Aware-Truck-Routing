import { describe, expect, it } from "vitest";
import { joinSegments } from "./api";
import { RouteTracker, haversineMiles } from "./geo";
import type { Checkpoint, LatLng } from "./types";

const checkpoint = (mile: number, hours: number): Checkpoint => ({
  index: 0,
  mile,
  lat: 0,
  lon: 0,
  eta: "",
  hours_from_departure: hours,
  weather: null,
  level: 0,
  reasons: [],
});

describe("RouteTracker", () => {
  // Due north along a meridian: 1 degree of latitude is ~69 miles.
  const line: LatLng[] = [
    [35, -90],
    [36, -90],
    [37, -90],
  ];
  const total = haversineMiles(line[0], line[2]);
  const tracker = new RouteTracker(line, [checkpoint(0, 0), checkpoint(total, 2)], total);

  it("finds the mile reached after some hours of driving", () => {
    expect(tracker.mileAtHours(1)).toBeCloseTo(total / 2);
    expect(tracker.mileAtHours(-1)).toBe(0);
    expect(tracker.mileAtHours(5)).toBeCloseTo(total);
  });

  it("finds the position at a mile", () => {
    const [lat, lon] = tracker.positionAtMile(total / 2);
    expect(lat).toBeCloseTo(36, 3);
    expect(lon).toBe(-90);
  });
});

describe("joinSegments", () => {
  it("rebuilds one line without repeating the shared points", () => {
    const line = joinSegments([
      { level: 0, coords: [[0, 0], [0, 1]] },
      { level: 2, coords: [[0, 1], [0, 2], [0, 3]] },
    ]); // prettier-ignore
    expect(line).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
  });
});
