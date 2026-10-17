import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useTheme } from "../theme";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Icon name="route" size={size * 0.55} />
    </span>
  );
}

// Shows what a click switches to: the moon for night mode, the sun for day mode.
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "Switch to day mode" : "Switch to night mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand-link">
          <BrandMark />
          <span className="brand-text">
            <strong>Weather-Aware</strong> Truck Routing
          </span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/plan">Planner</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <ThemeToggle />
        {pathname !== "/plan" && (
          <Link to="/plan" className="btn btn-primary btn-sm header-cta">
            Plan a route <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </div>
    </header>
  );
}
