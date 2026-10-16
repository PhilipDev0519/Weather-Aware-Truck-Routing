import { describe, expect, it } from "vitest";
import { assess, bandRange, classify } from "./risk";
import type { Rules, Thresholds } from "./types";

// Same tables the backend sends from /api/rules.
const wind: Thresholds = { unit: "mph", edges: [25, 35, 45, 55], no_travel_inclusive: true };
const rain: Thresholds = { unit: "in/hr", edges: [0.1, 0.25, 0.5, 1.0], no_travel_inclusive: false };
const snow: Thresholds = { unit: "in/hr", edges: [0.5, 1.0, 2.0, 3.0], no_travel_inclusive: false };

const rules: Rules = {
  levels: [],
  wind,
  rain,
  snow,
  load_rules: [],
  load_adjustments: [
    { wind_level: 3, above_lbs: 30_000, level: 4 },
    { wind_level: 2, above_lbs: 40_000, level: 3 },
  ],
};

describe("classify", () => {
  it("matches the backend on every band edge", () => {
    const cases: [Thresholds, number, number][] = [
      [wind, 24.9, 0], [wind, 25, 1], [wind, 34.9, 1], [wind, 35, 2], [wind, 45, 3], [wind, 54.9, 3], [wind, 55, 4],
      [rain, 0.099, 0], [rain, 0.1, 1], [rain, 0.25, 2], [rain, 0.5, 3], [rain, 1.0, 3], [rain, 1.001, 4],
      [snow, 0.49, 0], [snow, 0.5, 1], [snow, 1.0, 2], [snow, 2.0, 3], [snow, 3.0, 3], [snow, 3.01, 4],
    ]; // prettier-ignore
    for (const [table, value, level] of cases) expect(classify(value, table), `${table.unit} ${value}`).toBe(level);
  });
});

describe("bandRange", () => {
  it("reads like the spec table", () => {
    expect([0, 1, 2, 3, 4].map((l) => bandRange(l as 0, wind))).toEqual([
      "<25 mph",
      "25–34 mph",
      "35–44 mph",
      "45–54 mph",
      "≥55 mph",
    ]);
    expect(bandRange(1, rain)).toBe("0.10–0.25 in/hr");
    expect(bandRange(4, rain)).toBe(">1.00 in/hr");
    expect(bandRange(2, snow)).toBe("1.0–2.0 in/hr");
  });
});

describe("assess", () => {
  it("applies the load rules like the backend", () => {
    const cases: [number, number, number][] = [
      // wind mph, load lb, level
      [38, 40_000, 2], [38, 40_001, 3], // 35–44 mph: Severe only above 40,000 lb
      [50, 30_000, 3], [50, 30_001, 4], // 45–54 mph: No Travel above 30,000 lb
      [55, 0, 4], // ≥55 mph is No Travel for any load
      [30, 80_000, 1], // the load doesn't touch Moderate wind
    ]; // prettier-ignore
    for (const [mph, load, level] of cases)
      expect(assess(mph, 0, 0, load, rules), `${mph} mph, ${load} lb`).toBe(level);
  });

  it("takes the worst of wind, rain and snow", () => {
    expect(assess(10, 0.3, 0.6, 20_000, rules)).toBe(2);
    expect(assess(38, 0.12, 0, 45_000, rules)).toBe(3);
  });
});
