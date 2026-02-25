/**
 * Chart configuration helpers for Recharts.
 */

import { CHART_COLORS, PL_PALETTE } from "./colorScales";

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
  stroke: PL_PALETTE.neutralGrid,
  opacity: 0.6,
};

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

const TOP_RANK_COLOR = "#2563EB";
const RANK_NEUTRAL_STEPS = ["#9ca3af", "#cbd5e1", "#e5e7eb"] as const;

export function getRankColor(index: number, total: number): string {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(index, 0), safeTotal - 1);
  if (safeIndex === 0) return TOP_RANK_COLOR;
  return RANK_NEUTRAL_STEPS[(safeIndex - 1) % RANK_NEUTRAL_STEPS.length];
}

export const AXIS_STYLE = {
  fontSize: 11,
  fill: PL_PALETTE.neutralAxis,
  tickLine: false,
};
