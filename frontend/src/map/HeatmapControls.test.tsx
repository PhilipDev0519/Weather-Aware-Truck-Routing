// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeatmapResponse, Rules } from "../types";
import { HeatmapControls } from "./HeatmapControls";
import { HeatGrid } from "./heatmapFrames";

afterEach(cleanup);

const rules: Rules = {
  levels: [],
  wind: { unit: "mph", edges: [25, 35, 45, 55], no_travel_inclusive: true },
  rain: { unit: "in/hr", edges: [0.1, 0.25, 0.5, 1.0], no_travel_inclusive: false },
  snow: { unit: "in/hr", edges: [0.5, 1.0, 2.0, 3.0], no_travel_inclusive: false },
  load_rules: [],
  load_adjustments: [
    { wind_level: 3, above_lbs: 30_000, level: 4 },
    { wind_level: 2, above_lbs: 40_000, level: 3 },
  ],
};

// One cell, 49 hours; the last 9 hours are past the end of the forecast.
const hours = Array.from({ length: 49 }, (_, h) => h);
const data: HeatmapResponse = {
  start: "2026-01-10T12:00:00+00:00",
  hours: 48,
  bounds: [
    [35, -91],
    [36, -90],
  ],
  rows: 1,
  cols: 1,
  cells: [0],
  points: [[35.5, -90.5]],
  frames: {
    risk: hours.map((h) => [h < 40 ? 3 : null]),
    wind: hours.map((h) => [h < 40 ? 38 : null]),
    wind_from: hours.map((h) => [h < 40 ? 315 : null]),
    rain: hours.map((h) => [h < 40 ? 0 : null]),
    snow: hours.map((h) => [h < 40 ? 0 : null]),
  },
  rules,
};

function setup(overrides: Partial<Parameters<typeof HeatmapControls>[0]> = {}) {
  const props = {
    data,
    grid: new HeatGrid(data),
    loading: false,
    error: null,
    hour: 0,
    onHour: vi.fn(),
    layer: "risk" as const,
    onLayer: vi.fn(),
    visible: true,
    onVisible: vi.fn(),
    playing: false,
    onPlaying: vi.fn(),
    probe: null,
    loadLbs: 42_000,
    ...overrides,
  };
  render(<HeatmapControls {...props} />);
  return props;
}

describe("HeatmapControls", () => {
  it("has a 0–48 hour slider", () => {
    const props = setup();
    const slider = screen.getByLabelText("Forecast hour") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "48", "1"]);
    fireEvent.change(slider, { target: { value: "36" } });
    expect(props.onHour).toHaveBeenCalledWith(36);
  });

  it("says where the truck is, and that the forecast can outlast the trip", () => {
    setup({ truckStatus: "Route A arrived Sat 6:08 AM" });
    expect(screen.getByText(/Route A arrived Sat 6:08 AM/)).toBeTruthy();
    expect(screen.getByText(/0–48 h forecast, which can outlast the trip/)).toBeTruthy();
  });

  it("shows the hour as an offset and as a clock time", () => {
    setup({ hour: 6 });
    expect(screen.getByText("+6h")).toBeTruthy();
  });

  it("switches layers and plays", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Snow" }));
    expect(props.onLayer).toHaveBeenCalledWith("snow");
    await userEvent.click(screen.getByRole("button", { name: "Play forecast" }));
    expect(props.onPlaying).toHaveBeenCalledWith(true);
  });

  it("labels weather layers with the spec's bands", () => {
    setup({ layer: "rain" });
    for (const band of ["<0.10 in/hr", "0.10–0.25 in/hr", "0.25–0.50 in/hr", "0.50–1.00 in/hr", ">1.00 in/hr"]) {
      expect(screen.getByText(band)).toBeTruthy();
    }
  });

  it("reads conditions under the cursor with the load rules applied", () => {
    setup({ probe: { x: 0.5, y: 0.5 } });
    // 38 mph is High, but Severe for more than 40,000 lb
    const readout = screen.getByText(/Wind 38 mph from NW/);
    expect(readout.querySelector("strong")?.textContent).toBe("Severe");
  });

  it("says when the slider is past the end of the forecast", () => {
    setup({ hour: 45 });
    expect(screen.getByText("No forecast this far ahead")).toBeTruthy();
  });
});
