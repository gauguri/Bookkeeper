import { formatCurrencySafe, toNumberSafe } from "./numberSafe";

export const currency = (value: unknown) => formatCurrencySafe(value);

export const toNumber = (value: unknown): number | null => {
  const parsed = toNumberSafe(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNumber = (value: unknown, digits = 1): string => {
  const normalized = toNumber(value);
  if (normalized == null) {
    return "—";
  }

  return normalized.toFixed(digits);
};
