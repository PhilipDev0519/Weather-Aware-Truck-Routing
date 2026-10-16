import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { CheckpointTable } from "../components/CheckpointTable";
import { Icon } from "../components/Icon";
import { RouteCards } from "../components/RouteCards";
import { TripForm } from "../components/TripForm";
import { formatTime } from "../format";
import { MapPanel, type HeatmapState } from "../map/MapPanel";
import type { Checkpoint, PlanRequest, PlanResponse } from "../types";

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";
const NO_HEATMAP: HeatmapState = { data: null, loading: false, error: null };

export function PlannerPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapState>(NO_HEATMAP);
  const [selectedId, setSelectedId] = useState("");
  const [focus, setFocus] = useState<{ routeName: string; cp: Checkpoint } | null>(null);
  const inflight = useRef<AbortController>();

  useEffect(() => () => inflight.current?.abort(), []);

  const submit = useCallback(async (request: PlanRequest) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLoading(true);
    setError(null);
    setFocus(null);

    let result: PlanResponse;
    try {
      result = await api.plan(request, controller.signal);
    } catch (err) {
      if (!isAbort(err)) {
        setError(errorMessage(err));
        setLoading(false);
      }
      return;
    }
    setPlan(result);
    setSelectedId(result.recommended_route_id);
    setLoading(false);

    // Routes first, then the heatmap for their corridor.
    if (result.heatmap || result.heatmap_error) {
      setHeatmap({ data: result.heatmap, loading: false, error: result.heatmap_error });
      return;
    }
    setHeatmap({ ...NO_HEATMAP, loading: true });
    try {
      const data = await api.heatmap(
        { corridor: result.corridor, departure: result.departure, load_lbs: result.load_lbs },
        controller.signal,
      );
      setHeatmap({ ...NO_HEATMAP, data });
    } catch (err) {
      if (!isAbort(err)) setHeatmap({ ...NO_HEATMAP, error: errorMessage(err) });
    }
  }, []);

  const selected = plan?.routes.find((r) => r.id === selectedId) ?? null;
  const onFocus = useCallback((cp: Checkpoint) => setFocus({ routeName: selected?.name ?? "", cp }), [selected?.name]);
  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setFocus(null);
  }, []);

  return (
    <div className="planner">
      <aside className="planner-sidebar">
        <section className="panel">
          <div className="panel-head">
            <h1>Plan a trip</h1>
            <p>Enter your trip details. We'll compare routes against the forecast at your ETA.</p>
          </div>
          <TripForm loading={loading} onSubmit={submit} />
        </section>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading && <ResultsSkeleton />}

        {!loading && !plan && !error && <EmptyResults />}

        {!loading && plan && (
          <section className="results" aria-live="polite">
            <div className="recommendation">
              <span className="rec-icon">
                <Icon name="shield" size={22} />
              </span>
              <div>
                <div className="rec-label">Recommended</div>
                <div className="rec-title">Route {plan.recommended_route_id}</div>
                <p>{plan.recommendation_reason}</p>
              </div>
            </div>
            <div className="trip-meta">
              <span>
                <Icon name="calendar" size={14} /> {formatTime(plan.departure)}
              </span>
              <span>
                <Icon name="package" size={14} /> {plan.load_lbs.toLocaleString()} lb
              </span>
              <span>
                <Icon name="pin" size={14} /> every {plan.interval_miles} mi
              </span>
              <span
                title={
                  plan.routing.profile === "truck"
                    ? "Roads from openrouteservice's truck profile (avoids lower weight limits); times from US road speeds capped at 65 mph"
                    : "Truck routing unavailable: OSRM car routes with speeds capped at 65 mph"
                }
              >
                <Icon name="truck" size={14} />{" "}
                {plan.routing.profile === "truck"
                  ? `Truck routes · ${plan.routing.gross_lbs?.toLocaleString()} lb gross`
                  : "Car routes, truck speeds"}
              </span>
            </div>

            {plan.warnings.map((w) => (
              <div key={w} className="alert alert-warning">
                <Icon name="alert" size={18} />
                <span>{w}</span>
              </div>
            ))}

            <h2 className="results-title">Route options</h2>
            <RouteCards routes={plan.routes} selectedId={selectedId} onSelect={onSelect} />
            {selected && <CheckpointTable route={selected} onFocus={onFocus} />}

            <details className="rules-note">
              <summary>How routes are ranked</summary>
              <ol>
                <li>Fewest Severe miles (No Travel miles are counted first, as the worst)</li>
                <li>Fewest High miles</li>
                <li>Lowest average risk (distance-weighted, Low = 0 … No Travel = 4)</li>
                <li>Shortest travel time</li>
              </ol>
              <p className="muted small">
                Each checkpoint uses the forecast for the hour the truck is expected to reach it, and represents the
                road halfway to its neighbours.
              </p>
            </details>
          </section>
        )}
      </aside>

      <main className="planner-map">
        <MapPanel plan={plan} heatmap={heatmap} selectedId={selectedId} onSelect={onSelect} focus={focus} />
        {loading && <MapLoading />}
        {!plan && !loading && (
          <div className="map-empty">
            <span className="feature-icon">
              <Icon name="map" size={24} />
            </span>
            <h3>Your routes will appear here</h3>
            <p>You'll see three route options coloured by risk, checkpoints with ETAs, and a 0–48 h weather heatmap.</p>
          </div>
        )}
      </main>
    </div>
  );
}

const SLOW_PLAN_MS = 8000;

// Most plans take a second or two. When one doesn't, it's almost always the free
// weather API's per-minute limit (shared by everyone on the same server), so
// say so and show that it's still going.
function MapLoading() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="map-loading">
      <span className="spinner" /> Finding routes and forecasts…
      {elapsedMs >= SLOW_PLAN_MS && (
        <small>
          The free weather service allows a limited number of forecasts per minute, so we're waiting for it to accept
          more. This usually clears within a minute ({Math.round(elapsedMs / 1000)} s so far).
        </small>
      )}
    </div>
  );
}

function EmptyResults() {
  return (
    <section className="empty-results">
      <h2>What you'll get</h2>
      <ul>
        <li>
          <Icon name="route" size={18} /> Three route options compared side by side
        </li>
        <li>
          <Icon name="clock" size={18} /> Weather at each checkpoint for the hour you arrive
        </li>
        <li>
          <Icon name="shield" size={18} /> A recommended route, with the reason it was chosen
        </li>
      </ul>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <section className="results" aria-busy="true" aria-label="Loading routes">
      <div className="skeleton-block tall" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-block" />
      ))}
    </section>
  );
}
