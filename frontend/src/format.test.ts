import { describe, expect, it } from "vitest";
import { compass, fixedDown, formatDuration, formatRelative, parseTime } from "./format";

describe("fixedDown", () => {
  it("never rounds up into the next band", () => {
    expect(fixedDown(0.496, 2)).toBe("0.49");
    expect(fixedDown(24.96, 0)).toBe("24");
  });

  it("keeps exact values despite float error", () => {
    expect(fixedDown(0.29, 2)).toBe("0.29");
    expect(fixedDown(0.1, 2)).toBe("0.10");
  });
});

describe("compass", () => {
  it("names the nearest of eight directions", () => {
    expect(compass(0)).toBe("N");
    expect(compass(350)).toBe("N");
    expect(compass(225)).toBe("SW");
    expect(compass(300)).toBe("NW");
    expect(compass(-90)).toBe("W");
  });
});

describe("formatDuration", () => {
  it("shows hours and zero-padded minutes", () => {
    expect(formatDuration(8.983)).toBe("8h 59m");
    expect(formatDuration(0.5)).toBe("0h 30m");
  });
});

describe("parseTime", () => {
  it("reads 12- and 24-hour times, with or without separators", () => {
    expect(parseTime("7:30 pm")).toBe(19 * 60 + 30);
    expect(parseTime("7.30PM")).toBe(19 * 60 + 30);
    expect(parseTime("730p")).toBe(19 * 60 + 30);
    expect(parseTime("12am")).toBe(0);
    expect(parseTime("12 pm")).toBe(12 * 60);
    expect(parseTime("19:30")).toBe(19 * 60 + 30);
    expect(parseTime("0545")).toBe(5 * 60 + 45);
    expect(parseTime("6")).toBe(6 * 60);
  });

  it("rejects what isn't a time", () => {
    for (const text of ["", "noon", "24:00", "7:60", "13pm", "0am", "7:3"]) expect(parseTime(text)).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = new Date(2026, 9, 17, 12, 0);
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("says how far ahead, in plain units", () => {
    expect(formatRelative(at(0), now)).toBe("now");
    expect(formatRelative(at(40), now)).toBe("in 40 min");
    expect(formatRelative(at(60), now)).toBe("in 1 h");
    expect(formatRelative(at(195), now)).toBe("in 3 h 15 min");
    expect(formatRelative(at(1440), now)).toBe("in 1 day");
    expect(formatRelative(at(2 * 1440 + 250), now)).toBe("in 2 days 4 h");
  });

  it("flags times already passed", () => {
    expect(formatRelative(at(-120), now)).toBe("2 h ago");
  });
});
