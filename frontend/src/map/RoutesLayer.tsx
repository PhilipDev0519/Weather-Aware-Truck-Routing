import L from "leaflet";
import { memo, useMemo, useState } from "react";
import { CircleMarker, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { iconSvg } from "../components/Icon";
import { compass, fixedDown, formatDuration, formatMiles, formatTime } from "../format";
import { levelColor, levelLabel } from "../risk";
import type { Checkpoint, LatLng, PlanResponse, RouteOption } from "../types";

const OTHER_ROUTE = { color: "#526170", weight: 5, opacity: 0.5 };
const OUTLINE = { color: "#0b2e3b", weight: 10, opacity: 0.85 };

// The selected route gets the full summary; the others a compact tag, so three
// labels fit on the map without covering each other.
function routeLabelIcon(route: RouteOption, selected: boolean) {
  const details = selected
    ? `<span>Arrive ${formatTime(route.arrival)}</span>
      <span>Severe+ ${formatMiles(route.risk_miles.severe + route.risk_miles.no_travel)} · High ${formatMiles(route.risk_miles.high)}</span>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: undefined,
    html: `<div class="route-label${selected ? " selected" : ""}${route.recommended ? " recommended" : ""}">
      <b>${route.recommended ? "★ " : ""}${route.name}</b>
      <span>${formatDuration(route.duration_hours)} · ${formatMiles(route.distance_miles)}</span>
      ${details}
    </div>`,
  });
}

const endpointIcon = (kind: "origin" | "destination") =>
  L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div class="endpoint ${kind}" title="${kind}">${kind === "origin" ? "" : iconSvg("flag", 12)}</div>`,
  });

export function CheckpointTooltip({ cp, routeName }: { cp: Checkpoint; routeName: string }) {
  return (
    <div className="cp-tooltip">
      <div className="cp-title">
        <span className="chip" style={{ background: levelColor(cp.level) }}>
          {levelLabel(cp.level)}
        </span>
        {routeName} · mile {cp.mile.toFixed(0)}
      </div>
      <div>ETA {formatTime(cp.eta)}</div>
      {cp.weather ? (
        <div className="cp-weather">
          Wind {fixedDown(cp.weather.wind_mph, 0)} mph
          {cp.weather.wind_from_deg != null && ` from ${compass(cp.weather.wind_from_deg)}`}
          {cp.weather.gust_mph !== null && ` (gust ${fixedDown(cp.weather.gust_mph, 0)})`} · Rain{" "}
          {fixedDown(cp.weather.rain_in_hr, 2)} in/hr · Snow {fixedDown(cp.weather.snow_in_hr, 2)} in/hr
          {cp.weather.temp_f !== null && ` · ${cp.weather.temp_f}°F`}
        </div>
      ) : null}
      {cp.reasons.map((r) => (
        <div key={r} className="cp-reason">
          {r}
        </div>
      ))}
    </div>
  );
}

const sample = (g: LatLng[], n: number) =>
  Array.from({ length: n }, (_, i) => g[Math.floor(((i + 0.5) * g.length) / n)]);

// Rough label sizes in px (see .route-label), enough to keep them apart.
const LABEL_SIZE = { selected: { w: 190, h: 82 }, compact: { w: 128, h: 42 } };
const LABEL_GAP_PX = 120; // beyond this, being further from other routes doesn't matter

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

// Place labels one at a time in screen space at the current zoom, selected
// route first: each goes where it covers no label already placed and sits
// clearly on its own route, away from the others.
function labelPositions(map: L.Map, zoom: number, routes: RouteOption[], selectedId: string): Map<string, LatLng> {
  const px = (p: LatLng) => map.project(p, zoom);
  const ordered = [...routes].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  const placed = new Map<string, LatLng>();
  const boxes: Box[] = [];

  for (const route of ordered) {
    const size = route.id === selectedId ? LABEL_SIZE.selected : LABEL_SIZE.compact;
    const others = routes.filter((r) => r !== route).flatMap((r) => sample(r.geometry, 120).map(px));
    // skip the ends, where all routes start and finish together
    const g = route.geometry;
    const candidates = sample(g.slice(Math.floor(g.length * 0.15), Math.ceil(g.length * 0.85)), 40);
    let best = g[Math.floor(g.length / 2)];
    let bestBox: Box | null = null;
    let bestScore = -Infinity;
    for (const p of candidates) {
      const { x, y } = px(p);
      // .route-label is translated (-50%, -120%) from its point
      const box = { left: x - size.w / 2, right: x + size.w / 2, top: y - size.h * 1.2, bottom: y - size.h * 0.2 };
      const clearance = Math.min(LABEL_GAP_PX, ...others.map((q) => Math.hypot(q.x - x, q.y - y)));
      const covered = boxes.reduce((sum, b) => sum + overlap(box, b), 0);
      const score = clearance - covered / 40;
      if (score > bestScore) {
        best = p;
        bestBox = box;
        bestScore = score;
      }
    }
    placed.set(route.id, best);
    if (bestBox) boxes.push(bestBox);
  }
  return placed;
}

function RouteLabels({
  routes,
  selectedId,
  onSelect,
}: {
  routes: RouteOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const icons = useMemo(
    () => new Map(routes.map((r) => [r.id, routeLabelIcon(r, r.id === selectedId)])),
    [routes, selectedId],
  );
  const spots = useMemo(() => labelPositions(map, zoom, routes, selectedId), [map, zoom, routes, selectedId]);

  return (
    <>
      {routes.map((route) => (
        <Marker
          key={`label-${route.id}`}
          position={spots.get(route.id)!}
          icon={icons.get(route.id)!}
          zIndexOffset={route.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(route.id) }}
        >
          <Tooltip direction="right" offset={[12, 0]}>
            Avg risk {route.avg_risk.toFixed(2)} · rank #{route.rank}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

const ETA_SPACING_PX = 80;
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const etaIcon = (text: string) =>
  L.divIcon({ className: "", iconSize: undefined, html: `<div class="eta-tag">${text}</div>` });

// Arrival times next to the selected route's checkpoints, skipping any that
// would sit too close together on screen at the current zoom.
function CheckpointEtas({ route }: { route: RouteOption }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const shown = useMemo(() => {
    const kept: { cp: Checkpoint; x: number; y: number }[] = [];
    for (const cp of route.checkpoints) {
      const { x, y } = map.project([cp.lat, cp.lon], zoom);
      if (kept.every((k) => Math.hypot(k.x - x, k.y - y) >= ETA_SPACING_PX)) kept.push({ cp, x, y });
    }
    return kept.map(({ cp }) => cp);
  }, [map, route, zoom]);

  return (
    <>
      {shown.map((cp) => (
        <Marker
          key={`eta-${route.id}-${cp.index}`}
          position={[cp.lat, cp.lon]}
          icon={etaIcon(clock.format(new Date(cp.eta)))}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}

interface Props {
  plan: PlanResponse;
  selectedId: string;
  onSelect: (id: string) => void;
}

export const RoutesLayer = memo(function RoutesLayer({ plan, selectedId, onSelect }: Props) {
  const selected = plan.routes.find((r) => r.id === selectedId) ?? plan.routes[0];
  const others = plan.routes.filter((r) => r.id !== selected.id);

  return (
    <>
      {others.map((route) => (
        <Polyline
          key={`line-${route.id}`}
          positions={route.geometry}
          pathOptions={OTHER_ROUTE}
          eventHandlers={{ click: () => onSelect(route.id) }}
        />
      ))}

      <Polyline
        key={`outline-${selected.id}`}
        positions={selected.geometry}
        pathOptions={OUTLINE}
        interactive={false}
      />
      {selected.segments.map((segment, i) => (
        <Polyline
          key={`${selected.id}-seg-${i}`}
          positions={segment.coords}
          pathOptions={{ color: levelColor(segment.level), weight: 6, opacity: 1 }}
          interactive={false}
        />
      ))}

      {others.flatMap((route) =>
        route.checkpoints.map((cp) => (
          <CircleMarker
            key={`${route.id}-cp-${cp.index}`}
            center={[cp.lat, cp.lon]}
            radius={route.checkpoints.length > 40 ? 2.5 : 3.5}
            pathOptions={{ color: "#fff", weight: 1, fillColor: levelColor(cp.level), fillOpacity: 0.85 }}
            eventHandlers={{ click: () => onSelect(route.id) }}
          >
            <Tooltip direction="top">
              <CheckpointTooltip cp={cp} routeName={route.name} />
            </Tooltip>
          </CircleMarker>
        )),
      )}
      {selected.checkpoints.map((cp) => (
        <CircleMarker
          key={`${selected.id}-cp-${cp.index}`}
          center={[cp.lat, cp.lon]}
          radius={selected.checkpoints.length > 40 ? 4.5 : 6}
          pathOptions={{ color: "#fff", weight: 2, fillColor: levelColor(cp.level), fillOpacity: 1 }}
        >
          <Tooltip direction="top">
            <CheckpointTooltip cp={cp} routeName={selected.name} />
          </Tooltip>
        </CircleMarker>
      ))}

      <CheckpointEtas route={selected} />

      <RouteLabels routes={plan.routes} selectedId={selected.id} onSelect={onSelect} />

      <Marker position={[plan.origin.lat, plan.origin.lon]} icon={endpointIcon("origin")}>
        <Tooltip direction="top">Origin: {plan.origin.label}</Tooltip>
      </Marker>
      <Marker position={[plan.destination.lat, plan.destination.lon]} icon={endpointIcon("destination")}>
        <Tooltip direction="top">Destination: {plan.destination.label}</Tooltip>
      </Marker>
    </>
  );
});
