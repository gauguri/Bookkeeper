import { describe, expect, it } from "vitest";

import { formatNumber, toNumber } from "./format";

describe("toNumber", () => {
  it("returns finite numbers", () => {
    expect(toNumber(12.345)).toBe(12.345);
  });

  it("parses numeric strings", () => {
    expect(toNumber("12.3")).toBe(12.3);
  });

  it("returns null for invalid values", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber("N/A")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("formats null as em dash", () => {
    expect(formatNumber(null, 1)).toBe("—");
  });

  it("formats numeric strings and numbers", () => {
    expect(formatNumber("12.3", 1)).toBe("12.3");
    expect(formatNumber(12.345, 1)).toBe("12.3");
  });
});
