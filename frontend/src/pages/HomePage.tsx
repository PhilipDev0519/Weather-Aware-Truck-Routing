import { Link } from "react-router-dom";
import { HeroScene } from "../components/HeroScene";
import { Icon, type IconName } from "../components/Icon";
import { RulesTable } from "../components/RulesTable";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "pin",
    title: "Enter your trip",
    text: "Origin, destination, departure time and load weight. That's all the planner needs.",
  },
  {
    icon: "route",
    title: "Compare 3 routes",
    text: "Three distinct routes are generated, from the fastest highway to realistic alternatives.",
  },
  {
    icon: "clock",
    title: "Weather at your ETA",
    text: "The forecast is sampled every 10, 25 or 50 miles for the hour your truck is expected to be there.",
  },
  {
    icon: "shield",
    title: "Get the safest pick",
    text: "Each checkpoint is rated with load-aware rules, and one route is recommended with a clear reason.",
  },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "layers",
    title: "Corridor heatmap",
    text: "Scrub through 0–48 hours of forecast along your corridor, with layers for risk, wind, rain and snow.",
  },
  {
    icon: "package",
    title: "Load-aware wind risk",
    text: "A 45 mph crosswind means something different at 20,000 lb than at 45,000 lb. Risk accounts for both.",
  },
  {
    icon: "truck",
    title: "Where you'll be, when",
    text: "A truck marker follows the selected route on the forecast timeline, so you can see what you'll drive into.",
  },
];

const STATS = [
  { value: "3", label: "routes compared" },
  { value: "10 / 25 / 50 mi", label: "weather checkpoints" },
  { value: "0–48 h", label: "forecast slider" },
  { value: "FMCSA", label: "rest stops in every ETA" },
];

const PRIORITIES = ["Fewest Severe miles", "Fewest High miles", "Lowest average risk", "Shortest travel time"];

export function HomePage() {
  return (
    <>
      <section className="hero">
        <HeroScene />
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="eyebrow eyebrow-flag">Route planning for truck drivers</span>
            <h1>
              Pick the route the <span className="accent-text">weather</span> won't fight you on.
            </h1>
            <p className="lead">
              Compare three truck routes, see the forecast for the hour you'll reach each stretch of road, and get a
              clear recommendation for your load.
            </p>
            <div className="hero-actions">
              <Link to="/plan" className="btn btn-cta btn-lg">
                Plan a route <Icon name="arrowRight" size={18} />
              </Link>
              <a href="#how-it-works" className="btn btn-outline-light btn-lg">
                How it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <ul className="hero-stats">
          {STATS.map((s) => (
            <li key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>From trip details to a safer route in seconds</h2>
          </div>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="step-card">
                <span className="step-num">{i + 1}</span>
                <span className="feature-icon">
                  <Icon name={step.icon} size={22} />
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Risk rules</span>
            <h2>Clear thresholds, applied at every checkpoint</h2>
            <p className="muted">Every checkpoint is classified with these thresholds. There is no hidden scoring.</p>
          </div>
          <RulesTable />
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">Recommendation</span>
            <h2>Safety first, then time</h2>
            <p className="muted">
              Routes are compared in strict order. A faster route only wins when it is just as safe. Any stretch rated
              No Travel puts a route last.
            </p>
            <ol className="priority-list">
              {PRIORITIES.map((p, i) => (
                <li key={p}>
                  <span>{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
          </div>
          <div className="feature-list">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-row">
                <span className="feature-icon">
                  <Icon name={f.icon} size={22} />
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>Ready to roll?</h2>
              <p>Try a sample trip like Denver → Salt Lake City, or plan your own.</p>
            </div>
            <Link to="/plan" className="btn btn-light btn-lg">
              Open the planner <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
