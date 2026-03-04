import type { MouseEvent } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { formatCompact, formatCurrency } from "../../utils/formatters";

type Metric = "value" | "quantity";
type Limit = 5 | 10 | 25 | "all";
type Density = "compact" | "comfortable";

type Totals = {
  total_inventory_value?: number | null;
  total_on_hand_qty?: number | null;
  total_available_qty?: number | null;
  total_reserved_qty?: number | null;
};

export type OverviewItem = {
  item_id: number;
  item_name: string;
  sku?: string | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  landed_unit_cost?: number | null;
  available_value: number;
  reserved_value: number;
  total_value: number;
};

type Props = {
  className?: string;
  totals: Totals | null;
  items: OverviewItem[];
  metric: Metric;
  limit: Limit;
  loading: boolean;
  missingLandedCostCount: number;
  onMetricChange: (metric: Metric) => void;
  onLimitChange: (limit: Limit) => void;
  density: Density;
  showZeroQty: boolean;
  onDensityChange: (density: Density) => void;
  onShowZeroQtyChange: (showZeroQty: boolean) => void;
  onViewAll: () => void;
  onItemClick: (itemId: number) => void;
  onSegmentClick: (itemId: number, segment: "available" | "reserved", event: MouseEvent<HTMLButtonElement>) => void;
  onSetLandedCosts: () => void;
  onReceiveInventory: () => void;
};

const RESERVED_COLOR = "#f59e0b";
const AVAILABLE_COLOR = "#16a34a";

const safeNumber = (value: number | null | undefined) => (Number.isFinite(value) ? Number(value) : 0);

export default function InventoryOverviewCard({
  className,
  totals,
  items,
  metric,
  limit,
  loading,
  missingLandedCostCount,
  onMetricChange,
  onLimitChange,
  density,
  showZeroQty,
  onDensityChange,
  onShowZeroQtyChange,
  onViewAll,
  onItemClick,
  onSegmentClick,
  onSetLandedCosts,
  onReceiveInventory,
}: Props) {
  const densityClasses = density === "compact"
    ? {
      row: "py-1.5",
      text: "text-xs",
      barHeight: "h-2",
      itemLabel: "text-xs",
    }
    : {
      row: "py-2.5",
      text: "text-sm",
      barHeight: "h-2.5",
      itemLabel: "text-sm",
    };

  const filteredItems = showZeroQty ? items : items.filter((item) => safeNumber(item.on_hand_qty) > 0);
  const sorted = [...filteredItems].sort((a, b) => (metric === "value" ? b.total_value - a.total_value : b.on_hand_qty - a.on_hand_qty));
  const limited = limit === "all" ? sorted : sorted.slice(0, limit);
  const shouldShowEmptyState = filteredItems.length === 0 && safeNumber(totals?.total_on_hand_qty) === 0;

  const kpis = [
    { label: "Total Inventory Value", value: formatCurrency(safeNumber(totals?.total_inventory_value)), missing: totals?.total_inventory_value == null },
    { label: "Total Units On Hand", value: formatCompact(safeNumber(totals?.total_on_hand_qty)), missing: totals?.total_on_hand_qty == null },
    { label: "Total Units Available", value: formatCompact(safeNumber(totals?.total_available_qty)), missing: totals?.total_available_qty == null },
    { label: "Total Units Reserved", value: formatCompact(safeNumber(totals?.total_reserved_qty)), missing: totals?.total_reserved_qty == null },
  ];

  return (
    <div className={`app-card flex h-full flex-col p-3 ${className ?? ""}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Inventory Overview</p>
          <p className="text-xs text-muted">Totals + item composition (qty/value) at a glance.</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {kpis.map((kpi, index) => (
              <div key={kpi.label} className="inline-flex items-center gap-1">
                <span className="text-muted">{kpi.label.replace("Total Units ", "").replace("Total ", "")}</span>
                <span className="font-semibold tabular-nums text-foreground">{kpi.value}</span>
                {kpi.missing && <span title="Data missing: value defaulted to 0"><Info className="h-3.5 w-3.5 text-muted" /></span>}
                {index < kpis.length - 1 && <span className="text-muted">|</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-border p-1 text-xs">
            <button className={`rounded-lg px-2 py-1 ${metric === "value" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("value")}>Value</button>
            <button className={`rounded-lg px-2 py-1 ${metric === "quantity" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("quantity")}>Quantity</button>
          </div>
          <select className="app-select h-8 text-xs" value={limit} onChange={(event) => onLimitChange(event.target.value === "all" ? "all" : Number(event.target.value) as 5 | 10 | 25)}>
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value="all">All</option>
          </select>
          <select className="app-select h-8 text-xs" value={density} onChange={(event) => onDensityChange(event.target.value as Density)}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
          <label className="inline-flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={showZeroQty} onChange={(event) => onShowZeroQtyChange(event.target.checked)} />
            Show zero-qty items
          </label>
          <button className="text-xs text-primary hover:underline" onClick={onViewAll}>View all</button>
        </div>
      </div>

      {loading ? (
        <div className="h-44 animate-pulse rounded-xl bg-secondary" />
      ) : shouldShowEmptyState ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-lg font-semibold">No inventory yet</p>
          <p className="mt-1 text-sm text-muted">Start with a receipt to populate inventory overview metrics.</p>
          <button className="app-button mt-4" onClick={onReceiveInventory}>Receive Inventory</button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {missingLandedCostCount > 0 && (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Some items are missing landed costs. Value metrics may be incomplete.</span>
              <button className="text-primary hover:underline" onClick={onSetLandedCosts}>Set Landed Costs</button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[minmax(220px,1.8fr)_0.7fr_0.7fr_1fr_190px] gap-2 border-b border-border bg-secondary/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <p>Item</p>
              <p className="text-right">Avail</p>
              <p className="text-right">Reserved</p>
              <p className="text-right">Value</p>
              <p>Composition</p>
            </div>

            {limited.map((item) => {
            const availMetric = metric === "value" ? safeNumber(item.available_value) : safeNumber(item.available_qty);
            const reservedMetric = metric === "value" ? safeNumber(item.reserved_value) : safeNumber(item.reserved_qty);
            const rowMetric = metric === "value" ? safeNumber(item.total_value) : safeNumber(item.on_hand_qty);
            const availablePct = rowMetric > 0 ? (availMetric / rowMetric) * 100 : 0;
            const reservedPct = rowMetric > 0 ? (reservedMetric / rowMetric) * 100 : 0;

            return (
              <div key={item.item_id} className={`grid cursor-pointer grid-cols-[minmax(220px,1.8fr)_0.7fr_0.7fr_1fr_190px] items-center gap-2 border-t border-border px-3 ${densityClasses.row} hover:bg-secondary/40`} onClick={() => onItemClick(item.item_id)}>
                <button className="text-left" onClick={() => onItemClick(item.item_id)}>
                  <p className={`${densityClasses.itemLabel} font-semibold leading-tight`}>{item.item_name}</p>
                  <p className="text-[11px] text-muted">{item.sku ?? "No SKU"}</p>
                </button>
                <p className={`${densityClasses.text} text-right tabular-nums`}>{formatCompact(safeNumber(item.available_qty))}</p>
                <button className={`${densityClasses.text} text-right tabular-nums text-primary hover:underline`} onClick={(event) => { event.stopPropagation(); onSegmentClick(item.item_id, "reserved", event); }}>
                  {formatCompact(safeNumber(item.reserved_qty))}
                </button>
                <p className={`${densityClasses.text} text-right tabular-nums font-medium`}>{formatCurrency(safeNumber(item.total_value))}</p>
                <div className="flex items-center">
                  <div
                    className={`flex w-[170px] overflow-hidden rounded ${densityClasses.barHeight} bg-secondary`}
                    title={`${item.item_name}${item.sku ? ` (${item.sku})` : ""}\nOn hand: ${formatCompact(safeNumber(item.on_hand_qty))}\nReserved: ${formatCompact(safeNumber(item.reserved_qty))}\nAvailable: ${formatCompact(safeNumber(item.available_qty))}\nLanded unit cost: ${formatCurrency(safeNumber(item.landed_unit_cost))}\nAvailable value: ${formatCurrency(safeNumber(item.available_value))}\nReserved value: ${formatCurrency(safeNumber(item.reserved_value))}\nTotal value: ${formatCurrency(safeNumber(item.total_value))}`}
                  >
                    <button className="h-full" style={{ width: `${availablePct}%`, backgroundColor: AVAILABLE_COLOR }} onClick={(event) => { event.stopPropagation(); onSegmentClick(item.item_id, "available", event); }} aria-label={`Available segment for ${item.item_name}`} />
                    <button className="h-full" style={{ width: `${reservedPct}%`, backgroundColor: RESERVED_COLOR }} onClick={(event) => { event.stopPropagation(); onSegmentClick(item.item_id, "reserved", event); }} aria-label={`Reserved segment for ${item.item_name}`} />
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AVAILABLE_COLOR }} />Available</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESERVED_COLOR }} />Reserved</span>
          </div>
        </div>
      )}
    </div>
  );
}
