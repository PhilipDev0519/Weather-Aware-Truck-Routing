// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkpoint, route } from "../test/routes";
import { CheckpointTable } from "./CheckpointTable";

afterEach(cleanup);

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
