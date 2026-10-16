import { useEffect, useState } from "react";
import { api } from "../api";
import { LEVELS, bandRange } from "../risk";
import type { RiskLevel, Rules } from "../types";
import { Icon, type IconName } from "./Icon";

const CONDITIONS: { key: "wind" | "rain" | "snow"; label: string; icon: IconName }[] = [
  { key: "wind", label: "Wind", icon: "wind" },
  { key: "rain", label: "Rain", icon: "rain" },
  { key: "snow", label: "Snow", icon: "snow" },
];

export function RulesTable() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .rules()
      .then((r) => active && setRules(r))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) return <p className="muted">Risk rules are unavailable right now. Is the backend running?</p>;

  return (
    <div className="rules-grid">
      <div className="table-card">
        <table className="rules-table">
          <thead>
            <tr>
              <th>Condition</th>
              {LEVELS.map((l) => (
                <th key={l.label}>
                  <span className="level-head">
                    <i style={{ background: l.color }} />
                    {l.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONDITIONS.map((c) => (
              <tr key={c.key}>
                <th scope="row">
                  <span className="cond">
                    <Icon name={c.icon} size={16} /> {c.label}
                  </span>
                </th>
                {LEVELS.map((_, i) => (
                  <td key={i}>{rules ? bandRange(i as RiskLevel, rules[c.key]) : <span className="skeleton" />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="load-rules">
        <h3>
          <Icon name="package" size={18} /> Load rules
        </h3>
        <p className="muted">Heavier trucks are more exposed to high wind, so wind risk is raised by load weight:</p>
        <ul>
          {(rules?.load_rules ?? ["", "", ""]).map((rule, i) => (
            <li key={i}>{rule || <span className="skeleton wide" />}</li>
          ))}
        </ul>
        <p className="muted small">A checkpoint takes the worst of its wind, rain and snow levels.</p>
      </div>
    </div>
  );
}
