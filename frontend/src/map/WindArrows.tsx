import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { HeatmapResponse } from "../types";

const MIN_SPACING_PX = 44;

// All arrows are drawn on one canvas that's redrawn when the hour or the view
// changes. (One Leaflet marker per arrow made scrubbing through hours slow.)
class ArrowCanvas extends L.Layer {
  private canvas = document.createElement("canvas");
  private data: HeatmapResponse | null = null;
  private hour = 0;

  constructor(private paneName: string) {
    super();
    this.canvas.className = "wind-canvas";
  }

  onAdd(map: L.Map) {
    map.getPane(this.paneName)!.appendChild(this.canvas);
    map.on("moveend resize", this.draw, this);
    map.on("zoomstart", this.hide, this);
    this.draw();
    return this;
  }

  onRemove(map: L.Map) {
    this.canvas.remove();
    map.off("moveend resize", this.draw, this);
    map.off("zoomstart", this.hide, this);
    return this;
  }

  show(data: HeatmapResponse, hour: number) {
    this.data = data;
    this.hour = hour;
    this.draw();
  }

  private hide() {
    this.canvas.style.visibility = "hidden";
  }

  private draw() {
    const map = this._map;
    if (!map || !this.data) return;
    const size = map.getSize();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = size.x * ratio;
    this.canvas.height = size.y * ratio;
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.canvas.style.visibility = "visible";
    // The pane moves while panning, so pin the canvas to the view's top-left corner.
    L.DomUtil.setPosition(this.canvas, map.containerPointToLayerPoint([0, 0]));

    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const winds = this.data.frames.wind[this.hour];
    const directions = this.data.frames.wind_from?.[this.hour] ?? [];
    const path = new Path2D();
    // When zoomed out the cells get close together; keep one arrow per screen square.
    const taken = new Set<string>();
    this.data.points.forEach((point, k) => {
      const mph = winds[k];
      const from = directions[k];
      if (mph == null || from == null || mph < 1) return;
      const p = map.latLngToContainerPoint(point);
      if (p.x < -20 || p.y < -20 || p.x > size.x + 20 || p.y > size.y + 20) return;
      const slot = `${Math.floor(p.x / MIN_SPACING_PX)},${Math.floor(p.y / MIN_SPACING_PX)}`;
      if (taken.has(slot)) return;
      taken.add(slot);
      addArrow(path, p.x, p.y, from, mph);
    });

    // A thin halo keeps them readable on any basemap without drawing the eye
    // away from the routes.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3.5;
    ctx.stroke(path);
    ctx.strokeStyle = "rgba(22,49,59,0.8)";
    ctx.lineWidth = 1.6;
    ctx.stroke(path);
  }
}

// The data says where the wind comes *from*; the arrow points where it goes.
// Stronger wind gets a longer arrow.
function addArrow(path: Path2D, x: number, y: number, fromDeg: number, mph: number) {
  const length = 10 + 8 * Math.min(1, mph / 40);
  const heading = ((fromDeg + 180) * Math.PI) / 180;
  const dx = Math.sin(heading);
  const dy = -Math.cos(heading);
  const tipX = x + (dx * length) / 2;
  const tipY = y + (dy * length) / 2;
  const head = 4.5;

  path.moveTo(x - (dx * length) / 2, y - (dy * length) / 2);
  path.lineTo(tipX, tipY);
  path.moveTo(tipX - head * (dx + dy * 0.6), tipY - head * (dy - dx * 0.6));
  path.lineTo(tipX, tipY);
  path.lineTo(tipX - head * (dx - dy * 0.6), tipY - head * (dy + dx * 0.6));
}

export function WindArrows({ data, hour }: { data: HeatmapResponse; hour: number }) {
  const map = useMap();
  const layer = useRef<ArrowCanvas>();

  useEffect(() => {
    const arrows = new ArrowCanvas("arrows").addTo(map);
    layer.current = arrows;
    return () => {
      arrows.remove();
    };
  }, [map]);

  useEffect(() => {
    layer.current?.show(data, hour);
  }, [data, hour]);

  return null;
}
