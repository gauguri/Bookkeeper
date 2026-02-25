import { formatCurrencySafe, toNumberSafe } from "./numberSafe";

/**
 * Number, currency, percentage, and date formatters for analytics.
 */

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyDetailedFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

function toFiniteNumber(value: number | string | null | undefined): number | null {
  const parsed = toNumberSafe(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrency(value: number | string | null | undefined, detailed = false): string {
  const digits = detailed ? 2 : 0;
  return formatCurrencySafe(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    fallback: detailed ? "$0.00" : "$0",
  });
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return compactFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  const numeric = toFiniteNumber(value);
  if (numeric == null) return "0%";
  return `${numeric.toFixed(decimals)}%`;
}

export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "0.00";
  return value.toFixed(decimals);
}

export function formatDays(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return `${value.toFixed(decimals)}d`;
}

export function formatMonths(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return `${value.toFixed(decimals)} mo`;
}

export function formatKpiValue(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "ratio":
      return formatRatio(value);
    case "days":
      return formatDays(value);
    case "months":
      return formatMonths(value);
    default:
      return toFiniteNumber(value)?.toFixed(1) ?? "0.0";
  }
}

export function formatChange(value: number, unit: string): string {
  const numeric = toFiniteNumber(value) ?? 0;
  const sign = numeric > 0 ? "+" : "";
  if (unit === "currency") return `${sign}${formatCurrency(numeric)}`;
  if (unit === "percent") return `${sign}${numeric.toFixed(1)}%`;
  return `${sign}${numeric.toFixed(1)}`;
}
