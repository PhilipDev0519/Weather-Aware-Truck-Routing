import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { ImageOverlay, MapContainer, Pane, ZoomControl } from "react-leaflet";
import type { Checkpoint, HeatLayer, HeatmapResponse, PlanResponse } from "../types";
import { BaseLayers, MAX_ZOOM } from "./BaseLayers";
import { HeatmapControls, type ProbePoint } from "./HeatmapControls";
import { HeatGrid, frameRenderer } from "./heatmapFrames";
import { HeatmapProbe } from "./HeatmapProbe";
import { FitToPlan, FocusPopup } from "./MapFocus";
import { RiskLegend } from "./RiskLegend";
import { RoutesLayer } from "./RoutesLayer";
import { TruckMarker, useTruck } from "./TruckMarker";
import { usePrerender } from "./usePrerender";
import { WindArrows } from "./WindArrows";

const US_CENTER: [number, number] = [39.5, -98.35];
const PLAY_STEP_MS = 650;

export interface HeatmapState {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
}

interface Props {
  plan: PlanResponse | null;
  heatmap: HeatmapState;
  selectedId: string;
  onSelect: (id: string) => void;
  focus: { routeName: string; cp: Checkpoint } | null;
}

export function MapPanel({ plan, heatmap, selectedId, onSelect, focus }: Props) {
  const [hour, setHour] = useState(0);
  const [layer, setLayer] = useState<HeatLayer>("risk");
  const [visible, setVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [probe, setProbe] = useState<ProbePoint | null>(null);

  useEffect(() => {
    setHour(0);
    setPlaying(false);
  }, [heatmap.data]);

  useEffect(() => {
    if (!playing || !heatmap.data) return;
    const hours = heatmap.data.hours;
    const timer = window.setInterval(() => setHour((h) => (h + 1) % (hours + 1)), PLAY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, heatmap.data]);

  const loadLbs = plan?.load_lbs ?? 0;
  const grid = useMemo(() => (heatmap.data ? new HeatGrid(heatmap.data) : null), [heatmap.data]);
  const frameUrl = useMemo(() => (grid ? frameRenderer(grid, layer, loadLbs) : null), [grid, layer, loadLbs]);
  usePrerender(frameUrl, heatmap.data?.hours ?? 0);
  const selected = plan?.routes.find((r) => r.id === selectedId) ?? null;
  // The slider counts hours after the departure itself; the heatmap's frames
  // start on the hour before it, so each slider hour shows the nearest frame.
  const frame = heatmap.data ? forecastFrame(heatmap.data, plan?.departure, hour) : hour;
  const truck = useTruck(selected, plan?.departure, hour);
  // Same clock as the slider: hours after departure.
  const arrival = useMemo(
    () =>
      selected && plan
        ? {
            routeName: selected.name,
            time: selected.arrival,
            hours: (new Date(selected.arrival).getTime() - new Date(plan.departure).getTime()) / 3_600_000,
          }
        : null,
    [selected, plan],
  );

  return (
    <div className="map-panel">
      <MapContainer center={US_CENTER} zoom={4} maxZoom={MAX_ZOOM} preferCanvas zoomControl={false} className="map">
        <ZoomControl position="topright" />
        <BaseLayers />
        <Pane name="heatmap" style={{ zIndex: 350 }}>
          {heatmap.data && visible && frameUrl && (
            <ImageOverlay url={frameUrl(frame)} bounds={heatmap.data.bounds} className="heatmap-image" />
          )}
        </Pane>
        {/* above the heatmap and labels, below the routes */}
        <Pane name="arrows" style={{ zIndex: 380, pointerEvents: "none" }}>
          {heatmap.data && visible && (layer === "risk" || layer === "wind") && (
            <WindArrows data={heatmap.data} hour={frame} />
          )}
        </Pane>
        {plan && <RoutesLayer plan={plan} selectedId={selectedId} onSelect={onSelect} />}
        {plan && <FitToPlan plan={plan} />}
        {truck && <TruckMarker truck={truck} />}
        {heatmap.data && <HeatmapProbe data={heatmap.data} onProbe={setProbe} />}
        {focus && <FocusPopup focus={focus} />}
      </MapContainer>

      <RiskLegend route={selected} />

      {plan && (
        <HeatmapControls
          data={heatmap.data}
          grid={grid}
          loading={heatmap.loading}
          error={heatmap.error}
          hour={hour}
          frame={frame}
          departure={plan.departure}
          onHour={(h) => {
            setPlaying(false);
            setHour(h);
          }}
          layer={layer}
          onLayer={setLayer}
          visible={visible}
          onVisible={setVisible}
          playing={playing}
          onPlaying={setPlaying}
          probe={probe}
          loadLbs={plan.load_lbs}
          truckStatus={truck?.status ?? null}
          arrival={arrival}
        />
      )}
    </div>
  );
}

// The heatmap frame nearest to `hour` hours after departure.
export function forecastFrame(data: HeatmapResponse, departure: string | undefined, hour: number): number {
  const offset = departure ? (new Date(departure).getTime() - new Date(data.start).getTime()) / 3_600_000 : 0;
  return Math.min(data.hours, Math.max(0, Math.round(hour + offset)));
}
