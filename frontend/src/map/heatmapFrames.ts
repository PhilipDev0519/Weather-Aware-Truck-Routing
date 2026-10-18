import { LEVELS, assess, classify, hexToRgb } from "../risk";
import type { HeatLayer, HeatmapResponse, RiskLevel } from "../types";

const LEVEL_RGB = LEVELS.map((l) => hexToRgb(l.color));
// Low is only a light wash, enough to show the corridor that was checked
// without muddying the map; each level above it steps up clearly.
const LEVEL_ALPHA = [0.12, 0.42, 0.54, 0.64, 0.74];
const LOW_FADE_MAX = 0.36; // weather layers: how strong the Low band gets near its upper edge
const MAX_IMAGE_PX = 640; // longest side of a rendered frame; the browser smooths the rest

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
// Where the smoothed corridor mask (see HeatGrid.edge) starts and finishes
// fading in: half-covered cells are transparent, fully surrounded ones opaque.
const EDGE_FROM = 0.45;
const EDGE_TO = 0.92;

export interface Conditions {
  wind: number;
  rain: number;
  snow: number;
  windFrom: number | null; // from the cell itself; directions don't average well
  coverage: number; // 0-1, how much of the neighbourhood has a forecast
  fade: number; // 0-1, opacity at the corridor's edge: a smooth outline, not the grid's staircase
}

// What the map shows at a point, for the readout under the cursor.
export type ProbeResult =
  | { kind: "outside" } // beyond the corridor: weather is only fetched along the routes
  | { kind: "no-forecast" } // in the corridor, but this hour is past the end of the forecast
  | { kind: "conditions"; conditions: Conditions };

interface Frame {
  wind: Float32Array;
  rain: Float32Array;
  snow: Float32Array;
}

/**
 * The forecast grid for one plan, sampled between cell centres.
 *
 * Grid coordinates are in cells: x runs 0..cols west to east and y runs 0..rows
 * north to south (rows are even in Web Mercator, like the image overlay), so
 * cell (c, r) covers [c, c+1) x [r, r+1) and its centre is at (c+0.5, r+0.5).
 */
export class HeatGrid {
  private frames = new Map<number, Frame>();
  private cellToIndex: Map<number, number>; // grid cell -> position in data.cells
  private mask: Float32Array; // per cell: share of its neighbourhood inside the corridor

  constructor(readonly data: HeatmapResponse) {
    this.cellToIndex = new Map(data.cells.map((cell, k) => [cell, k]));
    this.mask = corridorMask(data);
  }

  /**
   * The corridor mask blended between cell centres. Because the mask is
   * blurred, its contours round off the corners of the grid's cells, so a
   * fade read from it outlines the corridor as one smooth shape.
   */
  private edge(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.data.cols || y >= this.data.rows) return 0;
    const { cols, rows } = this.data;
    const gx = x - 0.5;
    const gy = y - 0.5;
    const c0 = Math.floor(gx);
    const r0 = Math.floor(gy);
    const tx = gx - c0;
    const ty = gy - r0;
    let value = 0;
    for (let dr = 0; dr <= 1; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= rows) continue;
      for (let dc = 0; dc <= 1; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= cols) continue;
        value += (dc ? tx : 1 - tx) * (dr ? ty : 1 - ty) * this.mask[r * cols + c];
      }
    }
    return value;
  }

  // Dense copies of an hour's values, NaN outside the corridor.
  private frame(hour: number): Frame {
    const cached = this.frames.get(hour);
    if (cached) return cached;

    const { cols, rows, cells, frames } = this.data;
    const size = cols * rows;
    const frame = {
      wind: new Float32Array(size).fill(NaN),
      rain: new Float32Array(size).fill(NaN),
      snow: new Float32Array(size).fill(NaN),
    };
    cells.forEach((cell, k) => {
      const wind = frames.wind[hour][k];
      const rain = frames.rain[hour][k];
      const snow = frames.snow[hour][k];
      if (wind === null || rain === null || snow === null) return;
      frame.wind[cell] = wind;
      frame.rain[cell] = rain;
      frame.snow[cell] = snow;
    });
    this.frames.set(hour, frame);
    return frame;
  }

  /**
   * Bilinear blend of the four nearest cell centres that have a forecast.
   *
   * `coverage` is the share of the blend that had data: 1 inside the corridor,
   * 0.5 on the edge of it, falling to 0 half a cell outside. Used as opacity,
   * it feathers the corridor's outline instead of leaving a staircase of cells.
   */
  sample(hour: number, x: number, y: number): Conditions | null {
    const { cols, rows } = this.data;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    const frame = this.frame(hour);

    const gx = x - 0.5;
    const gy = y - 0.5;
    const c0 = Math.floor(gx);
    const r0 = Math.floor(gy);
    const tx = gx - c0;
    const ty = gy - r0;
    let weight = 0;
    let wind = 0;
    let rain = 0;
    let snow = 0;
    let nearest = -1; // the cell with the most say, for the wind direction
    let nearestWeight = 0;
    for (let dr = 0; dr <= 1; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= rows) continue;
      for (let dc = 0; dc <= 1; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= cols) continue;
        const i = r * cols + c;
        if (Number.isNaN(frame.wind[i])) continue;
        const w = (dc ? tx : 1 - tx) * (dr ? ty : 1 - ty);
        weight += w;
        wind += w * frame.wind[i];
        rain += w * frame.rain[i];
        snow += w * frame.snow[i];
        if (w > nearestWeight) {
          nearest = i;
          nearestWeight = w;
        }
      }
    }
    if (weight === 0) return null;

    const k = this.cellToIndex.get(nearest);
    const from = k === undefined ? null : this.data.frames.wind_from?.[hour][k];
    const fade = this.corridorFade(x, y);
    return {
      wind: wind / weight,
      rain: rain / weight,
      snow: snow / weight,
      windFrom: from ?? null,
      coverage: weight,
      fade,
    };
  }

  /** How strongly the heatmap shows at a point, whatever the hour: 0 outside the corridor. */
  corridorFade(x: number, y: number): number {
    return smoothstep((this.edge(x, y) - EDGE_FROM) / (EDGE_TO - EDGE_FROM));
  }

  /**
   * What's under the cursor. "Outside" is exactly where the heatmap shows no
   * colour at any hour, so the readout and the map always agree.
   */
  probe(hour: number, x: number, y: number): ProbeResult {
    if (this.corridorFade(x, y) <= 0) return { kind: "outside" };
    const conditions = this.sample(hour, x, y);
    return conditions ? { kind: "conditions", conditions } : { kind: "no-forecast" };
  }
}

// 1 for corridor cells, 0 elsewhere, blurred over each cell's neighbours
// (weights 1-2-1 each way), so cells on the corridor's edge come out around
// half and the interior stays at 1.
function corridorMask({ cols, rows, cells }: HeatmapResponse): Float32Array {
  const inside = new Float32Array(cols * rows);
  for (const cell of cells) inside[cell] = 1;
  const at = (r: number, c: number) => (r < 0 || r >= rows || c < 0 || c >= cols ? 0 : inside[r * cols + c]);
  const mask = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) sum += (dr ? 1 : 2) * (dc ? 1 : 2) * at(r + dr, c + dc);
      }
      mask[r * cols + c] = sum / 16;
    }
  }
  // A grid too small to have any cell fully surrounded still gets a solid middle.
  const max = mask.reduce((m, v) => Math.max(m, v), 0);
  if (max > 0 && max < 1) for (let i = 0; i < mask.length; i++) mask[i] /= max;
  return mask;
}

export function sampleColor(
  layer: HeatLayer,
  c: Conditions,
  data: HeatmapResponse,
  loadLbs: number,
): [number, number, number, number] {
  let level: RiskLevel;
  let alpha: number;
  if (layer === "risk") {
    level = assess(c.wind, c.rain, c.snow, loadLbs, data.rules);
    alpha = LEVEL_ALPHA[level];
  } else {
    const thresholds = data.rules[layer];
    const value = c[layer];
    level = classify(value, thresholds);
    // In the Low band, fade in with intensity so light rain still shows up
    // without looking like a higher risk level.
    alpha = level === 0 ? LOW_FADE_MAX * Math.min(1, value / thresholds.edges[0]) : LEVEL_ALPHA[level];
  }
  const [r, g, b] = LEVEL_RGB[level];
  return [r, g, b, Math.round(alpha * c.fade * 255)];
}

// Each pixel is classified from blended wind, rain and snow, so band edges come
// out as smooth contours but every colour is still a real band colour (blending
// the colours themselves would invent in-between "risk levels").
// Frames are drawn the first time they're shown and kept after that.
export function frameRenderer(grid: HeatGrid, layer: HeatLayer, loadLbs: number) {
  const { data } = grid;
  const scale = Math.max(1, Math.floor(MAX_IMAGE_PX / Math.max(data.cols, data.rows)));
  const canvas = document.createElement("canvas");
  canvas.width = data.cols * scale;
  canvas.height = data.rows * scale;
  const ctx = canvas.getContext("2d");
  const cache = new Map<number, string>();

  return (hour: number) => {
    let url = cache.get(hour);
    if (url === undefined && ctx) {
      const image = ctx.createImageData(canvas.width, canvas.height);
      for (let py = 0; py < canvas.height; py++) {
        const y = (py + 0.5) / scale;
        for (let px = 0; px < canvas.width; px++) {
          const c = grid.sample(hour, (px + 0.5) / scale, y);
          if (c) image.data.set(sampleColor(layer, c, data, loadLbs), (py * canvas.width + px) * 4);
        }
      }
      ctx.putImageData(image, 0, 0);
      url = canvas.toDataURL("image/png");
      cache.set(hour, url);
    }
    return url ?? "";
  };
}
