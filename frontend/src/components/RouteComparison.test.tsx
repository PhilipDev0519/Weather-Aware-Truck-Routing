// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { route } from "../test/routes";
import type { CriterionId, Ranking, RouteOption } from "../types";
import { RouteComparison } from "./RouteComparison";

afterEach(cleanup);

const CRITERIA: Ranking["criteria"] = [
  { id: "no_travel", label: "No Travel miles" },
  { id: "severe", label: "Severe miles" },
  { id: "high", label: "High miles" },
  { id: "avg_risk", label: "average risk" },
  { id: "travel_time", label: "travel time" },
];

// A route whose ranking values match what it shows.
function option(id: string, rank: number, severe: number, high: number, avg: number, hours: number, extra = {}) {
  return route({
    id,
    name: `Route ${id}`,
    rank,
    recommended: rank === 1,
    duration_hours: hours,
    avg_risk: avg,
    risk_miles: { low: 100 - severe - high, moderate: 0, high, severe, no_travel: 0, unknown: 0 },
    rank_keys: { no_travel: 0, severe, high, avg_risk: avg, travel_time: Math.round(hours * 60) },
    ...extra,
  });
}

// B wins on High miles: Severe is tied, so rule 2 decides.
const routes: RouteOption[] = [
  option("A", 2, 0, 40, 0.8, 9),
  option("B", 1, 0, 10, 0.9, 11),
  option("C", 3, 20, 0, 1.2, 8),
];

function setup(decided: CriterionId | null = "high", list = routes, onSelect = vi.fn()) {
  render(
    <RouteComparison
      routes={list}
      ranking={{ criteria: CRITERIA, decided_by: decided }}
      selectedId="B"
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const row = (label: RegExp) => screen.getByRole("rowheader", { name: label }).closest("tr")!;

describe("RouteComparison", () => {
  it("puts the routes in rank order and marks the best one", () => {
    setup();
    const heads = screen
      .getAllByRole("button", { pressed: false })
      .concat(screen.getByRole("button", { pressed: true }));
    expect(heads.length).toBe(3);
    const names = screen
      .getAllByRole("columnheader")
      .slice(1)
      .map((h) => h.textContent);
    expect(names[0]).toMatch(/#1.*Route B.*Best/);
    expect(names[1]).toMatch(/#2.*Route A/);
    expect(names[2]).toMatch(/#3.*Route C/);
  });

  it("lists the rules in the brief's order and shows which one decided", () => {
    setup();
    const ruleRows = screen
      .getAllByRole("rowheader")
      .slice(0, 4)
      .map((h) => h.textContent);
    expect(ruleRows[0]).toMatch(/^1Severe miles/);
    expect(ruleRows[1]).toMatch(/^2High miles.*Decides/);
    expect(ruleRows[2]).toMatch(/^3Average risk/);
    expect(ruleRows[3]).toMatch(/^4Trip time/);
    expect(within(row(/Severe miles/)).getByText("Tie")).toBeTruthy();
    expect(row(/Average risk/).className).toContain("unused"); // already decided above
  });

  it("marks the lowest value in each rule", () => {
    setup();
    const [b, a, c] = within(row(/High miles/)).getAllByRole("cell");
    expect(b.querySelector(".best")).toBeNull(); // 10 mi
    expect(a.querySelector(".best")).toBeNull(); // 40 mi
    expect(c.querySelector(".best")?.textContent).toBe("0 mi");
  });

  it("only shows No Travel miles when a route has any", () => {
    setup();
    expect(screen.queryByRole("rowheader", { name: /No Travel miles/ })).toBeNull();
    const blocked = option("C", 3, 20, 0, 1.2, 8, {
      risk_miles: { low: 70, moderate: 0, high: 0, severe: 20, no_travel: 10, unknown: 0 },
    });
    cleanup();
    setup("high", [routes[0], routes[1], blocked]);
    expect(screen.getByRole("rowheader", { name: /No Travel miles/ })).toBeTruthy();
    expect(screen.getByText("No Travel zone")).toBeTruthy();
  });

  it("flags a route that needs an extra overnight rest", () => {
    const overnight = option("C", 3, 0, 0, 0, 22, { stops: { breaks: 1, rests: 1 }, extra_rests: 1 });
    setup("travel_time", [routes[0], routes[1], overnight]);
    const stops = within(row(/Stops/)).getAllByRole("cell");
    expect(stops[2].textContent).toMatch(/30 min break \+ 10 h rest.*Extra overnight rest/);
    expect(stops[0].textContent).not.toMatch(/Extra overnight rest/);
  });

  it("has nothing to highlight when no rule decided", () => {
    setup(null);
    expect(screen.queryByText("Decides")).toBeNull();
    expect(screen.queryByText("Tie")).toBeNull();
  });

  it("selects a route from its column", async () => {
    const onSelect = setup();
    await userEvent.click(screen.getByRole("button", { name: /Route C/ }));
    expect(onSelect).toHaveBeenCalledWith("C");
    await userEvent.click(within(row(/Distance/)).getAllByRole("cell")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("A");
  });
});
