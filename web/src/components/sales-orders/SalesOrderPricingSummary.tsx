import { formatCurrency } from "../../utils/formatters";

type Props = {
  totals: { totalCost: number; totalSales: number; profit: number };
  markupPercent: string;
  onMarkupChange: (value: string) => void;
  isTerminal: boolean;
};

export default function SalesOrderPricingSummary({
  totals,
  markupPercent,
  onMarkupChange,
  isTerminal,
}: Props) {
  const marginPct =
    totals.totalSales > 0
      ? ((totals.profit / totals.totalSales) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="app-card p-6 space-y-4">
      <p className="text-sm font-semibold">Cost & Pricing Summary</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-muted">Markup %</span>
          <input
            className="app-input"
            type="number"
            min="0"
            step="1"
            value={markupPercent}
            onChange={(e) => onMarkupChange(e.target.value)}
            disabled={isTerminal}
          />
        </label>
      </div>
      <div className="space-y-2 rounded-xl border bg-surface p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Total Landed Cost</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(totals.totalCost, true)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">
            Total Sales Price (with {markupPercent}% markup)
          </span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(totals.totalSales, true)}
          </span>
        </div>
        <div className="flex justify-between text-sm border-t pt-2">
          <span className="text-muted">Profit</span>
          <span
            className={`font-semibold tabular-nums ${
              totals.profit >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatCurrency(totals.profit, true)}
            {totals.totalCost > 0 && (
              <span className="ml-1 text-xs text-muted">({marginPct}%)</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
