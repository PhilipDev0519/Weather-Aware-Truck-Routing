import { useEffect, useRef } from "react";
import { useMapEvents } from "react-leaflet";
import { mercatorY } from "../geo";
import type { HeatmapResponse } from "../types";
import type { ProbePoint } from "./HeatmapControls";

// Converts the cursor to grid coordinates, with the same maths as the backend
// grid (rows are even in Mercator y).
export function HeatmapProbe({ data, onProbe }: { data: HeatmapResponse; onProbe: (p: ProbePoint | null) => void }) {
  const frame = useRef(0);
  const [[south, west], [north, east]] = data.bounds;
  const yNorth = mercatorY(north);
  const ySouth = mercatorY(south);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useMapEvents({
    mousemove(e) {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const x = ((e.latlng.lng - west) / (east - west)) * data.cols;
        const y = ((yNorth - mercatorY(e.latlng.lat)) / (yNorth - ySouth)) * data.rows;
        // Off the grid counts as hovering too: the readout says it's outside the corridor.
        onProbe({ x, y });
      });
    },
    mouseout() {
      cancelAnimationFrame(frame.current);
      onProbe(null);
    },
  });
  return null;
}
