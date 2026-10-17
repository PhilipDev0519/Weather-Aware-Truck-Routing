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

// B wins on High miles: Severe is equal, so rule 2 decides.
const routes: RouteOption[] = [
  option("A", 2, 0, 40, 0.8, 9),
  option("B", 1, 0, 10, 0.9, 11),
  option("C", 3, 20, 0, 1.2, 8),
];

function setup(decided: CriterionId | null = "high", list = routes) {
  const onSelect = vi.fn();
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

const row = (name: RegExp) => screen.getByRole("rowheader", { name }).closest("tr")!;
// The cells keep numbers and units together with non-breaking spaces.
const values = (name: RegExp) =>
  within(row(name))
    .getAllByRole("cell")
    .map((c) => c.textContent?.replace(/\u00a0/g, " "));

describe("RouteComparison", () => {
  it("puts the routes in rank order, recommended first", () => {
    setup();
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Route BBest route", "Route AOption 2", "Route COption 3"]);
  });

  it("lists the rules in the brief's order", () => {
    setup();
    const rules = screen
      .getAllByRole("rowheader")
      .slice(0, 4)
      .map((h) => h.textContent);
    expect(rules).toEqual(["1.Severe miles", "2.High miles", "3.Average risk", "4.Trip time"]);
  });

  it("marks the rule that decided", () => {
    setup();
    expect(row(/High miles/).className).toBe("decides");
    expect(row(/Severe miles/).className).toBe("");
  });

  it("puts the best value of each rule in bold", () => {
    setup();
    const bold = (name: RegExp) =>
      within(row(name))
        .getAllByRole("cell")
        .map((c) => !!c.querySelector(".best"));
    expect(values(/High miles/)).toEqual(["10 mi", "40 mi", "0 mi"]);
    expect(bold(/High miles/)).toEqual([false, false, true]);
    expect(bold(/Severe miles/)).toEqual([true, true, false]);
  });

  it("only shows No Travel miles when a route has any", () => {
    setup();
    expect(screen.queryByRole("rowheader", { name: /No Travel miles/ })).toBeNull();
    cleanup();
    const blocked = option("C", 3, 20, 0, 1.2, 8, {
      risk_miles: { low: 70, moderate: 0, high: 0, severe: 20, no_travel: 10, unknown: 0 },
      max_level: 4,
    });
    setup("high", [routes[0], routes[1], blocked]);
    expect(values(/No Travel miles/)).toEqual(["0 mi", "0 mi", "10 mi"]);
    expect(values(/Worst weather/)[2]).toBe("No Travel");
  });

  it("notes a route that needs an extra overnight rest", () => {
    const overnight = option("C", 3, 0, 0, 0, 22, { stops: { breaks: 1, rests: 1 }, extra_rests: 1 });
    setup("travel_time", [routes[0], routes[1], overnight]);
    expect(values(/Stops/)).toEqual(["None", "None", "30 min break, 10 h restExtra 10 h rest"]);
  });

  it("marks nothing when no rule decided", () => {
    setup(null);
    expect(document.querySelector("tr.decides")).toBeNull();
  });

  it("selects a route from its column", async () => {
    const onSelect = setup();
    await userEvent.click(screen.getByRole("button", { name: /Route C/ }));
    expect(onSelect).toHaveBeenCalledWith("C");
    await userEvent.click(within(row(/Distance/)).getAllByRole("cell")[1]);
    expect(onSelect).toHaveBeenLastCalledWith("A");
  });
});
