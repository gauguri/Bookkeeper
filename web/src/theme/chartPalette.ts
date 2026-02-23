export const PL_POSITIVE = "#3b82f6";
export const PL_NEGATIVE = "#dc2626";

export const NEUTRALS = {
  axis: "#6b7280",
  grid: "#e5e7eb",
  legend: "#475569",
  muted: "#94a3b8",
} as const;

const ENTERPRISE_CATEGORICAL = [
  PL_POSITIVE,
  "#1d4ed8",
  "#0f766e",
  "#334155",
  "#0ea5e9",
  "#64748b",
  "#0369a1",
  "#14b8a6",
] as const;

export const MONOCHROME_SERIES = [
  PL_POSITIVE,
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#1e3a8a",
  "#1e293b",
] as const;

export const SOURCE_COLOR_MAP: Record<string, string> = {
  "All sources": "#1d4ed8",
  Manual: "#64748b",
  "Purchase Orders": PL_POSITIVE,
  Payroll: "#0f766e",
  Bill: "#0369a1",
  Reimbursement: "#334155",
  Other: "#94a3b8",
};

export function getCategoricalColor(index: number): string {
  return ENTERPRISE_CATEGORICAL[index % ENTERPRISE_CATEGORICAL.length];
}

export function getSourceColor(source: string, index = 0): string {
  return SOURCE_COLOR_MAP[source] ?? getCategoricalColor(index);
}

export function getHoverColor(color: string): string {
  return `color-mix(in srgb, ${color} 84%, #0f172a)`;
}

export function getSelectedStroke(color: string): string {
  return `color-mix(in srgb, ${color} 70%, #020617)`;
}

export const CHART_PALETTE = {
  positive: PL_POSITIVE,
  negative: PL_NEGATIVE,
  categorical: ENTERPRISE_CATEGORICAL,
  monotone: MONOCHROME_SERIES,
  neutrals: NEUTRALS,
} as const;
