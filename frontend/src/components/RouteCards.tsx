import { formatDuration, formatMiles, formatTime } from "../format";
import { Icon } from "./Icon";
import { LEVELS, UNKNOWN_COLOR, levelColor, levelLabel } from "../risk";
import type { RouteOption } from "../types";

const hasStops = (route: RouteOption) => route.stops.breaks + route.stops.rests > 0;

function describeStops({ stops }: RouteOption): string {
  const parts = [];
  if (stops.breaks) parts.push(`${stops.breaks} × 30 min break`);
  if (stops.rests) parts.push(`${stops.rests} × 10 h rest`);
  return parts.join(", ");
}

function RiskBar({ route }: { route: RouteOption }) {
  const total = route.distance_miles || 1;
  const parts = [
    ...LEVELS.map((l) => ({ label: l.label, color: l.color, miles: route.risk_miles[l.key] })),
    { label: "Unknown", color: UNKNOWN_COLOR, miles: route.risk_miles.unknown },
  ].filter((p) => p.miles > 0);
  return (
    <div className="risk-bar" aria-label="Miles by risk level">
      {parts.map((p) => (
        <span
          key={p.label}
          style={{ width: `${(100 * p.miles) / total}%`, background: p.color }}
          title={`${p.label}: ${formatMiles(p.miles)}`}
        />
      ))}
    </div>
  );
}

interface Props {
  routes: RouteOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RouteCards({ routes, selectedId, onSelect }: Props) {
  const ordered = [...routes].sort((a, b) => a.rank - b.rank);
  return (
    <div className="route-cards">
      {ordered.map((route) => {
        const m = route.risk_miles;
        return (
          <button
            key={route.id}
            type="button"
            className={`route-card${route.id === selectedId ? " selected" : ""}${route.recommended ? " recommended" : ""}`}
            style={{ "--accent": levelColor(route.max_level) } as React.CSSProperties}
            onClick={() => onSelect(route.id)}
            aria-pressed={route.id === selectedId}
          >
            <div className="card-head">
              <span className="route-name">
                <span className="rank">#{route.rank}</span> {route.name}
              </span>
              {route.recommended && (
                <span className="badge">
                  <Icon name="shield" size={12} /> Recommended
                </span>
              )}
              {m.no_travel > 0 && <span className="badge danger">No Travel zone</span>}
              {route.extra_rests > 0 && (
                <span className="badge warn" title="Its driving time passes the 11-hour limit">
                  <Icon name="clock" size={12} /> Extra overnight rest
                </span>
              )}
            </div>
            <div className="card-stats">
              <span>
                <strong>{formatDuration(route.duration_hours)}</strong> {hasStops(route) ? "trip" : "drive"}
              </span>
              <span>
                <strong>{formatMiles(route.distance_miles)}</strong>
              </span>
              <span>
                Arrive <strong>{formatTime(route.arrival)}</strong>
              </span>
            </div>
            {hasStops(route) && (
              <p className="card-stops">
                {formatDuration(route.driving_hours)} driving + {describeStops(route)}
              </p>
            )}
            <RiskBar route={route} />
            <dl className="card-metrics">
              <div>
                <dt>Severe+</dt>
                <dd style={{ color: m.severe + m.no_travel > 0 ? levelColor(3) : undefined }}>
                  {formatMiles(m.severe + m.no_travel)}
                </dd>
              </div>
              <div>
                <dt>High</dt>
                <dd style={{ color: m.high > 0 ? levelColor(2) : undefined }}>{formatMiles(m.high)}</dd>
              </div>
              <div>
                <dt>Avg risk</dt>
                <dd title="Distance-weighted: 0 = Low … 4 = No Travel">{route.avg_risk.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Worst</dt>
                <dd>
                  <span className="dot" style={{ background: levelColor(route.max_level) }} />
                  {levelLabel(route.max_level)}
                </dd>
              </div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}
