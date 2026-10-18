import type { CSSProperties } from "react";
import { levelColor, levelLabel } from "../risk";
import type { RiskLevel } from "../types";

const BARS = [0, 1, 2, 3, 4];

// A risk level as a label with a five-step meter, so the level reads from the
// number of lit bars as well as from the colour. Severe and No Travel are
// filled in solid so they stand out in a column of Lows.
export function RiskBadge({ level }: { level: RiskLevel | null }) {
  return (
    <span
      className="risk-badge"
      data-level={level ?? "unknown"}
      style={{ "--risk": levelColor(level) } as CSSProperties}
    >
      <span className="risk-meter" aria-hidden="true">
        {BARS.map((i) => (
          <i key={i} className={level !== null && i <= level ? "on" : undefined} />
        ))}
      </span>
      {levelLabel(level)}
    </span>
  );
}
