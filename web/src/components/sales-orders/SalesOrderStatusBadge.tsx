const CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT: { label: "Draft", bg: "border-slate-200 bg-slate-50", text: "text-slate-700", dot: "bg-slate-500" },
  NEW: { label: "New", bg: "border-slate-200 bg-slate-50", text: "text-slate-700", dot: "bg-slate-500" },
  QUOTED: { label: "Quoted", bg: "border-amber-200 bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  CONFIRMED: { label: "Confirmed", bg: "border-blue-200 bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  ALLOCATED: { label: "Allocated", bg: "border-cyan-200 bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  INVOICED: { label: "Invoiced", bg: "border-indigo-200 bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  FULFILLED: { label: "Fulfilled", bg: "border-purple-200 bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  SHIPPED: { label: "Shipped", bg: "border-purple-200 bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  CLOSED: { label: "Closed", bg: "border-emerald-200 bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  LOST: { label: "Lost", bg: "border-red-200 bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  CANCELLED: { label: "Cancelled", bg: "border-gray-200 bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

type Props = { status: string; size?: "sm" | "md" };

export default function SalesOrderStatusBadge({ status, size = "sm" }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.DRAFT;
  const sz = size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${cfg.bg} ${cfg.text} ${sz}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
