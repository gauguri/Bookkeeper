/**
 * Threshold-based color functions and chart palettes.
 */

// Finance-oriented palette
export const CHART_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#10b981", // emerald
  "#ef4444", // red
  "#06b6d4", // cyan
];

export const COLOR = {
  primary: "#1e3a5f",
  positive: "#16a34a",
  negative: "#dc2626",
  warning: "#f59e0b",
  neutral: "#6b7280",
  info: "#3b82f6",
} as const;

export const AGING_COLORS = {
  current: "#16a34a",
  "1_30": "#84cc16",
  "31_60": "#f59e0b",
  "61_90": "#f97316",
  "90_plus": "#dc2626",
} as const;

export function getStatusColor(status: string): string {
  switch (status) {
    case "good":
      return COLOR.positive;
    case "warning":
      return COLOR.warning;
    case "critical":
      return COLOR.negative;
    default:
      return COLOR.neutral;
  }
}

export function getDirectionColor(direction: string, inverted = false): string {
  if (direction === "up") return inverted ? COLOR.negative : COLOR.positive;
  if (direction === "down") return inverted ? COLOR.positive : COLOR.negative;
  return COLOR.neutral;
}

export function getDirectionColorClass(direction: string, inverted = false): string {
  if (direction === "up") return inverted ? "text-red-600" : "text-green-600";
  if (direction === "down") return inverted ? "text-green-600" : "text-red-600";
  return "text-gray-500";
}

export function getStatusBorderClass(status: string): string {
  switch (status) {
    case "good":
      return "border-green-500";
    case "warning":
      return "border-amber-500";
    case "critical":
      return "border-red-500";
    default:
      return "border-gray-200 dark:border-gray-700";
  }
}

export function getStatusBgClass(status: string): string {
  switch (status) {
    case "good":
      return "bg-green-50 dark:bg-green-900/20";
    case "warning":
      return "bg-amber-50 dark:bg-amber-900/20";
    case "critical":
      return "bg-red-50 dark:bg-red-900/20";
    default:
      return "bg-gray-50 dark:bg-gray-800/50";
  }
}
