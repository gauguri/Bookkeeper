import { Package } from "lucide-react";
import type { ItemKpis } from "../../hooks/useItems";
import { formatCurrency } from "../../utils/formatters";
import StockStatusBadge from "./StockStatusBadge";

type Props = { kpis: ItemKpis };

export default function InventoryGauge({ kpis }: Props) {
  const total = Number(kpis.on_hand_qty);
  const reserved = Number(kpis.reserved_qty);
  const available = Number(kpis.available_qty);
  const reservedPct = total > 0 ? Math.min((reserved / total) * 100, 100) : 0;
  const availablePct = total > 0 ? Math.min((available / total) * 100, 100) : 0;

  return (
    <div className="app-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Inventory Status</h3>
        <StockStatusBadge status={kpis.stock_status} size="md" />
      </div>

      {/* Stacked bar */}
      <div className="mb-4">
        <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${availablePct}%` }}
            title={`Available: ${available}`}
          />
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${reservedPct}%` }}
            title={`Reserved: ${reserved}`}
          />
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Available: {available.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Reserved: {reserved.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
          <p className="text-xs text-muted">On Hand</p>
          <p className="text-lg font-bold">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
          <p className="text-xs text-muted">Inventory Value</p>
          <p className="text-lg font-bold">{formatCurrency(Number(kpis.inventory_value))}</p>
        </div>
      </div>
    </div>
  );
}
