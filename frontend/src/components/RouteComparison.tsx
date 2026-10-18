import { formatClock, formatDuration, formatMiles } from "../format";
import { RiskBadge } from "./RiskBadge";
import { RiskStrip } from "./RiskStrip";
import type { CriterionId, Ranking, RouteOption } from "../types";

// The routes side by side. The rows are the ranking rules in the brief's
// order, and the values are the exact ones the server ranked on, so the
// row it marks as deciding is visibly where the winner pulls ahead.

const RULES: Record<CriterionId, { label: string; hint: string }> = {
  no_travel: { label: "No Travel miles", hint: "Any No Travel stretch puts a route last" },
  severe: { label: "Severe miles", hint: "Miles where the weather is rated Severe" },
  high: { label: "High miles", hint: "Miles where the weather is rated High" },
  avg_risk: { label: "Average risk", hint: "Distance-weighted: Low 0, Moderate 1, High 2, Severe 3, No Travel 4" },
  travel_time: { label: "Trip time", hint: "Door to door, required stops included" },
};

function ruleValue(id: CriterionId, route: RouteOption): string {
  if (id === "avg_risk") return route.avg_risk.toFixed(2);
  if (id === "travel_time") return formatDuration(route.duration_hours);
  return formatMiles(route.risk_miles[id]);
}

// Keeps a number on the same line as its unit.
const NBSP = "\u00a0";

function describeStops({ stops }: RouteOption): string {
  const parts = [];
  if (stops.breaks) parts.push(stops.breaks === 1 ? `30${NBSP}min break` : `${stops.breaks} × 30${NBSP}min breaks`);
  if (stops.rests) parts.push(stops.rests === 1 ? `10${NBSP}h rest` : `${stops.rests} × 10${NBSP}h rests`);
  return parts.length ? parts.join(", ") : "None";
}

interface Props {
  routes: RouteOption[];
  ranking: Ranking;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RouteComparison({ routes, ranking, selectedId, onSelect }: Props) {
  const ordered = [...routes].sort((a, b) => a.rank - b.rank);
  // No Travel is always compared first, but a row of zeros is just noise.
  const shownRules = ranking.criteria.filter(
    (c) => c.id !== "no_travel" || ranking.decided_by === "no_travel" || routes.some((r) => r.risk_miles.no_travel > 0),
  );

  const columnClass = (route: RouteOption) =>
    [route.recommended && "is-recommended", route.id === selectedId && "is-selected"].filter(Boolean).join(" ") ||
    undefined;

  const cells = (render: (route: RouteOption) => React.ReactNode) =>
    ordered.map((route) => (
      <td key={route.id} className={columnClass(route)} onClick={() => onSelect(route.id)}>
        {render(route)}
      </td>
    ));

  return (
    <figure className="comparison">
      <table>
        <thead>
          <tr>
            <td />
            {ordered.map((route) => (
              <th key={route.id} scope="col" className={columnClass(route)}>
                <button type="button" aria-pressed={route.id === selectedId} onClick={() => onSelect(route.id)}>
                  {route.name}
                  <small>{route.recommended ? "Best route" : `Option ${route.rank}`}</small>
                </button>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {shownRules.map((rule) => {
            const best = Math.min(...routes.map((r) => r.rank_keys[rule.id]));
            const decides = rule.id === ranking.decided_by;
            const number = rule.id === "no_travel" ? null : ranking.criteria.indexOf(rule);
            return (
              <tr key={rule.id} className={decides ? "decides" : undefined}>
                <th scope="row" title={RULES[rule.id].hint}>
                  {number !== null && <span className="rule-number">{number}.</span>}
                  {RULES[rule.id].label}
                </th>
                {cells((route) => (
                  <span className={routes.length > 1 && route.rank_keys[rule.id] === best ? "best" : undefined}>
                    {ruleValue(rule.id, route)}
                  </span>
                ))}
              </tr>
            );
          })}
        </tbody>

        <tbody className="details">
          <tr>
            <th scope="row">Distance</th>
            {cells((route) => formatMiles(route.distance_miles))}
          </tr>
          <tr>
            <th scope="row">Arrives</th>
            {cells((route) => formatClock(route.arrival))}
          </tr>
          <tr>
            <th scope="row">Stops</th>
            {cells((route) => (
              <>
                {describeStops(route)}
                {route.extra_rests > 0 && <span className="note">Extra 10&nbsp;h rest</span>}
              </>
            ))}
          </tr>
          <tr>
            <th scope="row">Worst weather</th>
            {cells((route) => (
              <RiskBadge level={route.max_level} />
            ))}
          </tr>
          <tr>
            <th scope="row" title="Each route from start (left) to finish (right)">
              Risk by mile
            </th>
            {cells((route) => (
              <RiskStrip route={route} />
            ))}
          </tr>
        </tbody>
      </table>

      <figcaption>
        Rules are applied in order. The first one where the routes differ decides; it&rsquo;s marked on the left. Best
        values are in bold.
      </figcaption>
    </figure>
  );
}
