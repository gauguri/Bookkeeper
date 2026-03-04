export const clampGaugeValue = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

export const calculateNeedleAngle = (
  value: number,
  min: number,
  max: number,
  startAngle: number,
  endAngle: number,
): number => {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return startAngle;
  }

  if (max === min) {
    return startAngle;
  }

  const clamped = clampGaugeValue(value, min, max);
  const normalized = (clamped - min) / (max - min);

  return startAngle + normalized * (endAngle - startAngle);
};
