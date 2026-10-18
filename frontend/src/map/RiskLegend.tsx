import { formatMiles } from "../format";
import { LEVELS, UNKNOWN_COLOR } from "../risk";
import type { RouteOption } from "../types";

// With a route selected, each level also says how many of its miles are at it.
export function RiskLegend({ route }: { route: RouteOption | null }) {
  const miles = route?.risk_miles;
  return (
    <div className={`risk-legend${route ? " with-miles" : ""}`}>
      <strong>{route ? `${route.name} risk` : "Route risk"}</strong>
      {LEVELS.map((l) => (
        <span key={l.label} className={miles && miles[l.key] <= 0 ? "none" : undefined}>
          <i style={{ background: l.color }} />
          {l.label}
          {miles && <b>{formatMiles(miles[l.key])}</b>}
        </span>
      ))}
      {(!miles || miles.unknown > 0) && (
        <span>
          <i style={{ background: UNKNOWN_COLOR }} />
          No forecast
          {miles && <b>{formatMiles(miles.unknown)}</b>}
        </span>
      )}
    </div>
  );
}
