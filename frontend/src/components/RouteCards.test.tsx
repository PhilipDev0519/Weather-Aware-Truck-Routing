// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkpoint, route } from "../test/routes";
import { CheckpointTable } from "./CheckpointTable";
import { RouteCards } from "./RouteCards";

afterEach(cleanup);

const routes = [
  route({ id: "A", name: "Route A", rank: 2, duration_hours: 9.5 }),
  route({
    id: "B",
    name: "Route B",
    rank: 1,
    recommended: true,
    duration_hours: 10.25,
    driving_hours: 9.75,
    stops: { breaks: 1, rests: 0 },
  }),
  route({
    id: "C",
    name: "Route C",
    rank: 3,
    risk_miles: { low: 60, moderate: 0, high: 15, severe: 20, no_travel: 5, unknown: 0 },
    max_level: 4,
  }),
];

describe("RouteCards", () => {
  it("flags a route that needs an extra overnight rest", () => {
    const overnight = route({
      id: "D",
      name: "Route D",
      rank: 3,
      duration_hours: 22,
      driving_hours: 11.5,
      stops: { breaks: 1, rests: 1 },
      extra_rests: 1,
    });
    render(<RouteCards routes={[routes[0], overnight]} selectedId="A" onSelect={() => {}} />);
    const [quick, slow] = screen.getAllByRole("button");
    expect(within(slow).getByText(/Extra overnight rest/)).toBeTruthy();
    expect(within(quick).queryByText(/Extra overnight rest/)).toBeNull();
  });

  it("lists routes best first and marks the recommendation", () => {
    render(<RouteCards routes={routes} selectedId="B" onSelect={() => {}} />);
    const cards = screen.getAllByRole("button");
    expect(cards.map((c) => c.textContent?.match(/Route \w/)?.[0])).toEqual(["Route B", "Route A", "Route C"]);
    expect(within(cards[0]).getByText("Recommended")).toBeTruthy();
    expect(cards[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("shows trip time with the stops that make it up", () => {
    render(<RouteCards routes={routes} selectedId="B" onSelect={() => {}} />);
    const card = screen.getAllByRole("button")[0];
    expect(card.textContent).toContain("10h 15m");
    expect(card.textContent).toContain("9h 45m driving + 1 × 30 min break");
  });

  it("counts No Travel with Severe and flags it", () => {
    render(<RouteCards routes={routes} selectedId="B" onSelect={() => {}} />);
    const card = screen.getAllByRole("button")[2];
    expect(within(card).getByText("No Travel zone")).toBeTruthy();
    expect(within(card).getByText("Severe+").nextElementSibling?.textContent).toBe("25 mi");
    expect(within(card).getByText("High").nextElementSibling?.textContent).toBe("15 mi");
  });

  it("selects a route on click", async () => {
    const onSelect = vi.fn();
    render(<RouteCards routes={routes} selectedId="B" onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole("button")[2]);
    expect(onSelect).toHaveBeenCalledWith("C");
  });
});

describe("CheckpointTable", () => {
  it("never rounds a value up into the next band", () => {
    const cp = checkpoint({
      mile: 25,
      level: 2,
      weather: { wind_mph: 34.9, gust_mph: 41.2, wind_from_deg: 200, rain_in_hr: 0.499, snow_in_hr: 0, temp_f: 50 },
    });
    render(<CheckpointTable route={route({ checkpoints: [cp] })} onFocus={() => {}} />);
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells[2]).toBe("34(41)"); // not 35, which would read as High wind
    expect(cells[3]).toBe("0.49"); // not 0.50, which would read as Severe rain
    expect(cells[5]).toBe("High");
  });

  it("marks checkpoints past the forecast as Unknown", () => {
    const cp = checkpoint({ weather: null, level: null, reasons: ["No forecast available for this time"] });
    render(<CheckpointTable route={route({ checkpoints: [cp] })} onFocus={() => {}} />);
    expect(screen.getByText("No forecast")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("focuses a checkpoint on the map when its row is clicked", async () => {
    const onFocus = vi.fn();
    const cp = checkpoint({ index: 3, mile: 75 });
    render(<CheckpointTable route={route({ checkpoints: [cp] })} onFocus={onFocus} />);
    await userEvent.click(screen.getByText("75"));
    expect(onFocus).toHaveBeenCalledWith(cp);
  });
});
