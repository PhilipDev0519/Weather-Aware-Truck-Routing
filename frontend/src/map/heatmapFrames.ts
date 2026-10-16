import { LEVELS, assess, classify, hexToRgb } from "../risk";
import type { HeatLayer, HeatmapResponse, RiskLevel } from "../types";

const LEVEL_RGB = LEVELS.map((l) => hexToRgb(l.color));
// Low gets a faint tint so a calm day still shows the corridor that was checked.
const LEVEL_ALPHA = [0.2, 0.4, 0.5, 0.6, 0.7];
const LOW_FADE_MAX = 0.4; // weather layers: how strong the Low band gets near its upper edge
const MAX_IMAGE_PX = 480; // longest side of a rendered frame; the browser smooths the rest

export interface Conditions {
  wind: number;
  rain: number;
  snow: number;
  windFrom: number | null; // from the cell itself; directions don't average well
  coverage: number; // 0-1, how much of the neighbourhood has a forecast (soft corridor edge)
}

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

  constructor(readonly data: HeatmapResponse) {
    this.cellToIndex = new Map(data.cells.map((cell, k) => [cell, k]));
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
    return { wind: wind / weight, rain: rain / weight, snow: snow / weight, windFrom: from ?? null, coverage: weight };
  }

  /** Like sample(), but only inside the corridor proper (not its feathered edge). */
  probe(hour: number, x: number, y: number): Conditions | null {
    const c = this.sample(hour, x, y);
    return c && c.coverage >= 0.5 ? c : null;
  }
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
  return [r, g, b, Math.round(alpha * c.coverage * 255)];
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
