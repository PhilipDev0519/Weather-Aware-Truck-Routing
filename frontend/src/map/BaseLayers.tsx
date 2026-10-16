import type L from "leaflet";
import { LayerGroup, LayersControl, Pane, TileLayer } from "react-leaflet";

export const MAX_ZOOM = 18;

// Tiles load straight from the tile servers, the fastest path. A tile that
// fails (blocked network, flaky server) is retried through our own API (see
// backend/routing/services/tiles.py), so the map still works where only the
// app itself can be reached.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const SOURCES: Record<string, string> = {
  streets: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  terrain: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
  satellite: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
  labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
};
const proxyUrl = (style: string, { z, x, y }: L.Coords) => `/api/tiles/${style}/${z}/${x}/${y}`;
const CREDITS = ' · Routing: openrouteservice / OSRM · Weather: <a href="https://open-meteo.com">Open-Meteo</a>';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_CREDIT = "Tiles &copy; Esri";
const TILE_RETRIES = 3;

// Leaflet never asks again for a tile that failed, so one dropped request
// leaves a grey square until the map is moved. Switch that tile to the proxy,
// then retry a few times.
const retryTile = (style: string) => (e: L.TileErrorEvent) => {
  const img = e.tile as HTMLImageElement;
  const tries = Number(img.dataset.retries ?? 0);
  if (tries >= TILE_RETRIES) return;
  img.dataset.retries = String(tries + 1);
  const url = proxyUrl(style, e.coords);
  window.setTimeout(() => (img.src = tries ? `${url}?retry=${tries}` : url), tries ? 800 * tries : 0);
};
const tileEvents = Object.fromEntries(Object.keys(SOURCES).map((style) => [style, { tileerror: retryTile(style) }]));

function BaseTiles({ style, ...props }: { style: string; attribution?: string; pane?: string }) {
  return <TileLayer {...props} url={SOURCES[style]} maxZoom={MAX_ZOOM} eventHandlers={tileEvents[style]} />;
}

// Streets, terrain and satellite (with place names above the heatmap).
export function BaseLayers() {
  return (
    <>
      <Pane name="labels" style={{ zIndex: 360, pointerEvents: "none" }} />
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Streets">
          <BaseTiles style="streets" attribution={OSM_CREDIT + CREDITS} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <BaseTiles style="terrain" attribution={ESRI_CREDIT + CREDITS} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <LayerGroup>
            <BaseTiles style="satellite" attribution={ESRI_CREDIT + ", Maxar, Earthstar Geographics" + CREDITS} />
            <BaseTiles style="labels" pane="labels" />
          </LayerGroup>
        </LayersControl.BaseLayer>
      </LayersControl>
    </>
  );
}
