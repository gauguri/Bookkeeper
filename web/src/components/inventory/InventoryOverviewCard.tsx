import type { MouseEvent } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { formatCompact, formatCurrency } from "../../utils/formatters";

type Metric = "value" | "quantity";
type Limit = 10 | 25 | "all";

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
  totals: Totals | null;
  items: OverviewItem[];
  metric: Metric;
  limit: Limit;
  loading: boolean;
  missingLandedCostCount: number;
  onMetricChange: (metric: Metric) => void;
  onLimitChange: (limit: Limit) => void;
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
  totals,
  items,
  metric,
  limit,
  loading,
  missingLandedCostCount,
  onMetricChange,
  onLimitChange,
  onViewAll,
  onItemClick,
  onSegmentClick,
  onSetLandedCosts,
  onReceiveInventory,
}: Props) {
  const sorted = [...items].sort((a, b) => (metric === "value" ? b.total_value - a.total_value : b.on_hand_qty - a.on_hand_qty));
  const limited = limit === "all" ? sorted : sorted.slice(0, limit);
  const hasInventory = sorted.some((item) => safeNumber(item.on_hand_qty) > 0);
  const shouldShowEmptyState = !hasInventory
    && sorted.length === 0
    && safeNumber(totals?.total_on_hand_qty) === 0
    && safeNumber(totals?.total_inventory_value) === 0;
  const maxMetricValue = Math.max(
    1,
    ...limited.map((item) => (metric === "value" ? safeNumber(item.total_value) : safeNumber(item.on_hand_qty))),
  );

  const kpis = [
    { label: "Total Inventory Value", value: formatCurrency(safeNumber(totals?.total_inventory_value)), missing: totals?.total_inventory_value == null },
    { label: "Total Units On Hand", value: formatCompact(safeNumber(totals?.total_on_hand_qty)), missing: totals?.total_on_hand_qty == null },
    { label: "Total Units Available", value: formatCompact(safeNumber(totals?.total_available_qty)), missing: totals?.total_available_qty == null },
    { label: "Total Units Reserved", value: formatCompact(safeNumber(totals?.total_reserved_qty)), missing: totals?.total_reserved_qty == null },
  ];

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Inventory Overview</p>
          <p className="text-xs text-muted">Totals + product composition (qty and value) at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-border p-1 text-xs">
            <button className={`rounded-lg px-2 py-1 ${metric === "value" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("value")}>Value</button>
            <button className={`rounded-lg px-2 py-1 ${metric === "quantity" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("quantity")}>Quantity</button>
          </div>
          <select className="app-select h-8 text-xs" value={limit} onChange={(event) => onLimitChange(event.target.value === "all" ? "all" : Number(event.target.value) as 10 | 25)}>
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value="all">All</option>
          </select>
          <button className="text-xs text-primary hover:underline" onClick={onViewAll}>View all</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted">{kpi.label}</p>
            <div className="mt-1 flex items-center gap-1">
              <p className="text-lg font-semibold tabular-nums">{kpi.value}</p>
              {kpi.missing && <span title="Data missing: value defaulted to 0"><Info className="h-3.5 w-3.5 text-muted" /></span>}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-secondary" />
      ) : shouldShowEmptyState ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-lg font-semibold">No inventory yet</p>
          <p className="mt-1 text-sm text-muted">Start with a receipt to populate inventory overview metrics.</p>
          <button className="app-button mt-4" onClick={onReceiveInventory}>Receive Inventory</button>
        </div>
      ) : (
        <div className="space-y-2">
          {missingLandedCostCount > 0 && (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Some items are missing landed costs. Value metrics may be incomplete.</span>
              <button className="text-primary hover:underline" onClick={onSetLandedCosts}>Set Landed Costs</button>
            </div>
          )}

          {limited.map((item) => {
            const availMetric = metric === "value" ? safeNumber(item.available_value) : safeNumber(item.available_qty);
            const reservedMetric = metric === "value" ? safeNumber(item.reserved_value) : safeNumber(item.reserved_qty);
            const rowMetric = metric === "value" ? safeNumber(item.total_value) : safeNumber(item.on_hand_qty);
            const barWidth = `${Math.max(4, (rowMetric / maxMetricValue) * 100)}%`;
            const availablePct = rowMetric > 0 ? (availMetric / rowMetric) * 100 : 0;
            const reservedPct = rowMetric > 0 ? (reservedMetric / rowMetric) * 100 : 0;

            return (
              <div key={item.item_id} className="grid grid-cols-[minmax(200px,260px)_1fr] items-center gap-3 rounded-xl border border-border p-2 hover:bg-secondary/60">
                <button className="text-left" onClick={() => onItemClick(item.item_id)}>
                  <p className="text-sm font-semibold leading-tight">{item.item_name}</p>
                  <p className="text-xs text-muted">{item.sku ?? "No SKU"}</p>
                  <p className="mt-1 text-xs text-muted">Avail: {formatCompact(safeNumber(item.available_qty))} | Value: {formatCurrency(safeNumber(item.total_value))}</p>
                </button>
                <div>
                  <div
                    className="flex h-7 overflow-hidden rounded-lg bg-secondary"
                    style={{ width: barWidth }}
                    title={`${item.item_name}${item.sku ? ` (${item.sku})` : ""}\nOn hand: ${formatCompact(safeNumber(item.on_hand_qty))}\nReserved: ${formatCompact(safeNumber(item.reserved_qty))}\nAvailable: ${formatCompact(safeNumber(item.available_qty))}\nLanded unit cost: ${formatCurrency(safeNumber(item.landed_unit_cost))}\nAvailable value: ${formatCurrency(safeNumber(item.available_value))}\nReserved value: ${formatCurrency(safeNumber(item.reserved_value))}\nTotal value: ${formatCurrency(safeNumber(item.total_value))}`}
                  >
                    <button className="h-full" style={{ width: `${availablePct}%`, backgroundColor: AVAILABLE_COLOR }} onClick={(event) => onSegmentClick(item.item_id, "available", event)} aria-label={`Available segment for ${item.item_name}`} />
                    <button className="h-full" style={{ width: `${reservedPct}%`, backgroundColor: RESERVED_COLOR }} onClick={(event) => onSegmentClick(item.item_id, "reserved", event)} aria-label={`Reserved segment for ${item.item_name}`} />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AVAILABLE_COLOR }} />Available</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESERVED_COLOR }} />Reserved</span>
          </div>
        </div>
      )}
    </div>
  );
}
