import type { CustomerAgingBuckets } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/formatters";

const BUCKETS: { key: keyof CustomerAgingBuckets; label: string; color: string }[] = [
  { key: "current",      label: "Current",  color: "#16a34a" },
  { key: "days_1_30",    label: "1-30d",    color: "#84cc16" },
  { key: "days_31_60",   label: "31-60d",   color: "#f59e0b" },
  { key: "days_61_90",   label: "61-90d",   color: "#f97316" },
  { key: "days_90_plus", label: "90+d",     color: "#dc2626" },
];

type Props = { aging: CustomerAgingBuckets };

export default function CustomerAgingBar({ aging }: Props) {
  const total = BUCKETS.reduce((sum, b) => sum + (aging[b.key] ?? 0), 0);

  return (
    <div className="app-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">A/R Aging</h3>
        <span className="text-sm font-bold">{formatCurrency(total)}</span>
      </div>

      {/* Stacked bar */}
      {total > 0 ? (
        <div className="flex h-6 w-full overflow-hidden rounded-full">
          {BUCKETS.map((b) => {
            const val = aging[b.key] ?? 0;
            const pct = (val / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={b.key}
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: b.color }}
                title={`${b.label}: ${formatCurrency(val)}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex h-6 w-full items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
          <span className="text-xs font-medium text-green-700 dark:text-green-400">No outstanding balance</span>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {BUCKETS.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5 text-xs">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="text-muted">{b.label}</span>
            <span className="font-medium">{formatCurrency(aging[b.key] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
