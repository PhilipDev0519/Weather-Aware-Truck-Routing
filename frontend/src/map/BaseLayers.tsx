import type L from "leaflet";
import { LayerGroup, LayersControl, Pane, TileLayer } from "react-leaflet";

export const MAX_ZOOM = 18;

type Style = "streets" | "terrain" | "satellite" | "labels";

// Tiles load straight from the tile servers, the fastest path for panning and
// zooming. If one fails (some networks block the tile hosts), it's fetched
// through our own API instead (see backend/routing/services/tiles.py).
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const DIRECT: Record<Style, string> = {
  streets: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  terrain: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
  satellite: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
  labels: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
};
export const proxyTileUrl = (style: Style, { x, y, z }: { x: number; y: number; z: number }) =>
  `/api/tiles/${style}/${z}/${x}/${y}`;

const CREDITS = ' · Routing: openrouteservice / OSRM · Weather: <a href="https://open-meteo.com">Open-Meteo</a>';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_CREDIT = "Tiles &copy; Esri";
const TILE_RETRIES = 3;

// Leaflet never asks again for a tile that failed, so one dropped request
// leaves a grey square until the map is moved. The first retry goes through
// our API; later ones retry that a few times.
const retryTile = (style: Style) => (e: L.TileErrorEvent) => {
  const img = e.tile as HTMLImageElement;
  const tries = Number(img.dataset.retries ?? 0);
  if (tries >= TILE_RETRIES) return;
  img.dataset.retries = String(tries + 1);
  const url = proxyTileUrl(style, e.coords);
  window.setTimeout(() => (img.src = tries === 0 ? url : `${url}?retry=${tries}`), tries === 0 ? 0 : 800 * tries);
};
const TILE_EVENTS = Object.fromEntries(
  (Object.keys(DIRECT) as Style[]).map((style) => [style, { tileerror: retryTile(style) }]),
) as Record<Style, L.LeafletEventHandlerFnMap>;

function BaseTiles({ style, ...props }: { style: Style; attribution?: string; pane?: string }) {
  return <TileLayer {...props} url={DIRECT[style]} maxZoom={MAX_ZOOM} eventHandlers={TILE_EVENTS[style]} />;
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
