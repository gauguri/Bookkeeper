import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import type { ItemMovement } from "../../hooks/useItems";

type Props = { movements: ItemMovement[]; maxItems?: number };

const REASON_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  SHIPMENT: { label: "Shipped", icon: ArrowUp, color: "text-red-500 bg-red-50 dark:bg-red-900/20" },
  RECEIPT: { label: "Received", icon: ArrowDown, color: "text-green-500 bg-green-50 dark:bg-green-900/20" },
  ADJUSTMENT: { label: "Adjusted", icon: RotateCcw, color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20" },
  PO_LANDED: { label: "PO Landed", icon: ArrowDown, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
};

function getConfig(reason: string) {
  return REASON_CONFIG[reason] ?? { label: reason, icon: RotateCcw, color: "text-gray-500 bg-gray-50 dark:bg-gray-800" };
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ItemMovementTimeline({ movements, maxItems = 10 }: Props) {
  const items = movements.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <div className="app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Recent Movements</h3>
        <p className="text-sm text-muted py-4 text-center">No inventory movements recorded.</p>
      </div>
    );
  }

  return (
    <div className="app-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Recent Movements</h3>
      <div className="space-y-0.5">
        {items.map((m) => {
          const cfg = getConfig(m.reason);
          const Icon = cfg.icon;
          const isPositive = m.qty_delta > 0;
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition">
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{cfg.label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${isPositive ? "text-green-600" : "text-red-600"}`}>
                    {isPositive ? "+" : ""}{m.qty_delta}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted truncate">
                    {m.ref_type && `${m.ref_type} #${m.ref_id}`}
                  </span>
                  <span className="text-xs text-muted flex-shrink-0">{timeAgo(m.date)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
