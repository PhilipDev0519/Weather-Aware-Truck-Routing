import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import type { PlanRequest } from "./types";

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body);

const request: PlanRequest = {
  origin: { label: "Chicago", lat: 41.88, lon: -87.63 },
  destination: { label: "Memphis", lat: 35.15, lon: -90.05 },
  departure: "2026-10-17T10:00:00.000Z",
  load_lbs: 42000,
  interval_miles: 25,
  rest_breaks: true,
};

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the plan without the heatmap, which is loaded separately", async () => {
    const fetchMock = mockFetch({ routes: [], corridor: [], heatmap: null, heatmap_error: null });
    await api.plan(request);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/plan");
    expect(sentBody(fetchMock)).toEqual({ ...request, include_heatmap: false });
  });

  it("sends the plan's corridor to the heatmap endpoint", async () => {
    const fetchMock = mockFetch({ frames: {} });
    const body = { corridor: [[[41.88, -87.63] as [number, number]]], departure: request.departure, load_lbs: 42000 };
    await api.heatmap(body);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/heatmap");
    expect(sentBody(fetchMock)).toEqual(body);
  });

  it("turns a throttled request into a readable error", async () => {
    mockFetch({ detail: "Request was throttled. Expected available in 30 seconds." }, 429);
    await expect(api.plan(request)).rejects.toEqual(
      new ApiError("Request was throttled. Expected available in 30 seconds."),
    );
  });
});
