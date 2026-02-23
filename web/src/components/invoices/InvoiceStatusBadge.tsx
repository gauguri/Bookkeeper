const CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "border-slate-200 bg-slate-50",
    text: "text-slate-700",
    dot: "bg-slate-500",
  },
  SENT: {
    label: "Sent",
    bg: "border-blue-200 bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  SHIPPED: {
    label: "Shipped",
    bg: "border-purple-200 bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
  PARTIALLY_PAID: {
    label: "Partial Pay",
    bg: "border-amber-200 bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  PAID: {
    label: "Paid",
    bg: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  VOID: {
    label: "Void",
    bg: "border-red-200 bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

export default function InvoiceStatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const cfg = CONFIG[status] ?? {
    label: status,
    bg: "border-slate-200 bg-slate-50",
    text: "text-slate-700",
    dot: "bg-slate-400",
  };
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${px} ${cfg.bg} ${cfg.text}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
