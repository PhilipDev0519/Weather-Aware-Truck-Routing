import { formatMiles } from "../format";
import { levelColor, levelLabel, riskStretches } from "../risk";
import type { RouteOption } from "../types";

// The route's risk from start to finish, drawn to scale: where along the trip
// the bad weather is, not just how much of it there is.
export function RiskStrip({ route, scale = false }: { route: RouteOption; scale?: boolean }) {
  const total = Math.max(route.distance_miles, 1);
  const stretches = riskStretches(route.checkpoints, route.distance_miles);
  const label = stretches
    .map((s) => `${levelLabel(s.level)} from mile ${s.from.toFixed(0)} to ${s.to.toFixed(0)}`)
    .join(", ");
  return (
    <div className="risk-strip-wrap">
      <div className="risk-strip" role="img" aria-label={`${route.name}: ${label}`}>
        {stretches.map((s) => (
          <span
            key={s.from}
            data-level={s.level ?? "unknown"}
            style={{ width: `${(100 * (s.to - s.from)) / total}%`, background: levelColor(s.level) }}
            title={`Mile ${s.from.toFixed(0)}–${s.to.toFixed(0)}: ${levelLabel(s.level)}`}
          />
        ))}
      </div>
      {scale && (
        <div className="risk-strip-scale" aria-hidden="true">
          <span>Start</span>
          <span>{formatMiles(route.distance_miles)}</span>
        </div>
      )}
    </div>
  );
}
