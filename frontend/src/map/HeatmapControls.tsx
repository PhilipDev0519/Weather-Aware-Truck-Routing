import { Icon } from "../components/Icon";
import { compass, fixedDown, formatTime } from "../format";
import { LEVELS, assess, bandRange } from "../risk";
import type { HeatLayer, HeatmapResponse, RiskLevel } from "../types";
import type { HeatGrid } from "./heatmapFrames";

// Cursor position in grid cells (see HeatGrid).
export interface ProbePoint {
  x: number;
  y: number;
}

const LAYERS: { id: HeatLayer; label: string }[] = [
  { id: "risk", label: "Risk" },
  { id: "wind", label: "Wind" },
  { id: "rain", label: "Rain" },
  { id: "snow", label: "Snow" },
];

interface Props {
  data: HeatmapResponse | null;
  grid: HeatGrid | null;
  loading: boolean;
  error: string | null;
  hour: number;
  onHour: (hour: number) => void;
  layer: HeatLayer;
  onLayer: (layer: HeatLayer) => void;
  visible: boolean;
  onVisible: (visible: boolean) => void;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
  probe: ProbePoint | null;
  loadLbs: number;
  truckStatus?: string | null; // where the selected route's truck is at this hour
}

export function HeatmapControls(props: Props) {
  const { data, grid, loading, error, hour, layer, visible, playing, probe } = props;
  const maxHour = data?.hours ?? 48;
  const time = data ? new Date(new Date(data.start).getTime() + hour * 3_600_000) : null;
  // Departures far ahead run past the end of the forecast; those hours are empty.
  const noForecast = data ? data.frames.risk[hour].every((value) => value === null) : false;

  return (
    <div className="heat-controls">
      <div className="heat-row">
        <label className="toggle">
          <input type="checkbox" checked={visible} onChange={(e) => props.onVisible(e.target.checked)} />
          Weather heatmap
        </label>
        <div className="segmented small" role="radiogroup" aria-label="Heatmap layer">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layer === l.id}
              className={layer === l.id ? "on" : undefined}
              onClick={() => props.onLayer(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        {loading && <span className="muted">Loading forecast…</span>}
        {error && <span className="error-text">{error}</span>}
        {noForecast && <span className="muted">No forecast this far ahead</span>}
      </div>

      <div className="heat-row slider-row">
        <button
          type="button"
          className="play"
          onClick={() => props.onPlaying(!playing)}
          disabled={!data}
          aria-label={playing ? "Pause" : "Play forecast"}
        >
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <input
          type="range"
          min={0}
          max={maxHour}
          step={1}
          value={hour}
          disabled={!data}
          onChange={(e) => props.onHour(Number(e.target.value))}
          aria-label="Forecast hour"
        />
        <div className="time-label">
          <strong>+{hour}h</strong>
          <span>{time ? formatTime(time) : "—"}</span>
        </div>
      </div>

      {props.truckStatus && (
        <p className="truck-status" aria-live="polite">
          <Icon name="truck" size={14} /> {props.truckStatus}
          <span className="muted"> · the slider shows the 0–48 h forecast, which can outlast the trip</span>
        </p>
      )}

      {data && grid && (
        <div className="heat-row legend-row">
          <HeatLegend data={data} layer={layer} loadLbs={props.loadLbs} />
          <ProbeReadout grid={grid} hour={hour} probe={probe} loadLbs={props.loadLbs} />
        </div>
      )}
    </div>
  );
}

function HeatLegend({ data, layer, loadLbs }: { data: HeatmapResponse; layer: HeatLayer; loadLbs: number }) {
  return (
    <div className="heat-legend">
      {LEVELS.map((level, i) => (
        <span key={level.label} className="legend-item">
          <span className="swatch" style={{ background: level.color }} />
          {layer === "risk" ? level.label : bandRange(i as RiskLevel, data.rules[layer])}
        </span>
      ))}
      {layer === "risk" && <span className="muted">· for a {loadLbs.toLocaleString()} lb load</span>}
      {(layer === "risk" || layer === "wind") && <span className="muted">· arrows show where the wind blows</span>}
    </div>
  );
}

// Reads the same blended values the heatmap is drawn from, so the text always
// agrees with the colour under the cursor.
function ProbeReadout({
  grid,
  hour,
  probe,
  loadLbs,
}: {
  grid: HeatGrid;
  hour: number;
  probe: ProbePoint | null;
  loadLbs: number;
}) {
  if (probe === null) return <span className="probe muted">Hover the map for local conditions</span>;
  const c = grid.probe(hour, probe.x, probe.y);
  if (c === null) return <span className="probe muted">No forecast here</span>;
  const level = assess(c.wind, c.rain, c.snow, loadLbs, grid.data.rules);
  return (
    <span className="probe">
      Wind {fixedDown(c.wind, 0)} mph{c.windFrom !== null && ` from ${compass(c.windFrom)}`} · Rain{" "}
      {fixedDown(c.rain, 2)} · Snow {fixedDown(c.snow, 2)} in/hr ·{" "}
      <strong style={{ color: LEVELS[level].color }}>{LEVELS[level].label}</strong>
    </span>
  );
}
