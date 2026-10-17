export type RiskLevel = 0 | 1 | 2 | 3 | 4;
export type LatLng = [number, number];

export interface Place {
  label: string;
  lat?: number;
  lon?: number;
}

export interface Weather {
  wind_mph: number;
  gust_mph: number | null;
  wind_from_deg: number | null;
  rain_in_hr: number;
  snow_in_hr: number;
  temp_f: number | null;
}

export interface Checkpoint {
  index: number;
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  hours_from_departure: number;
  weather: Weather | null;
  level: RiskLevel | null;
  reasons: string[];
}

export interface RiskMiles {
  low: number;
  moderate: number;
  high: number;
  severe: number;
  no_travel: number;
  unknown: number;
}

export interface RouteSegment {
  level: RiskLevel | null;
  coords: LatLng[];
}

export interface RouteOption {
  id: string;
  name: string;
  recommended: boolean;
  rank: number;
  distance_miles: number;
  duration_hours: number; // door to door, including any rest stops
  driving_hours: number;
  stops: { breaks: number; rests: number };
  extra_rests: number; // 10 h rests beyond what the route with the fewest needs
  stop_timeline: Stop[]; // required breaks and rests, in order
  rank_keys: Record<CriterionId, number>; // the exact (rounded) values the server ranked on
  arrival: string;
  risk_miles: RiskMiles;
  avg_risk: number;
  max_level: RiskLevel | null;
  checkpoints: Checkpoint[];
  segments: RouteSegment[];
  geometry: LatLng[]; // filled in by the API client from `segments`
}

export type CriterionId = "no_travel" | "severe" | "high" | "avg_risk" | "travel_time";

export interface Ranking {
  criteria: { id: CriterionId; label: string }[]; // in ranking order
  decided_by: CriterionId | null; // first criterion that separates the winner from the runner-up
}

export interface Stop {
  kind: "break" | "rest";
  mile: number;
  start_hours: number; // after departure
  hours: number;
}

export interface PlanRequest {
  origin: Place;
  destination: Place;
  departure: string;
  load_lbs: number;
  interval_miles: 10 | 25 | 50;
  rest_breaks: boolean;
}

export interface PlanResponse {
  origin: Required<Place>;
  destination: Required<Place>;
  departure: string;
  load_lbs: number;
  interval_miles: number;
  rest_breaks: boolean;
  routes: RouteOption[];
  recommended_route_id: string;
  recommendation_reason: string;
  ranking: Ranking;
  warnings: string[];
  // "truck": openrouteservice's HGV profile; "car": OSRM capped at truck speed
  routing: { profile: "truck" | "car"; gross_lbs: number | null };
  heatmap: HeatmapResponse | null; // null when requested separately (see api.heatmap)
  heatmap_error: string | null;
  corridor: LatLng[][]; // the routes' rough shape, sent back to /api/heatmap
}

export interface HeatmapRequest {
  corridor: LatLng[][];
  departure: string;
  load_lbs: number;
}

export interface Thresholds {
  unit: string;
  edges: [number, number, number, number];
  no_travel_inclusive: boolean;
}

export interface Rules {
  levels: { value: RiskLevel; label: string }[];
  wind: Thresholds;
  rain: Thresholds;
  snow: Thresholds;
  load_rules: string[];
  // e.g. a Severe wind (45–54 mph) becomes No Travel above 30,000 lb
  load_adjustments: { wind_level: RiskLevel; above_lbs: number; level: RiskLevel }[];
}

export type HeatLayer = "risk" | "wind" | "rain" | "snow";

export interface HeatmapResponse {
  start: string;
  hours: number;
  bounds: [LatLng, LatLng];
  rows: number;
  cols: number;
  cells: number[];
  points: LatLng[];
  frames: Record<HeatLayer | "wind_from", (number | null)[][]>;
  rules: Rules;
}
