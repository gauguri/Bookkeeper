import { describe, expect, it } from "vitest";

import { formatCurrencySafe, formatNumberSafe, sumBySafe, toNumberSafe } from "../numberSafe";

describe("toNumberSafe", () => {
  it("handles nullish and empty values", () => {
    expect(toNumberSafe(null)).toBe(0);
    expect(toNumberSafe(undefined)).toBe(0);
    expect(toNumberSafe("")).toBe(0);
  });

  it("parses numeric strings", () => {
    expect(toNumberSafe("100.50")).toBe(100.5);
  });

  it("uses fallback for NaN and Infinity", () => {
    expect(toNumberSafe(Number.NaN, 7)).toBe(7);
    expect(toNumberSafe(Number.POSITIVE_INFINITY, 7)).toBe(7);
  });
});

describe("sumBySafe", () => {
  it("sums mixed values without NaN", () => {
    const total = sumBySafe([{ value: "10" }, { value: null }, { value: Number.NaN }, { value: 2.5 }], (x) => x.value);
    expect(total).toBe(12.5);
  });
});

describe("formatCurrencySafe", () => {
  it("formats valid values and keeps invalid as $0.00 by default", () => {
    expect(formatCurrencySafe("100.50")).toBe("$100.50");
    expect(formatCurrencySafe(undefined)).toBe("$0.00");
    expect(formatCurrencySafe(Number.NaN)).toBe("$0.00");
    expect(formatCurrencySafe(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });

  it("supports dash fallback for invalid values", () => {
    expect(formatCurrencySafe(null, { useDashForInvalid: true })).toBe("—");
  });
});

describe("formatNumberSafe", () => {
  it("never returns NaN text", () => {
    expect(formatNumberSafe("100.50")).toBe("100.5");
    expect(formatNumberSafe(undefined)).toBe("0");
    expect(formatNumberSafe(Number.NaN, "n/a")).toBe("n/a");
    expect(formatNumberSafe(Number.POSITIVE_INFINITY, "n/a")).toBe("n/a");
  });
});
