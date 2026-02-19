const GM_RED_THRESHOLD = 40;
const GM_GREEN_THRESHOLD = 50;

const toFiniteNumber = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value.trim().replace(/%/g, "");
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const normalizeGrossMargin = (input: unknown): number => {
  const parsed = toFiniteNumber(input);
  if (parsed == null) {
    return 0;
  }

  const normalized = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return Math.min(100, Math.max(0, normalized));
};

export const formatPercent = (value: unknown, decimals = 1): string => {
  const safeValue = toFiniteNumber(value);
  const normalized = safeValue == null ? 0 : safeValue;
  return `${normalized.toFixed(decimals)}%`;
};

export const getGmZoneColor = (percent: number): "red" | "amber" | "green" => {
  if (percent < GM_RED_THRESHOLD) {
    return "red";
  }
  if (percent < GM_GREEN_THRESHOLD) {
    return "amber";
  }
  return "green";
};

export const getGmZoneLabel = (percent: number): "Low" | "OK" | "Great" => {
  const zone = getGmZoneColor(percent);
  if (zone === "red") {
    return "Low";
  }
  if (zone === "amber") {
    return "OK";
  }
  return "Great";
};
