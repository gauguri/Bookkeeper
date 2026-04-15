import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { ItemSupplierInfo } from "../../hooks/useItems";
import { formatCurrency } from "../../utils/formatters";

type Props = { suppliers: ItemSupplierInfo[] };

export default function ItemSupplierTable({ suppliers }: Props) {
  if (suppliers.length === 0) {
    return (
      <div className="app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Suppliers</h3>
        <p className="text-sm text-muted py-4 text-center">No suppliers linked to this item.</p>
      </div>
    );
  }

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Suppliers & Landed Costs</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/80 dark:bg-gray-800/50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted">Supplier</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted">Cost</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted">Freight</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted">Tariff</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted">Landed</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted">Lead Time</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted">MOQ</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.supplier_id} className="border-b last:border-0 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/sales/suppliers/${s.supplier_id}`}
                      className="font-medium text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {s.supplier_name}
                    </Link>
                    {s.is_preferred && (
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number(s.supplier_cost), true)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatCurrency(Number(s.freight_cost), true)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatCurrency(Number(s.tariff_cost), true)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCurrency(Number(s.landed_cost), true)}</td>
                <td className="px-4 py-2.5 text-center text-muted">
                  {s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-muted">
                  {s.min_order_qty != null ? Number(s.min_order_qty).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
