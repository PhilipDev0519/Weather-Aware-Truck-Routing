// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { route } from "../test/routes";
import { RecommendationCard } from "./RecommendationCard";

afterEach(cleanup);

const fact = (term: string) => screen.getByText(term).nextElementSibling?.textContent?.replace(/\u00a0/g, " ");

describe("RecommendationCard", () => {
  it("leads with the route, its trip time and the reason", () => {
    render(
      <RecommendationCard
        route={route({ name: "Route A", duration_hours: 10.12 })}
        reason="Route A is the quickest."
      />,
    );
    expect(screen.getByRole("heading", { name: "Route A" })).toBeTruthy();
    expect(screen.getByText("10h 07m")).toBeTruthy();
    expect(screen.getByText("Route A is the quickest.")).toBeTruthy();
  });

  it("shows the miles of bad weather on the way", () => {
    const risky = route({ risk_miles: { low: 60, moderate: 10, high: 20, severe: 10, no_travel: 0, unknown: 0 } });
    render(<RecommendationCard route={risky} reason="" />);
    expect(fact("Severe")).toBe("10 mi");
    expect(fact("High")).toBe("20 mi");
  });

  it("counts No Travel miles with Severe and says so", () => {
    const blocked = route({ risk_miles: { low: 80, moderate: 0, high: 0, severe: 5, no_travel: 15, unknown: 0 } });
    render(<RecommendationCard route={blocked} reason="" />);
    expect(fact("Severe+")).toBe("20 mi");
  });
});
