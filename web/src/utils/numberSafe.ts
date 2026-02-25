const DEFAULT_CURRENCY_FALLBACK = "$0.00";

export type FormatCurrencySafeOptions = {
  currency?: string;
  locale?: string;
  fallback?: string;
  useDashForInvalid?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function toNumberSafe(value: unknown, fallback = 0): number {
  const safeFallback = typeof fallback === "number" ? fallback : 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : safeFallback;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return safeFallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : safeFallback;
  }

  return safeFallback;
}

export function sumBySafe<T>(arr: T[], selector: (x: T) => unknown): number {
  return arr.reduce((sum, item) => sum + toNumberSafe(selector(item), 0), 0);
}

export function formatCurrencySafe(value: unknown, opts: FormatCurrencySafeOptions = {}): string {
  const {
    currency = "USD",
    locale = "en-US",
    fallback,
    useDashForInvalid = false,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = opts;

  const fallbackText = fallback ?? (useDashForInvalid ? "—" : DEFAULT_CURRENCY_FALLBACK);
  const numeric = toNumberSafe(value, Number.NaN);

  if (!Number.isFinite(numeric)) return fallbackText;

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(numeric);

    return formatted.includes("NaN") ? fallbackText : formatted;
  } catch {
    const basic = `${currency === "USD" ? "$" : ""}${numeric.toFixed(maximumFractionDigits)}`;
    return basic.includes("NaN") ? fallbackText : basic;
  }
}

export function formatNumberSafe(value: unknown, fallback = "0"): string {
  const numeric = toNumberSafe(value, Number.NaN);
  if (!Number.isFinite(numeric)) return fallback;
  const text = String(numeric);
  return text.includes("NaN") ? fallback : text;
}
