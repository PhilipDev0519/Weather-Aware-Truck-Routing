import { describe, expect, it } from "vitest";
import spec from "./test/risk-cases.json";
import { LEVELS, assess, bandRange, classify, riskStretches } from "./risk";
import { checkpoint } from "./test/routes";
import type { Rules, Thresholds } from "./types";

// The rules exactly as the server sends them from /api/rules; the backend's
// tests check that, and give the same levels for the same shared cases.
const rules = spec.rules as Rules;
const { wind, rain, snow } = rules;

describe("assess, against the cases shared with the backend", () => {
  it("gives every case its level", () => {
    expect(spec.cases.length).toBeGreaterThan(30);
    for (const c of spec.cases) {
      const level = assess(c.wind_mph, c.rain_in_hr, c.snow_in_hr, c.load_lbs, rules);
      expect(LEVELS[level].label, JSON.stringify(c)).toBe(c.level);
    }
  });
});

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

describe("riskStretches", () => {
  it("gives each checkpoint the road halfway to its neighbours and merges equal levels", () => {
    const cps = [
      checkpoint({ mile: 0, level: 0 }),
      checkpoint({ mile: 25, level: 0 }),
      checkpoint({ mile: 50, level: 2 }),
      checkpoint({ mile: 75, level: 3 }),
      checkpoint({ mile: 90, level: null }),
    ];
    expect(riskStretches(cps, 90)).toEqual([
      { from: 0, to: 37.5, level: 0 },
      { from: 37.5, to: 62.5, level: 2 },
      { from: 62.5, to: 82.5, level: 3 },
      { from: 82.5, to: 90, level: null },
    ]);
  });

  it("adds up to the route length", () => {
    const cps = [0, 10, 20, 26].map((mile, i) => checkpoint({ mile, level: (i % 2) as 0 | 1 }));
    const total = riskStretches(cps, 26).reduce((sum, s) => sum + s.to - s.from, 0);
    expect(total).toBe(26);
  });
});
