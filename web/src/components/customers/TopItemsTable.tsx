import type { TopItem } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/formatters";

type Props = { items: TopItem[] };

export default function TopItemsTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Top Products Purchased</h3>
        <p className="text-sm text-muted py-4 text-center">No purchase history yet.</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...items.map((i) => i.revenue), 1);

  return (
    <div className="app-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Top Products Purchased</h3>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="relative">
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 rounded bg-blue-50 dark:bg-blue-900/15 transition-all"
              style={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
            />
            <div className="relative flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                  {i + 1}
                </span>
                <span className="text-sm font-medium truncate">{item.item_name}</span>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-xs text-muted tabular-nums">{item.quantity.toFixed(0)} units</span>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(item.revenue)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
