import { useNavigate } from "react-router-dom";
import type { ItemTopCustomer } from "../../hooks/useItems";
import { formatCurrency } from "../../utils/formatters";

type Props = { customers: ItemTopCustomer[] };

export default function ItemTopCustomersTable({ customers }: Props) {
  const navigate = useNavigate();

  if (customers.length === 0) {
    return (
      <div className="app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Top Customers</h3>
        <p className="text-sm text-muted py-4 text-center">No customer data yet.</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...customers.map((c) => Number(c.revenue)), 1);

  return (
    <div className="app-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Top Customers</h3>
      <div className="space-y-2.5">
        {customers.map((cust, i) => (
          <div
            key={cust.customer_id}
            className="relative cursor-pointer rounded-lg hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition"
            onClick={() => navigate(`/sales/customers/${cust.customer_id}`)}
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 rounded bg-violet-50 dark:bg-violet-900/15 transition-all"
              style={{ width: `${(Number(cust.revenue) / maxRevenue) * 100}%` }}
            />
            <div className="relative flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                  {i + 1}
                </span>
                <span className="text-sm font-medium truncate">{cust.customer_name}</span>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-xs text-muted tabular-nums">{Number(cust.units).toFixed(0)} units</span>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(cust.revenue))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
