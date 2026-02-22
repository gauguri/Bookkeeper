/**
 * Chart configuration helpers for Recharts.
 */

import { CHART_COLORS, COLOR } from "./colorScales";

export const CHART_MARGIN = { top: 5, right: 20, left: 10, bottom: 5 };

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "var(--color-surface, #ffffff)",
    border: "1px solid var(--color-border, #e5e7eb)",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    fontSize: "13px",
  },
};

export const GRID_STYLE = {
  strokeDasharray: "3 3",
  stroke: "#e5e7eb",
  opacity: 0.6,
};

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export const AXIS_STYLE = {
  fontSize: 11,
  fill: "#6b7280",
  tickLine: false,
};
