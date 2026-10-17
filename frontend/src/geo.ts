import type { Checkpoint, LatLng, Stop } from "./types";

const EARTH_RADIUS_MI = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles([lat1, lon1]: LatLng, [lat2, lon2]: LatLng): number {
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, lat))) / 2));

// Where the truck is along a route at a given time. Between checkpoints it
// moves at a steady pace; during a required break or rest it stays put.
export class RouteTracker {
  private cum: number[];
  private scale: number;
  private timeline: { hours: number; mile: number }[];

  constructor(
    private geometry: LatLng[],
    checkpoints: Checkpoint[],
    totalMiles: number,
    private stops: Stop[] = [],
  ) {
    this.timeline = [
      ...checkpoints.map((cp) => ({ hours: cp.hours_from_departure, mile: cp.mile })),
      ...stops.flatMap((s) => [
        { hours: s.start_hours, mile: s.mile },
        { hours: s.start_hours + s.hours, mile: s.mile },
      ]),
    ].sort((a, b) => a.hours - b.hours || a.mile - b.mile);
    this.cum = [0];
    for (let i = 1; i < geometry.length; i++)
      this.cum.push(this.cum[i - 1] + haversineMiles(geometry[i - 1], geometry[i]));
    // the simplified line is a bit shorter than the real road
    this.scale = this.cum[this.cum.length - 1] / totalMiles || 1;
  }

  mileAtHours(hours: number): number {
    const points = this.timeline;
    if (hours <= 0) return 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (hours <= b.hours) {
        const span = b.hours - a.hours;
        const t = span > 0 ? (hours - a.hours) / span : 1;
        return a.mile + (b.mile - a.mile) * t;
      }
    }
    return points[points.length - 1].mile;
  }

  stopAt(hours: number): Stop | null {
    return this.stops.find((s) => hours >= s.start_hours && hours < s.start_hours + s.hours) ?? null;
  }

  positionAtMile(mile: number): LatLng {
    const target = mile * this.scale;
    const cum = this.cum;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo];
    const t = span > 0 ? Math.min(1, Math.max(0, (target - cum[lo]) / span)) : 0;
    const [a, b] = [this.geometry[lo], this.geometry[hi]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
}
