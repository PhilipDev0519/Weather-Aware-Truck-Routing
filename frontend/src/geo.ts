import type { Checkpoint, LatLng } from "./types";

const EARTH_RADIUS_MI = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles([lat1, lon1]: LatLng, [lat2, lon2]: LatLng): number {
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, lat))) / 2));

export class RouteTracker {
  private cum: number[];
  private scale: number;

  constructor(
    private geometry: LatLng[],
    private checkpoints: Checkpoint[],
    totalMiles: number,
  ) {
    this.cum = [0];
    for (let i = 1; i < geometry.length; i++)
      this.cum.push(this.cum[i - 1] + haversineMiles(geometry[i - 1], geometry[i]));
    // the simplified line is a bit shorter than the real road
    this.scale = this.cum[this.cum.length - 1] / totalMiles || 1;
  }

  mileAtHours(hours: number): number {
    const cps = this.checkpoints;
    if (hours <= 0) return 0;
    for (let i = 1; i < cps.length; i++) {
      const a = cps[i - 1];
      const b = cps[i];
      if (hours <= b.hours_from_departure) {
        const span = b.hours_from_departure - a.hours_from_departure;
        const t = span > 0 ? (hours - a.hours_from_departure) / span : 1;
        return a.mile + (b.mile - a.mile) * t;
      }
    }
    return cps[cps.length - 1].mile;
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
