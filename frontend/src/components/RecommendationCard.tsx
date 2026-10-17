import { formatClock, formatDuration, formatMiles } from "../format";
import type { RouteOption } from "../types";

interface Props {
  route: RouteOption;
  reason: string;
}

// The answer first: which route, how long, why, and how much bad weather it
// passes through.
export function RecommendationCard({ route, reason }: Props) {
  const severe = route.risk_miles.severe + route.risk_miles.no_travel;
  return (
    <section className="recommendation" aria-labelledby="recommendation-title">
      <div className="recommendation-head">
        <div>
          <p className="recommendation-label">Recommended route</p>
          <h2 id="recommendation-title">{route.name}</h2>
        </div>
        <p className="recommendation-time">
          <strong>{formatDuration(route.duration_hours)}</strong>
          <span>door to door</span>
        </p>
      </div>

      <p className="recommendation-reason">{reason}</p>

      <dl className="recommendation-facts">
        <div>
          <dt>Distance</dt>
          <dd>{formatMiles(route.distance_miles)}</dd>
        </div>
        <div>
          <dt>Arrives</dt>
          <dd>{formatClock(route.arrival)}</dd>
        </div>
        <div>
          <dt>{route.risk_miles.no_travel > 0 ? "Severe+" : "Severe"}</dt>
          <dd>{formatMiles(severe)}</dd>
        </div>
        <div>
          <dt>High</dt>
          <dd>{formatMiles(route.risk_miles.high)}</dd>
        </div>
      </dl>
    </section>
  );
}
