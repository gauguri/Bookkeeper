export const CATEGORY_COLORS = [
  "#2563EB", // Blue
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#EF4444", // Red
  "#14B8A6", // Teal
] as const;

export function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
