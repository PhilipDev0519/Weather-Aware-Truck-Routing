import L from "leaflet";
import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import { iconSvg } from "../components/Icon";
import { formatTime } from "../format";
import { RouteTracker } from "../geo";
import type { LatLng, RouteOption } from "../types";

const truckIcon = L.divIcon({
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div class="truck">${iconSvg("truck", 18)}</div>`,
});

export interface TruckState {
  position: LatLng;
  status: string; // e.g. "Route A: mile 120 of 532"
  time: Date;
}

// Where the truck would be on the selected route at the slider's hour. The
// slider covers the 48 h forecast, which usually outlasts the trip, so after
// arrival the truck waits at the destination while the weather plays on.
export function useTruck(
  route: RouteOption | null,
  departure: string | undefined,
  heatStart: string | undefined,
  hour: number,
): TruckState | null {
  const tracker = useMemo(
    () => route && new RouteTracker(route.geometry, route.checkpoints, route.distance_miles, route.stop_timeline),
    [route],
  );
  if (!route || !tracker || !departure || !heatStart) return null;

  const time = new Date(new Date(heatStart).getTime() + hour * 3_600_000);
  const hours = (time.getTime() - new Date(departure).getTime()) / 3_600_000;
  const mile = tracker.mileAtHours(hours);
  const stop = tracker.stopAt(hours);
  let status: string;
  if (hours < 0) status = `${route.name} departs ${formatTime(departure)}`;
  else if (hours >= route.duration_hours) status = `${route.name} arrived ${formatTime(route.arrival)}`;
  else if (stop)
    status = `${route.name}: ${stop.kind === "rest" ? "10 h rest" : "30 min break"} at mile ${stop.mile.toFixed(0)}`;
  else status = `${route.name}: mile ${mile.toFixed(0)} of ${route.distance_miles.toFixed(0)}`;
  return { position: tracker.positionAtMile(mile), status, time };
}

export function TruckMarker({ truck }: { truck: TruckState }) {
  return (
    <Marker position={truck.position} icon={truckIcon} zIndexOffset={2000}>
      <Tooltip direction="top" offset={[0, -14]}>
        {formatTime(truck.time)}: {truck.status}
      </Tooltip>
    </Marker>
  );
}
