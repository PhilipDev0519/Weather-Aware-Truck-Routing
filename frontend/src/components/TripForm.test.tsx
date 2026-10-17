// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanRequest } from "../types";
import { TripForm } from "./TripForm";

const MEMPHIS = { label: "Memphis, Tennessee, United States", lat: 35.1495, lon: -90.049 };

// Only "Memph…" finds anything, so the origin box never shows a suggestion the
// test could pick by mistake while its list is closing.
vi.mock("../api", () => ({
  api: { geocode: vi.fn(async (query: string) => (query.startsWith("Memph") ? [MEMPHIS] : [])) },
}));

afterEach(cleanup);

function setup() {
  const onSubmit = vi.fn<(request: PlanRequest) => void>();
  render(<TripForm loading={false} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("TripForm", () => {
  it("sends everything the driver entered", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Origin"), "Chicago, IL");
    await user.type(screen.getByLabelText("Destination"), "Memph");
    const list = await screen.findByRole("listbox");
    await user.click(within(list).getByRole("option", { name: MEMPHIS.label }));
    await user.clear(screen.getByLabelText("Load weight (lb)"));
    await user.type(screen.getByLabelText("Load weight (lb)"), "42000");
    await user.click(screen.getByRole("radio", { name: "10 mi" }));
    await user.click(screen.getByRole("button", { name: /Find safest route/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const request = onSubmit.mock.calls[0][0];
    expect(request.origin).toEqual({ label: "Chicago, IL" }); // typed: geocoded on the server
    expect(request.destination).toEqual(MEMPHIS); // picked: coordinates go along
    expect(request.load_lbs).toBe(42_000);
    expect(request.interval_miles).toBe(10);
    expect(request.rest_breaks).toBe(true);
    expect(new Date(request.departure).getTime()).toBeGreaterThan(Date.now());
  });

  it("needs both places", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Origin"), "Chicago");
    await user.click(screen.getByRole("button", { name: /Find safest route/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter an origin and a destination.")).toBeTruthy();
  });

  it("doesn't treat an empty load as 0 lb", async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText("Load weight (lb)"));
    await user.click(screen.getByRole("button", { name: "Chicago → Memphis" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the load weight in pounds (0 or more).")).toBeTruthy();
  });

  it("caps the load at the API's limit", async () => {
    const { onSubmit, user } = setup();
    await user.clear(screen.getByLabelText("Load weight (lb)"));
    await user.type(screen.getByLabelText("Load weight (lb)"), "200000");
    await user.click(screen.getByRole("button", { name: "Chicago → Memphis" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Load weight can be at most 150,000 lb.")).toBeTruthy();
  });

  it("sample trips plan straight away with coordinates", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Dallas → Atlanta" }));
    const request = onSubmit.mock.calls[0][0];
    expect(request.origin.lat).toBeCloseTo(32.78, 1);
    expect(request.destination.label).toContain("Atlanta");
    expect(request.interval_miles).toBe(25);
  });
});
