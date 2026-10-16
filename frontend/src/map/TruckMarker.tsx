import L from "leaflet";
import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import { iconSvg } from "../components/Icon";
import { formatTime } from "../format";
import { RouteTracker } from "../geo";
import type { RouteOption } from "../types";

const truckIcon = L.divIcon({
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div class="truck">${iconSvg("truck", 18)}</div>`,
});

// Where the truck would be on the selected route at the slider's hour.
export function TruckMarker({
  route,
  departure,
  heatStart,
  hour,
}: {
  route: RouteOption;
  departure: string;
  heatStart: string;
  hour: number;
}) {
  const tracker = useMemo(() => new RouteTracker(route.geometry, route.checkpoints, route.distance_miles), [route]);
  const hoursSinceDeparture = hour - (new Date(departure).getTime() - new Date(heatStart).getTime()) / 3_600_000;
  const mile = tracker.mileAtHours(hoursSinceDeparture);
  const position = tracker.positionAtMile(mile);
  const status =
    hoursSinceDeparture < 0
      ? "Not departed yet"
      : mile >= route.distance_miles - 0.05
        ? "Arrived"
        : `Mile ${mile.toFixed(0)} of ${route.distance_miles.toFixed(0)}`;
  const time = new Date(new Date(heatStart).getTime() + hour * 3_600_000);

  return (
    <Marker position={position} icon={truckIcon} zIndexOffset={2000}>
      <Tooltip direction="top" offset={[0, -14]}>
        {route.name} at {formatTime(time)}: {status}
      </Tooltip>
    </Marker>
  );
}
