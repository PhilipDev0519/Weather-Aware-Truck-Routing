import { memo, type CSSProperties } from "react";
import { fixedDown, gustLabel } from "../format";
import { levelColor } from "../risk";
import { RiskBadge } from "./RiskBadge";
import type { Checkpoint, RouteOption } from "../types";

interface Props {
  route: RouteOption;
  onFocus: (cp: Checkpoint) => void;
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export const CheckpointTable = memo(function CheckpointTable({ route, onFocus }: Props) {
  return (
    <div className="checkpoints">
      <h3>
        {route.name} checkpoints <span className="muted">({route.checkpoints.length})</span>
      </h3>
      <div className="table-scroll">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Mile</th>
              <th>ETA</th>
              <th title="Sustained wind (gust)">
                Wind<small>mph (gust)</small>
              </th>
              <th>
                Rain<small>in/hr</small>
              </th>
              <th>
                Snow<small>in/hr</small>
              </th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((cp) => (
              <tr
                key={cp.index}
                className={cp.level !== null && cp.level >= 2 ? "risky" : undefined}
                style={{ "--risk": levelColor(cp.level) } as CSSProperties}
                onClick={() => onFocus(cp)}
                title={cp.reasons.join("\n") || "Low risk"}
              >
                <td>{cp.mile.toFixed(0)}</td>
                <td>
                  {clockFormat.format(new Date(cp.eta))}
                  <small>{dayFormat.format(new Date(cp.eta))}</small>
                </td>
                {cp.weather ? (
                  <>
                    <td>
                      {fixedDown(cp.weather.wind_mph, 0)}
                      {gustLabel(cp.weather) && <small>({gustLabel(cp.weather)})</small>}
                    </td>
                    <td>{fixedDown(cp.weather.rain_in_hr, 2)}</td>
                    <td>{fixedDown(cp.weather.snow_in_hr, 2)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="muted">
                    No forecast
                  </td>
                )}
                <td>
                  <RiskBadge level={cp.level} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
