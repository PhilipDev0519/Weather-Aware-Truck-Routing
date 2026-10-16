import L from "leaflet";
import { useEffect } from "react";
import { Popup, useMap } from "react-leaflet";
import type { Checkpoint, PlanResponse } from "../types";
import { CheckpointTooltip } from "./RoutesLayer";

// Zooms to a new plan, and flies to a checkpoint picked in the table.
export function FitToPlan({ plan }: { plan: PlanResponse }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(plan.routes.flatMap((r) => r.geometry));
    map.fitBounds(bounds, { padding: [48, 48], paddingBottomRight: [48, 160] });
  }, [map, plan]);
  return null;
}

export function FocusPopup({ focus }: { focus: { routeName: string; cp: Checkpoint } }) {
  const map = useMap();
  const { cp } = focus;
  useEffect(() => {
    map.flyTo([cp.lat, cp.lon], Math.max(map.getZoom(), 8), { duration: 0.6 });
  }, [map, cp]);
  return (
    <Popup position={[cp.lat, cp.lon]} key={`${focus.routeName}-${cp.index}`}>
      <CheckpointTooltip cp={cp} routeName={focus.routeName} />
    </Popup>
  );
}
