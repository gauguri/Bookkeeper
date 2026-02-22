type Props = {
  status: string;
  size?: "sm" | "md";
};

const CONFIG: Record<string, { label: string; color: string }> = {
  in_stock: {
    label: "In Stock",
    color: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400",
  },
  low_stock: {
    label: "Low Stock",
    color: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
  },
  out_of_stock: {
    label: "Out of Stock",
    color: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400",
  },
  overstocked: {
    label: "Overstocked",
    color: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  },
};

export default function StockStatusBadge({ status, size = "sm" }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.in_stock;
  const sizeClass = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${cfg.color} ${sizeClass}`}>
      <span className={`inline-block rounded-full ${
        status === "in_stock" ? "bg-emerald-500" :
        status === "low_stock" ? "bg-amber-500" :
        status === "out_of_stock" ? "bg-red-500" : "bg-blue-500"
      } ${size === "md" ? "h-2 w-2" : "h-1.5 w-1.5"}`} />
      {cfg.label}
    </span>
  );
}
