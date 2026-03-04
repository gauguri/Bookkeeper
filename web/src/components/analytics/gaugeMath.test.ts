import { describe, expect, it } from "vitest";

import { calculateNeedleAngle } from "./gaugeMath";

describe("calculateNeedleAngle", () => {
  it("maps Current Ratio on a 0..4 dial", () => {
    expect(calculateNeedleAngle(0, 0, 4, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(2, 0, 4, -90, 90)).toBe(0);
    expect(calculateNeedleAngle(4, 0, 4, -90, 90)).toBe(90);
    expect(calculateNeedleAngle(1, 0, 4, -90, 90)).toBe(-45);
  });

  it("maps Quick Ratio on a 0..3 dial", () => {
    expect(calculateNeedleAngle(0, 0, 3, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(1.5, 0, 3, -90, 90)).toBe(0);
    expect(calculateNeedleAngle(3, 0, 3, -90, 90)).toBe(90);
  });

  it("maps Gross Profit Margin on a 0..100 dial", () => {
    expect(calculateNeedleAngle(0, 0, 100, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(50, 0, 100, -90, 90)).toBe(0);
    expect(calculateNeedleAngle(100, 0, 100, -90, 90)).toBe(90);
    expect(calculateNeedleAngle(49.4, 0, 100, -90, 90)).toBeCloseTo(-1.08, 2);
  });

  it("maps Net Profit Margin on a -20..50 dial", () => {
    expect(calculateNeedleAngle(-20, -20, 50, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(15, -20, 50, -90, 90)).toBe(0);
    expect(calculateNeedleAngle(50, -20, 50, -90, 90)).toBe(90);
  });

  it("clamps out-of-range values and handles invalid inputs", () => {
    expect(calculateNeedleAngle(-10, 0, 100, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(140, 0, 100, -90, 90)).toBe(90);
    expect(calculateNeedleAngle(10, 10, 10, -90, 90)).toBe(-90);
    expect(calculateNeedleAngle(Number.NaN, 0, 100, -90, 90)).toBe(-90);
  });
});
