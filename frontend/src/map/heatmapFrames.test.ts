import { describe, expect, it } from "vitest";
import { LEVELS, hexToRgb } from "../risk";
import type { HeatmapResponse, Rules } from "../types";
import { HeatGrid, sampleColor } from "./heatmapFrames";

const rules: Rules = {
  levels: [],
  wind: { unit: "mph", edges: [25, 35, 45, 55], no_travel_inclusive: true },
  rain: { unit: "in/hr", edges: [0.1, 0.25, 0.5, 1.0], no_travel_inclusive: false },
  snow: { unit: "in/hr", edges: [0.5, 1.0, 2.0, 3.0], no_travel_inclusive: false },
  load_rules: [],
  load_adjustments: [
    { wind_level: 3, above_lbs: 30_000, level: 4 },
    { wind_level: 2, above_lbs: 40_000, level: 3 },
  ],
};

// A 3 x 2 grid with the bottom-right cell outside the corridor:
//   [ 10 mph | 20 mph | 40 mph ]
//   [ 10 mph | 20 mph + 0.2 in/hr rain |   --   ]
function grid(): HeatGrid {
  const wind = [10, 20, 40, 10, 20];
  const data: HeatmapResponse = {
    start: "2026-01-10T12:00:00+00:00",
    hours: 0,
    bounds: [
      [35, -91],
      [36, -88],
    ],
    rows: 2,
    cols: 3,
    cells: [0, 1, 2, 3, 4],
    points: [],
    frames: {
      // the server's own classification for a 42,000 lb load
      risk: [[0, 0, 3, 0, 1]],
      wind: [wind],
      wind_from: [[270, 270, 180, 270, 270]],
      rain: [[0, 0, 0, 0, 0.2]],
      snow: [[0, 0, 0, 0, 0]],
    },
    rules,
  };
  return new HeatGrid(data);
}

// A 7 x 7 grid with a 5 x 5 corridor in the middle and a steady 10 mph wind.
// With `emptyHour`, hour 1 is past the end of the forecast.
function squareCorridor({ emptyHour = false } = {}): HeatGrid {
  const cells: number[] = [];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) cells.push(r * 7 + c);
  const hour = (v: number) => cells.map(() => v);
  const none = cells.map(() => null);
  const hours = emptyHour ? 2 : 1;
  const frame = (v: number) => Array.from({ length: hours }, (_, h) => (h === 1 ? none : hour(v)));
  const data: HeatmapResponse = {
    ...grid().data,
    hours: hours - 1,
    rows: 7,
    cols: 7,
    cells,
    frames: { risk: frame(0), wind: frame(10), wind_from: frame(270), rain: frame(0), snow: frame(0) },
  };
  return new HeatGrid(data);
}

describe("HeatGrid.sample", () => {
  it("gives each cell's own values at its centre", () => {
    const g = grid();
    expect(g.sample(0, 0.5, 0.5)).toMatchObject({ wind: 10, rain: 0, windFrom: 270 });
    expect(g.sample(0, 2.5, 0.5)).toMatchObject({ wind: 40, windFrom: 180 });
  });

  it("blends between neighbouring centres", () => {
    expect(grid().sample(0, 1.0, 0.5)?.wind).toBeCloseTo(15);
    expect(grid().sample(0, 1.25, 0.5)?.wind).toBeCloseTo(17.5);
  });

  it("feathers the corridor edge into cells with no forecast", () => {
    const g = grid();
    expect(g.sample(0, 2.5, 1.5)).toBeNull(); // centre of the missing cell
    expect(g.sample(0, -0.1, 0.5)).toBeNull(); // off the grid
    const inside = g.sample(0, 2.5, 0.99)!; // bottom of the 40 mph cell, next to the gap
    const outside = g.sample(0, 2.5, 1.25)!; // a quarter of the way into the gap
    expect(inside.wind).toBeCloseTo(40);
    expect(outside.wind).toBeCloseTo(40); // values come only from cells that have them
    expect(inside.coverage).toBeCloseTo(0.5, 1);
    expect(outside.coverage).toBeCloseTo(0.25);
  });

  it("fades the corridor out smoothly at its edge, not along the grid's cells", () => {
    const g = squareCorridor();
    const fadeAt = (x: number, y: number) => g.sample(0, x, y)?.fade ?? 0;
    expect(fadeAt(3.5, 3.5)).toBe(1); // middle
    expect(fadeAt(1.5, 3.5)).toBeGreaterThan(0); // edge cell: partly faded
    expect(fadeAt(1.5, 3.5)).toBeLessThan(fadeAt(2.5, 3.5));
    expect(fadeAt(1.1, 3.5)).toBeLessThan(fadeAt(1.5, 3.5)); // fading towards the outside
    // the corner is rounded off: it fades more than the middle of a side
    expect(fadeAt(1.5, 1.5)).toBeLessThan(fadeAt(1.5, 3.5));
  });
});

describe("HeatGrid.probe", () => {
  it("reads the conditions wherever the heatmap shows", () => {
    const result = squareCorridor().probe(0, 3.5, 3.5);
    expect(result.kind).toBe("conditions");
    expect(result.kind === "conditions" && result.conditions.wind).toBeCloseTo(10);
  });

  it("says when a point is outside the corridor, on or off the grid", () => {
    const g = squareCorridor();
    expect(g.probe(0, 0.3, 3.5)).toEqual({ kind: "outside" }); // grid cell with no forecast location
    expect(g.probe(0, -2, 3.5)).toEqual({ kind: "outside" }); // off the grid
  });

  it("agrees with the map: outside is exactly where no colour is drawn", () => {
    const g = squareCorridor();
    for (let x = 0.05; x < 7; x += 0.1) {
      const shown = (g.sample(0, x, 3.5)?.fade ?? 0) > 0;
      expect(g.probe(0, x, 3.5).kind !== "outside", `x ${x.toFixed(2)}`).toBe(shown);
    }
  });

  it("tells a missing hour apart from being outside the corridor", () => {
    const g = squareCorridor({ emptyHour: true });
    expect(g.probe(1, 3.5, 3.5)).toEqual({ kind: "no-forecast" });
    expect(g.probe(1, -2, 3.5)).toEqual({ kind: "outside" });
  });
});

describe("HeatGrid.sample at cell centres", () => {
  it("matches the server's risk at every cell centre", () => {
    const g = grid();
    const { cols, cells, frames } = g.data;
    cells.forEach((cell, k) => {
      const c = g.sample(0, (cell % cols) + 0.5, Math.floor(cell / cols) + 0.5)!;
      const serverLevel = frames.risk[0][k]!;
      expect(sampleColor("risk", c, g.data, 42_000).slice(0, 3), `cell ${cell}`).toEqual(
        hexToRgb(LEVELS[serverLevel].color),
      );
    });
  });
});

describe("sampleColor", () => {
  const calm = { wind: 5, rain: 0, snow: 0, windFrom: null, coverage: 1, fade: 1 };

  it("keeps Low visible but faint on the risk layer", () => {
    const alpha = sampleColor("risk", calm, grid().data, 0)[3];
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(60);
  });

  it("shows nothing where there's no rain or snow", () => {
    expect(sampleColor("rain", calm, grid().data, 0)[3]).toBe(0);
    expect(sampleColor("snow", calm, grid().data, 0)[3]).toBe(0);
  });
});
