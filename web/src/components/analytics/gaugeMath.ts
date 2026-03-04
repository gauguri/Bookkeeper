export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return min;
  }

  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.min(safeMax, Math.max(safeMin, value));
};

export const normalizeGaugeValue = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return 0;
  }

  const clamped = clamp(value, min, max);
  return (clamped - min) / (max - min);
};

export const toGaugeAngle = (
  value: number,
  min: number,
  max: number,
  startAngle: number,
  endAngle: number,
): number => {
  const normalized = normalizeGaugeValue(value, min, max);
  return startAngle + normalized * (endAngle - startAngle);
};

