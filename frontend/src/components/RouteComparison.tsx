import { formatClock, formatDuration, formatMiles } from "../format";
import { LEVELS, UNKNOWN_COLOR, levelColor, levelLabel } from "../risk";
import type { CriterionId, Ranking, RouteOption } from "../types";
import { Icon } from "./Icon";

// The routes side by side, with the ranking rules as rows in the brief's
// order. The values are the exact ones the server ranked on (rank_keys), so
// the row it says decided is visibly the first one where the winner pulls ahead.

const ROWS: Record<CriterionId, { rule: string | null; label: string; hint: string }> = {
  no_travel: { rule: null, label: "No Travel miles", hint: "Any No Travel stretch puts a route last" },
  severe: { rule: "1", label: "Severe miles", hint: "Fewest Severe miles" },
  high: { rule: "2", label: "High miles", hint: "Fewest High miles" },
  avg_risk: {
    rule: "3",
    label: "Average risk",
    hint: "Distance-weighted: Low 0, Moderate 1, High 2, Severe 3, No Travel 4",
  },
  travel_time: { rule: "4", label: "Trip time", hint: "Door to door, required stops included" },
};

export const RULE_TEXT: Record<CriterionId, string> = {
  no_travel: "No Travel miles (always compared first)",
  severe: "rule 1, fewest Severe miles",
  high: "rule 2, fewest High miles",
  avg_risk: "rule 3, lowest average risk",
  travel_time: "rule 4, shortest trip time",
};

function value(id: CriterionId, r: RouteOption): string {
  if (id === "avg_risk") return r.avg_risk.toFixed(2);
  if (id === "travel_time") return formatDuration(r.duration_hours);
  return formatMiles(r.risk_miles[id]);
}

function stops({ stops }: RouteOption): string {
  const parts = [];
  if (stops.breaks) parts.push(stops.breaks === 1 ? "30 min break" : `${stops.breaks} × 30 min breaks`);
  if (stops.rests) parts.push(stops.rests === 1 ? "10 h rest" : `${stops.rests} × 10 h rests`);
  return parts.join(" + ") || "None";
}

function RiskBar({ route }: { route: RouteOption }) {
  const total = route.distance_miles || 1;
  const parts = [
    ...LEVELS.map((l) => ({ label: l.label, color: l.color, miles: route.risk_miles[l.key] })),
    { label: "Unknown", color: UNKNOWN_COLOR, miles: route.risk_miles.unknown },
  ].filter((p) => p.miles > 0);
  return (
    <div className="risk-bar" role="img" aria-label={parts.map((p) => `${p.label} ${formatMiles(p.miles)}`).join(", ")}>
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
  ranking: Ranking;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RouteComparison({ routes, ranking, selectedId, onSelect }: Props) {
  const ordered = [...routes].sort((a, b) => a.rank - b.rank);
  const decided = ranking.criteria.findIndex((c) => c.id === ranking.decided_by);
  // No Travel is always compared, but a row of zeros only adds noise.
  const rows = ranking.criteria.filter(
    (c) => c.id !== "no_travel" || ranking.decided_by === "no_travel" || routes.some((r) => r.risk_miles.no_travel > 0),
  );

  const cellProps = (route: RouteOption) => ({
    className: route.id === selectedId ? "selected" : undefined,
    onClick: () => onSelect(route.id),
  });

  return (
    <div className="compare">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col" className="compare-corner">
              Ranked by
            </th>
            {ordered.map((route) => (
              <th key={route.id} scope="col" className={route.id === selectedId ? "selected" : undefined}>
                <button
                  type="button"
                  className="compare-route"
                  aria-pressed={route.id === selectedId}
                  onClick={() => onSelect(route.id)}
                >
                  <span className="compare-rank">#{route.rank}</span>
                  <strong>{route.name}</strong>
                  {route.recommended && (
                    <span className="badge">
                      <Icon name="shield" size={11} /> Best
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((criterion) => {
            const i = ranking.criteria.indexOf(criterion);
            const row = ROWS[criterion.id];
            const best = Math.min(...routes.map((r) => r.rank_keys[criterion.id]));
            const state = decided < 0 ? "" : i < decided ? "tied" : i === decided ? "decides" : "unused";
            return (
              <tr key={criterion.id} className={`rule-row ${state}`}>
                <th scope="row" title={row.hint}>
                  {row.rule && <span className="rule-num">{row.rule}</span>}
                  <span className="rule-label">{row.label}</span>
                  {state === "decides" && <span className="rule-tag decides">Decides</span>}
                  {state === "tied" && <span className="rule-tag">Tie</span>}
                </th>
                {ordered.map((route) => {
                  const isBest = routes.length > 1 && route.rank_keys[criterion.id] === best;
                  return (
                    <td key={route.id} {...cellProps(route)}>
                      <span className={isBest ? "best" : undefined}>
                        {isBest && <Icon name="check" size={12} />}
                        {value(criterion.id, route)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          <tr className="compare-divider">
            <th scope="row" colSpan={ordered.length + 1}>
              Details
            </th>
          </tr>
          <tr>
            <th scope="row">Distance</th>
            {ordered.map((route) => (
              <td key={route.id} {...cellProps(route)}>
                {formatMiles(route.distance_miles)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Arrives</th>
            {ordered.map((route) => (
              <td key={route.id} {...cellProps(route)}>
                {formatClock(route.arrival)}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Stops</th>
            {ordered.map((route) => (
              <td key={route.id} {...cellProps(route)}>
                {stops(route)}
                {route.extra_rests > 0 && (
                  <span className="badge warn" title="Its driving time passes the 11-hour limit">
                    <Icon name="clock" size={11} /> Extra overnight rest
                  </span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Worst level</th>
            {ordered.map((route) => (
              <td key={route.id} {...cellProps(route)}>
                <span className="dot" style={{ background: levelColor(route.max_level) }} />
                {levelLabel(route.max_level)}
                {route.risk_miles.no_travel > 0 && <span className="badge danger">No Travel zone</span>}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Miles by risk</th>
            {ordered.map((route) => (
              <td key={route.id} {...cellProps(route)}>
                <RiskBar route={route} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
