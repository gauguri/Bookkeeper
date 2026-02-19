import { describe, expect, it } from "vitest";
import { formatPercent, getGmZoneColor, normalizeGrossMargin } from "../src/utils/metrics";

describe("normalizeGrossMargin", () => {
  it("normalizes ratio and percent-like inputs", () => {
    expect(normalizeGrossMargin(0.518)).toBeCloseTo(51.8, 5);
    expect(normalizeGrossMargin("0.518")).toBeCloseTo(51.8, 5);
    expect(normalizeGrossMargin("51.8")).toBeCloseTo(51.8, 5);
    expect(normalizeGrossMargin("51.8%")).toBeCloseTo(51.8, 5);
  });

  it("handles missing and out-of-range values", () => {
    expect(normalizeGrossMargin(null)).toBe(0);
    expect(normalizeGrossMargin(undefined)).toBe(0);
    expect(normalizeGrossMargin(-10)).toBe(0);
    expect(normalizeGrossMargin(150)).toBe(100);
  });
});

describe("getGmZoneColor", () => {
  it("returns the expected zone at thresholds", () => {
    expect(getGmZoneColor(39.9)).toBe("red");
    expect(getGmZoneColor(40)).toBe("amber");
    expect(getGmZoneColor(49.9)).toBe("amber");
    expect(getGmZoneColor(50)).toBe("green");
  });
});


describe("formatPercent", () => {
  it("safely formats non-numeric input", () => {
    expect(formatPercent("51.8")).toBe("51.8%");
    expect(formatPercent(undefined)).toBe("0.0%");
  });
});
