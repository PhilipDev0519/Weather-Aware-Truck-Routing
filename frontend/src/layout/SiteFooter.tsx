import { Link } from "react-router-dom";
import { BrandMark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">
            <BrandMark size={30} />
            <strong>Weather-Aware Truck Routing</strong>
          </div>
          <p>
            Compare routes by forecast risk, load weight and travel time, with the weather sampled at the hour your
            truck actually gets there.
          </p>
        </div>

        <div className="footer-col">
          <h4>Product</h4>
          <Link to="/">Home</Link>
          <Link to="/plan">Route planner</Link>
          <Link to="/about">About &amp; methodology</Link>
        </div>

        <div className="footer-col">
          <h4>Data sources</h4>
          <a href="https://openrouteservice.org" target="_blank" rel="noreferrer">
            openrouteservice truck routing
          </a>
          <a href="https://project-osrm.org" target="_blank" rel="noreferrer">
            OSRM road speeds
          </a>
          <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
            Open-Meteo forecasts
          </a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
          <a href="https://www.esri.com" target="_blank" rel="noreferrer">
            Esri basemap
          </a>
        </div>

        <div className="footer-col">
          <h4>Built with</h4>
          <span>React + TypeScript</span>
          <span>Leaflet</span>
          <span>Django REST Framework</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Weather-Aware Truck Routing</span>
        <span>Forecasts are guidance only. Always follow official road and weather advisories.</span>
      </div>
    </footer>
  );
}
