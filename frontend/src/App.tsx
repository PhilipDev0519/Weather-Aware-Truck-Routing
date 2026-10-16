import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "./layout/SiteFooter";
import { SiteHeader } from "./layout/SiteHeader";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";

// The planner pulls in Leaflet, so it's loaded separately from the rest of the site.
const loadPlanner = () => import("./pages/PlannerPage");
const PlannerPage = lazy(() => loadPlanner().then((m) => ({ default: m.PlannerPage })));

const TITLES: Record<string, string> = {
  "/": "Weather-Aware Truck Routing",
  "/plan": "Route planner · Weather-Aware Truck Routing",
  "/about": "About · Weather-Aware Truck Routing",
};

function useRouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? TITLES["/"];
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
}

export default function App() {
  useRouteEffects();

  // Fetch the planner code in the background once the page is idle, so it opens instantly.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => void loadPlanner());
  }, []);

  return (
    <div className="site">
      <SiteHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/plan"
          element={
            <Suspense fallback={<div className="planner" />}>
              <PlannerPage />
            </Suspense>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter />
    </div>
  );
}
