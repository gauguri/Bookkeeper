import { formatCurrency } from "../../utils/formatters";

type Props = {
  kpis?: {
    cash_balance: number;
    unreconciled_transactions: number;
    items_needing_review: number;
    reconciled_this_month: number;
    exceptions_count: number;
  };
  loading?: boolean;
};

export default function BankingKpis({ kpis, loading }: Props) {
  const items = [
    { label: "Cash balance", value: kpis ? formatCurrency(kpis.cash_balance) : "—" },
    { label: "Unreconciled transactions", value: String(kpis?.unreconciled_transactions ?? "—") },
    { label: "Items needing review", value: String(kpis?.items_needing_review ?? "—") },
    { label: "Reconciled this month", value: String(kpis?.reconciled_this_month ?? "—") },
    { label: "Exceptions", value: String(kpis?.exceptions_count ?? "—") },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <article key={item.label} className="app-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
          {loading ? <div className="app-skeleton mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-semibold">{item.value}</p>}
        </article>
      ))}
    </div>
  );
}
