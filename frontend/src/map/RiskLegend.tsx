import { LEVELS, UNKNOWN_COLOR } from "../risk";

export function RiskLegend() {
  return (
    <div className="risk-legend">
      <strong>Route risk</strong>
      {LEVELS.map((l) => (
        <span key={l.label}>
          <i style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
      <span>
        <i style={{ background: UNKNOWN_COLOR }} />
        No forecast
      </span>
    </div>
  );
}
