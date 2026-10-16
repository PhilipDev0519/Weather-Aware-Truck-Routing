import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";

const METHOD: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "route",
    title: "Routes",
    text: "openrouteservice's truck (heavy goods vehicle) profile picks the roads, given the truck's gross weight, so roads with a lower weight limit are avoided. More options come from routing through side via-points; out-and-back detours are trimmed, and near-duplicates or routes more than 50% slower are dropped. Without a truck-routing key, OSRM's car routes are used instead.",
  },
  {
    icon: "clock",
    title: "Arrival times",
    text: "Driving time comes from US road speeds (OSRM) along the chosen route, capped at a truck limit (65 mph). Required rest stops are added on top: a 30-minute break after 8 hours of driving and 10 hours off after 11. Each checkpoint's ETA is the departure time plus that clock time.",
  },
  {
    icon: "rain",
    title: "Weather",
    text: "Hourly Open-Meteo forecasts are read for each checkpoint. Wind comes from the hour nearest the ETA, and rain and snow from the hour the truck is driving through.",
  },
  {
    icon: "gauge",
    title: "Risk & ranking",
    text: "Each checkpoint represents the road halfway to its neighbours. Miles are added up per risk level, and routes are ranked by Severe miles, then High miles, then average risk, then travel time.",
  },
];

const SOURCES: { name: string; role: string; href: string }[] = [
  {
    name: "openrouteservice",
    role: "Truck routing (heavy goods vehicle profile)",
    href: "https://openrouteservice.org",
  },
  { name: "OSRM", role: "Road speeds for travel times; car routing fallback", href: "https://project-osrm.org" },
  { name: "Open-Meteo", role: "Hourly wind, rain and snowfall forecasts", href: "https://open-meteo.com" },
  {
    name: "Open-Meteo Geocoding + Photon",
    role: "Place search (Photon for street addresses)",
    href: "https://open-meteo.com/en/docs/geocoding-api",
  },
  { name: "OpenStreetMap", role: "Street map tiles", href: "https://www.openstreetmap.org/copyright" },
  { name: "Esri", role: "Terrain and satellite tiles", href: "https://www.esri.com" },
];

const STACK = [
  { group: "Frontend", items: ["React 18 + TypeScript", "Vite", "Leaflet / react-leaflet", "React Router"] },
  { group: "Backend", items: ["Django 5", "Django REST Framework", "Requests (parallel, cached)", "WhiteNoise"] },
];

const LIMITS = [
  "Truck routing knows weight limits; height and hazmat restrictions are not modelled, since the form doesn't ask for the truck's height or cargo. The empty truck is assumed to weigh 33,000 lb.",
  "Rest stops follow the two hours-of-service rules that matter for one driver on one trip; sleeper-berth splits and the weekly 60/70-hour limits aren't modelled.",
  "Forecasts are available up to 14 days ahead. Anything beyond the forecast range is shown as Unknown.",
  "Forecasts are guidance only. Always follow official road closures and weather advisories.",
];

export function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <span className="eyebrow">About</span>
          <h1>Safer routes, decided in the open</h1>
          <p className="lead">
            Most route planners optimise for time. This one asks a different question:{" "}
            <em>
              given the forecast for when you'll actually be on the road, and what you're hauling, which route keeps you
              out of dangerous weather?
            </em>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Methodology</span>
            <h2>How a recommendation is made</h2>
          </div>
          <div className="method-grid">
            {METHOD.map((m) => (
              <article key={m.title} className="info-card">
                <span className="feature-icon">
                  <Icon name={m.icon} size={22} />
                </span>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container two-col">
          <div>
            <h2 className="h-small">
              <Icon name="database" size={20} /> Data sources
            </h2>
            <ul className="source-list">
              {SOURCES.map((s) => (
                <li key={s.name}>
                  <a href={s.href} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                  <span>{s.role}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">All providers are free and need no API keys.</p>
          </div>
          <div>
            <h2 className="h-small">
              <Icon name="code" size={20} /> Technology
            </h2>
            <div className="stack-grid">
              {STACK.map((s) => (
                <div key={s.group} className="stack-card">
                  <h4>{s.group}</h4>
                  <ul>
                    {s.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container narrow">
          <h2 className="h-small">
            <Icon name="info" size={20} /> Assumptions &amp; limitations
          </h2>
          <ul className="limits">
            {LIMITS.map((l) => (
              <li key={l}>
                <Icon name="alert" size={16} />
                {l}
              </li>
            ))}
          </ul>
          <div className="about-cta">
            <Link to="/plan" className="btn btn-primary btn-lg">
              Try the planner <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
