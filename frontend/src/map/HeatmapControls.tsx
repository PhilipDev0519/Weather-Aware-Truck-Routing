import type { CSSProperties } from "react";
import { Icon, type IconName } from "../components/Icon";
import { RiskBadge } from "../components/RiskBadge";
import { compass, fixedDown, formatClock, formatTime } from "../format";
import { LEVELS, assess, bandRange, classify } from "../risk";
import type { HeatLayer, HeatmapResponse, RiskLevel } from "../types";
import type { HeatGrid } from "./heatmapFrames";

// The selected route's arrival, in hours after departure (the slider's hour 0).
export interface Arrival {
  routeName: string;
  time: string; // ISO
  hours: number;
}

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
  hour: number; // after departure
  frame: number; // the heatmap frame shown for that hour
  departure: string; // ISO
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
  arrival?: Arrival | null;
}

export function HeatmapControls(props: Props) {
  const { data, grid, loading, error, hour, frame, layer, visible, playing, probe } = props;
  const maxHour = data?.hours ?? 48;
  const time = data ? new Date(new Date(props.departure).getTime() + hour * 3_600_000) : null;
  // Departures far ahead run past the end of the forecast; those hours are empty.
  const noForecast = data ? data.frames.risk[frame].every((value) => value === null) : false;

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
        {noForecast && (
          <span className="heat-flag">
            <Icon name="clock" size={13} />
            No forecast this far ahead
          </span>
        )}
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
        <div className={`slider-wrap${props.arrival && props.arrival.hours <= maxHour ? " has-eta" : ""}`}>
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
          {props.arrival && props.arrival.hours <= maxHour && (
            <EtaMark arrival={props.arrival} maxHour={maxHour} onHour={props.onHour} />
          )}
        </div>
        <div className="time-label">
          <strong>+{hour}h</strong>
          <span>{time ? formatTime(time) : "—"}</span>
        </div>
      </div>

      {data && grid && (
        <div className="heat-footer">
          <div className="heat-footer-main">
            {props.truckStatus && (
              <p className="truck-status" aria-live="polite">
                <span className="truck-status-icon">
                  <Icon name="truck" size={15} />
                </span>
                <span className="truck-status-text">
                  <strong>{props.truckStatus}</strong>
                  <span className="muted">
                    {props.arrival && props.arrival.hours > maxHour
                      ? `Arrives ${formatTime(props.arrival.time)}, after the ${maxHour} h forecast window`
                      : `The slider shows the 0–${maxHour} h forecast, which can outlast the trip`}
                  </span>
                </span>
              </p>
            )}
            <HeatLegend data={data} layer={layer} loadLbs={props.loadLbs} />
          </div>
          <ProbeReadout grid={grid} hour={frame} probe={probe} loadLbs={props.loadLbs} />
        </div>
      )}
    </div>
  );
}

// A tick on the slider at the exact arrival time. The slider moves in whole
// hours, so clicking it goes to the first hour at which the truck has arrived
// (an ETA of +10.1 h jumps to +11, not +10, where it'd still be on the road).
function EtaMark({ arrival, maxHour, onHour }: { arrival: Arrival; maxHour: number; onHour: (hour: number) => void }) {
  const at = Math.min(1, Math.max(0, arrival.hours / maxHour));
  const jumpTo = Math.min(maxHour, Math.ceil(arrival.hours - 1e-9));
  const align = at < 0.12 ? "start" : at > 0.88 ? "end" : "center";
  return (
    <button
      type="button"
      className={`eta-mark ${align}`}
      style={{ "--at": at } as React.CSSProperties}
      onClick={() => onHour(jumpTo)}
      title={`${arrival.routeName} arrives ${formatTime(arrival.time)}. Click to see the weather then.`}
      aria-label={`Go to ${arrival.routeName}'s arrival, ${formatTime(arrival.time)}`}
    >
      <span className="eta-text">
        <Icon name="flag" size={11} /> ETA {formatClock(arrival.time)}
      </span>
      <span className="eta-tick" />
    </button>
  );
}

// The levels as one scale, lowest to highest, with what each means on this layer.
function HeatLegend({ data, layer, loadLbs }: { data: HeatmapResponse; layer: HeatLayer; loadLbs: number }) {
  return (
    <div className="heat-legend">
      <ol className="heat-scale" aria-label={`${layer === "risk" ? "Risk" : LAYER_TITLE[layer]} levels`}>
        {LEVELS.map((level, i) => (
          <li key={level.label} style={{ "--level": level.color } as CSSProperties}>
            <span className="heat-scale-bar" />
            <span className="heat-scale-label">
              {layer === "risk" ? level.label : bandRange(i as RiskLevel, data.rules[layer])}
            </span>
          </li>
        ))}
      </ol>
      <div className="heat-notes">
        {layer === "risk" ? (
          <span>
            <Icon name="package" size={12} /> Rated for a {loadLbs.toLocaleString()} lb load
          </span>
        ) : (
          <span>
            <Icon name={layer} size={12} /> {LAYER_TITLE[layer]} only
          </span>
        )}
        {(layer === "risk" || layer === "wind") && (
          <span>
            <Icon name="wind" size={12} /> Arrows show where the wind blows
          </span>
        )}
      </div>
    </div>
  );
}

const LAYER_TITLE: Record<Exclude<HeatLayer, "risk">, string> = { wind: "Wind", rain: "Rain", snow: "Snow" };

// Reads the same blended values the heatmap is drawn from, so the text always
// agrees with the colour under the cursor. It keeps the same size in every
// state, so the card doesn't jump as the cursor moves.
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
  if (probe === null) {
    return (
      <ProbeMessage icon="pin" title="Hover the map">
        to read the weather at any spot for this hour
      </ProbeMessage>
    );
  }
  const result = grid.probe(hour, probe.x, probe.y);
  if (result.kind === "outside") {
    return (
      <ProbeMessage icon="route" title="Outside the forecast corridor" tone="muted">
        Forecasts are only fetched along the routes. Move closer to them.
      </ProbeMessage>
    );
  }
  if (result.kind === "no-forecast") {
    return (
      <ProbeMessage icon="clock" title="No forecast for this hour" tone="warn">
        This hour is past the end of the forecast. Move the slider back.
      </ProbeMessage>
    );
  }

  const c = result.conditions;
  const { rules } = grid.data;
  const level = assess(c.wind, c.rain, c.snow, loadLbs, rules);
  // Each reading in the colour of its own level, so it's clear which one sets the risk.
  const factors = [
    {
      key: "wind",
      label: "Wind",
      value: `${fixedDown(c.wind, 0)} mph`,
      detail: c.windFrom !== null ? `from ${compass(c.windFrom)}` : "",
      level: assess(c.wind, 0, 0, loadLbs, rules),
    },
    { key: "rain", label: "Rain", value: fixedDown(c.rain, 2), detail: "in/hr", level: classify(c.rain, rules.rain) },
    { key: "snow", label: "Snow", value: fixedDown(c.snow, 2), detail: "in/hr", level: classify(c.snow, rules.snow) },
  ];
  return (
    <div className="probe" aria-live="polite">
      <div className="probe-head">
        <span className="probe-title">Conditions here</span>
        <RiskBadge level={level} />
      </div>
      <dl className="probe-stats">
        {factors.map((f) => (
          <div key={f.key} style={{ "--level": LEVELS[f.level].color } as CSSProperties}>
            <dt>{f.label}</dt>
            <dd>
              <strong>{f.value}</strong>
              <span>{f.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ProbeMessage({
  icon,
  title,
  tone,
  children,
}: {
  icon: IconName;
  title: string;
  tone?: "muted" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className={`probe probe-message${tone ? ` ${tone}` : ""}`} aria-live="polite">
      <span className="probe-icon">
        <Icon name={icon} size={16} />
      </span>
      <span>
        <strong>{title}</strong>
        <span>{children}</span>
      </span>
    </div>
  );
}
