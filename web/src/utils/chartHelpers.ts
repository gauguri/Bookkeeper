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

const RANK_COLOR_STEPS = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"] as const;

export function getRankColor(index: number, total: number): string {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(index, 0), safeTotal - 1);
  if (safeTotal === 1) return RANK_COLOR_STEPS[0];
  const scalePosition = safeIndex / (safeTotal - 1);
  const stepIndex = Math.round(scalePosition * (RANK_COLOR_STEPS.length - 1));
  return RANK_COLOR_STEPS[Math.min(stepIndex, RANK_COLOR_STEPS.length - 1)];
}

export const AXIS_STYLE = {
  fontSize: 11,
  fill: PL_PALETTE.neutralAxis,
  tickLine: false,
};
