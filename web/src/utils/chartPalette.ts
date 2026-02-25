export const CATEGORY_COLORS = [
  "#2563EB", // blue
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#F97316", // orange
  "#84CC16", // lime
] as const;

export function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
