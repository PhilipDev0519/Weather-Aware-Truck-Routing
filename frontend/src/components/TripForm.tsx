import { useState } from "react";
import { toLocalInput } from "../format";
import type { PlanRequest, Place } from "../types";
import { DepartureInput } from "./DepartureInput";
import { Icon } from "./Icon";
import { PlaceInput } from "./PlaceInput";

const INTERVALS = [10, 25, 50] as const;
// The departure box is in the browser's time zone, like every time the app shows.
const LOCAL_ZONE =
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "local";
const MAX_DAYS_AHEAD = 14;
const MAX_LOAD_LBS = 150_000; // same limit as the API

const EXAMPLES: { name: string; origin: Required<Place>; destination: Required<Place> }[] = [
  {
    name: "Denver → Salt Lake City",
    origin: { label: "Denver, Colorado, United States", lat: 39.7392, lon: -104.9903 },
    destination: { label: "Salt Lake City, Utah, United States", lat: 40.7608, lon: -111.891 },
  },
  {
    name: "Chicago → Memphis",
    origin: { label: "Chicago, Illinois, United States", lat: 41.8781, lon: -87.6298 },
    destination: { label: "Memphis, Tennessee, United States", lat: 35.1495, lon: -90.049 },
  },
  {
    name: "Dallas → Atlanta",
    origin: { label: "Dallas, Texas, United States", lat: 32.7767, lon: -96.797 },
    destination: { label: "Atlanta, Georgia, United States", lat: 33.749, lon: -84.388 },
  },
];

function nextQuarterHour(): Date {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return d;
}

interface Props {
  loading: boolean;
  onSubmit: (request: PlanRequest) => void;
}

export function TripForm({ loading, onSubmit }: Props) {
  const [origin, setOrigin] = useState<Place>({ label: "" });
  const [destination, setDestination] = useState<Place>({ label: "" });
  const [departure, setDeparture] = useState(() => toLocalInput(nextQuarterHour()));
  const [load, setLoad] = useState("40000");
  const [interval, setIntervalMiles] = useState<PlanRequest["interval_miles"]>(25);
  const [restBreaks, setRestBreaks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const build = (overrides: Partial<PlanRequest> = {}): PlanRequest | null => {
    const loadLbs = Number(load);
    const when = new Date(departure);
    const req = {
      origin,
      destination,
      departure: when.toISOString(),
      load_lbs: loadLbs,
      interval_miles: interval,
      rest_breaks: restBreaks,
      ...overrides,
    };
    if (!req.origin.label.trim() || !req.destination.label.trim()) return fail("Enter an origin and a destination.");
    if (Number.isNaN(when.getTime())) return fail("Enter a valid departure date and time.");
    if (when.getTime() < Date.now() - 3_600_000) return fail("The departure time has passed. Pick a new one.");
    if (!load.trim() || !Number.isFinite(loadLbs) || loadLbs < 0)
      return fail("Enter the load weight in pounds (0 or more).");
    if (loadLbs > MAX_LOAD_LBS) return fail(`Load weight can be at most ${MAX_LOAD_LBS.toLocaleString()} lb.`);
    setError(null);
    return req;
  };

  const fail = (message: string) => {
    setError(message);
    return null;
  };

  const submit = (overrides?: Partial<PlanRequest>) => {
    const req = build(overrides);
    if (req) onSubmit(req);
  };

  const now = new Date();
  const max = new Date(now.getTime() + MAX_DAYS_AHEAD * 86_400_000);

  return (
    <form
      className="trip-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <PlaceInput label="Origin" icon="pin" value={origin} onChange={setOrigin} placeholder="City or address" />
      <PlaceInput
        label="Destination"
        icon="flag"
        value={destination}
        onChange={setDestination}
        placeholder="City or address"
      />

      <div className="field">
        <label htmlFor="departure">
          Departure <span className="label-hint">· your time zone ({LOCAL_ZONE})</span>
        </label>
        <DepartureInput id="departure" value={departure} onChange={setDeparture} min={now} max={max} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="load">Load weight (lb)</label>
          <div className="input-wrap">
            <Icon name="package" size={17} className="input-icon" />
            <input
              id="load"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_LOAD_LBS}
              step={500}
              value={load}
              onChange={(e) => setLoad(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="field">
          <span className="label">Weather sample every</span>
          <div className="segmented" role="radiogroup" aria-label="Checkpoint interval">
            {INTERVALS.map((miles) => (
              <button
                key={miles}
                type="button"
                role="radio"
                aria-checked={interval === miles}
                className={interval === miles ? "on" : undefined}
                onClick={() => setIntervalMiles(miles)}
              >
                {miles} mi
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={restBreaks} onChange={(e) => setRestBreaks(e.target.checked)} />
        <span>
          Include required rest breaks
          <small>30 min after 8 h of driving, 10 h off after 11 h (FMCSA hours of service)</small>
        </span>
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" /> Planning routes…
          </>
        ) : (
          <>
            <Icon name="shield" size={18} /> Find safest route
          </>
        )}
      </button>

      <div className="examples">
        <span>Try a sample trip</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.name}
            type="button"
            className="chip-btn"
            disabled={loading}
            onClick={() => {
              setOrigin(ex.origin);
              setDestination(ex.destination);
              submit({ origin: ex.origin, destination: ex.destination });
            }}
          >
            {ex.name}
          </button>
        ))}
      </div>
    </form>
  );
}
