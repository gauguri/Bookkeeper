import { describe, expect, it } from "vitest";

import { normalizeGaugeValue, toGaugeAngle } from "./gaugeMath";

describe("toGaugeAngle", () => {
  it("maps gross profit margin on a 0-100 percent scale", () => {
    expect(toGaugeAngle(0, 0, 100, -90, 90)).toBe(-90);
    expect(toGaugeAngle(50, 0, 100, -90, 90)).toBe(0);
    expect(toGaugeAngle(100, 0, 100, -90, 90)).toBe(90);
    expect(toGaugeAngle(45.4, 0, 100, -90, 90)).toBeCloseTo(-8.28, 2);
  });

  it("maps net profit margin with negative minimums", () => {
    expect(toGaugeAngle(-20, -20, 50, -90, 90)).toBe(-90);
    expect(toGaugeAngle(50, -20, 50, -90, 90)).toBe(90);
    expect(toGaugeAngle(15, -20, 50, -90, 90)).toBeCloseTo(0, 6);
  });

  it("clamps out-of-range values", () => {
    expect(toGaugeAngle(-10, 0, 100, -90, 90)).toBe(-90);
    expect(toGaugeAngle(140, 0, 100, -90, 90)).toBe(90);
  });
});

describe("normalizeGaugeValue", () => {
  it("returns 0 for invalid inputs and max/min collisions", () => {
    expect(normalizeGaugeValue(Number.NaN, 0, 100)).toBe(0);
    expect(normalizeGaugeValue(30, 10, 10)).toBe(0);
  });
});
