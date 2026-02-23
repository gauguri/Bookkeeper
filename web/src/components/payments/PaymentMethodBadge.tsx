const METHOD_CONFIG: Record<string, { bg: string; text: string }> = {
  Cash: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  Check: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  ACH: { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700" },
  Card: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  Wire: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
};

export default function PaymentMethodBadge({
  method,
}: {
  method: string | null;
}) {
  const label = method ?? "Other";
  const cfg = METHOD_CONFIG[label] ?? {
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}
    >
      {label}
    </span>
  );
}
