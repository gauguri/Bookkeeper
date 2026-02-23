const STATUS_FLOW = [
  { key: "DRAFT", label: "Draft", color: "bg-slate-400" },
  { key: "SENT", label: "Sent", color: "bg-blue-500" },
  { key: "SHIPPED", label: "Shipped", color: "bg-purple-500" },
  { key: "PARTIALLY_PAID", label: "Partial", color: "bg-amber-500" },
  { key: "PAID", label: "Paid", color: "bg-emerald-500" },
  { key: "VOID", label: "Void", color: "bg-red-400" },
];

export default function InvoicePipelineBar({
  invoicesByStatus,
  totalOutstanding,
}: {
  invoicesByStatus: Record<string, number>;
  totalOutstanding: number;
}) {
  const total = STATUS_FLOW.reduce(
    (s, st) => s + (invoicesByStatus[st.key] ?? 0),
    0,
  );

  return (
    <div className="app-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Invoice Pipeline</h3>
        {totalOutstanding > 0 && (
          <span className="text-xs text-muted">
            ${totalOutstanding.toLocaleString()} outstanding
          </span>
        )}
      </div>

      {/* bar */}
      {total > 0 ? (
        <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
          {STATUS_FLOW.map((st) => {
            const count = invoicesByStatus[st.key] ?? 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <div
                key={st.key}
                className={`${st.color} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${st.label}: ${count}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-3 rounded-full bg-secondary" />
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {STATUS_FLOW.map((st) => {
          const count = invoicesByStatus[st.key] ?? 0;
          if (count === 0) return null;
          return (
            <span key={st.key} className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`inline-block h-2 w-2 rounded-full ${st.color}`} />
              {st.label}{" "}
              <span className="font-medium text-foreground">{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
