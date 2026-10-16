import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Icon name="route" size={size * 0.55} />
    </span>
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
        {pathname !== "/plan" && (
          <Link to="/plan" className="btn btn-primary btn-sm header-cta">
            Plan a route <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </div>
    </header>
  );
}
