import type { Checkpoint, RiskLevel, RiskMiles, Rules, Thresholds } from "./types";

export const LEVELS: { label: string; color: string; key: keyof RiskMiles }[] = [
  { label: "Low", color: "#2f9e5a", key: "low" },
  { label: "Moderate", color: "#e0b000", key: "moderate" },
  { label: "High", color: "#f07b16", key: "high" },
  { label: "Severe", color: "#d62828", key: "severe" },
  { label: "No Travel", color: "#6d1a9c", key: "no_travel" },
];
export const UNKNOWN_COLOR = "#9aa3ad";

export const levelColor = (level: RiskLevel | null) => (level === null ? UNKNOWN_COLOR : LEVELS[level].color);
export const levelLabel = (level: RiskLevel | null) => (level === null ? "Unknown" : LEVELS[level].label);

// Same rules as backend/routing/risk.py.
export function classify(value: number, t: Thresholds): RiskLevel {
  const [moderate, high, severe, noTravel] = t.edges;
  if (value > noTravel || (t.no_travel_inclusive && value >= noTravel)) return 4;
  if (value >= severe) return 3;
  if (value >= high) return 2;
  if (value >= moderate) return 1;
  return 0;
}

// Same as assess() in backend/routing/risk.py: the wind level is raised for
// heavy loads, then the worst of wind, rain and snow wins.
export function assess(windMph: number, rainInHr: number, snowInHr: number, loadLbs: number, rules: Rules): RiskLevel {
  let wind = classify(windMph, rules.wind);
  const adjustment = rules.load_adjustments.find((a) => a.wind_level === wind && loadLbs > a.above_lbs);
  if (adjustment) wind = adjustment.level;
  return Math.max(wind, classify(rainInHr, rules.rain), classify(snowInHr, rules.snow)) as RiskLevel;
}

// e.g. "25–34 mph" or "0.10–0.25 in/hr"
export function bandRange(level: RiskLevel, t: Thresholds): string {
  const [a, b, c, d] = t.edges;
  const decimals = t.unit === "mph" ? 0 : t.edges.some((e) => Math.round(e * 10) !== e * 10) ? 2 : 1;
  const fmt = (n: number) => n.toFixed(decimals);
  const lowers = [0, a, b, c, d];
  if (level === 0) return `<${fmt(a)} ${t.unit}`;
  if (level === 4) return `${t.no_travel_inclusive ? "≥" : ">"}${fmt(d)} ${t.unit}`;
  const upper = t.unit === "mph" ? `${lowers[level + 1] - 1}` : fmt(lowers[level + 1]);
  return `${fmt(lowers[level])}–${upper} ${t.unit}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface RiskStretch {
  from: number; // miles
  to: number;
  level: RiskLevel | null;
}

// The route as a run of stretches, mile by mile. Like the server's risk miles,
// each checkpoint stands for the road halfway to its neighbours; neighbouring
// stretches at the same level are merged.
export function riskStretches(checkpoints: Checkpoint[], distanceMiles: number): RiskStretch[] {
  const cps = [...checkpoints].sort((a, b) => a.mile - b.mile);
  const stretches: RiskStretch[] = [];
  cps.forEach((cp, i) => {
    const from = i === 0 ? 0 : (cps[i - 1].mile + cp.mile) / 2;
    const to = i === cps.length - 1 ? Math.max(distanceMiles, cp.mile) : (cp.mile + cps[i + 1].mile) / 2;
    if (to <= from) return;
    const last = stretches[stretches.length - 1];
    if (last && last.level === cp.level) last.to = to;
    else stretches.push({ from, to, level: cp.level });
  });
  return stretches;
}
