import { describe, expect, it } from "vitest";
import { compass, fixedDown, formatDuration } from "./format";

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
