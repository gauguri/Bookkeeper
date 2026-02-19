export const currency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const formatNumber = (value: unknown, digits = 1): string => {
  const normalized = toNumber(value);
  if (normalized == null) {
    return "—";
  }

  return normalized.toFixed(digits);
};
