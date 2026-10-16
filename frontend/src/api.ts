import type { LatLng, PlanRequest, PlanResponse, Place, Rules, RouteSegment } from "./types";

export class ApiError extends Error {}

// DRF errors are either {detail} or {field: [messages]}.
function describeError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    const parts = Object.entries(record).map(([field, value]) => {
      const text = Array.isArray(value)
        ? value.join(" ")
        : typeof value === "object"
          ? describeError(value, status)
          : String(value);
      return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
    });
    if (parts.length) return parts.join(" · ");
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Cannot reach the server. Check your connection.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(describeError(body, response.status));
  return body as T;
}

// The API sends each route only as its coloured stretches; join them back into one line.
export function joinSegments(segments: RouteSegment[]): LatLng[] {
  const line: LatLng[] = [];
  for (const { coords } of segments) line.push(...(line.length ? coords.slice(1) : coords));
  return line;
}

// Small in-memory caches so repeat lookups don't go back to the server.
let rulesRequest: Promise<Rules> | null = null;
const places = new Map<string, Required<Place>[]>();

export const api = {
  rules: () => {
    rulesRequest ??= request<Rules>("rules").catch((err) => {
      rulesRequest = null;
      throw err;
    });
    return rulesRequest;
  },

  geocode: async (query: string, signal?: AbortSignal) => {
    const key = query.trim().toLowerCase();
    const hit = places.get(key);
    if (hit) return hit;
    const { results } = await request<{ results: Required<Place>[] }>(`geocode?q=${encodeURIComponent(query)}`, {
      signal,
    });
    places.set(key, results);
    return results;
  },

  plan: async (body: PlanRequest, signal?: AbortSignal) => {
    const plan = await request<PlanResponse>("plan", { method: "POST", body: JSON.stringify(body), signal });
    for (const route of plan.routes) route.geometry = joinSegments(route.segments);
    return plan;
  },
};
