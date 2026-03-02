import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { GRID_STYLE, AXIS_STYLE, TOOLTIP_STYLE } from "../../utils/chartHelpers";
import { formatCompact, formatCurrency } from "../../utils/formatters";

type CompositionMetric = "value" | "quantity";
type SegmentType = "available" | "reserved";

export type CompositionItem = {
  item_id: number;
  item_name: string;
  sku?: string | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  landed_unit_cost: number;
  total_value: number;
  landed_unit_cost_missing?: boolean;
};

type Props = {
  items: CompositionItem[];
  metric: CompositionMetric;
  limit: 10 | 25;
  loading: boolean;
  onMetricChange: (metric: CompositionMetric) => void;
  onLimitChange: (limit: 10 | 25) => void;
  onBarClick: (itemId: number, segment: SegmentType) => void;
  onViewAll: () => void;
};

const RESERVED_COLOR = "#f59e0b";
const AVAILABLE_COLOR = "#16a34a";

const formatQty = (value: number) => formatCompact(Number.isFinite(value) ? value : 0);

export default function InventoryCompositionCard({ items, metric, limit, loading, onMetricChange, onLimitChange, onBarClick, onViewAll }: Props) {
  const data = items.map((item) => {
    const availableQty = Math.max(0, Number(item.available_qty ?? 0));
    const reservedQty = Math.max(0, Number(item.reserved_qty ?? 0));
    const cost = Math.max(0, Number(item.landed_unit_cost ?? 0));
    const labelBase = item.sku ? `${item.item_name} · ${item.sku}` : item.item_name;
    const displayLabel = labelBase.length > 28 ? `${labelBase.slice(0, 27)}…` : labelBase;

    return {
      ...item,
      label: displayLabel,
      fullLabel: labelBase,
      available_segment: metric === "value" ? availableQty * cost : availableQty,
      reserved_segment: metric === "value" ? reservedQty * cost : reservedQty,
    };
  });

  const hasInventory = data.some((item) => Number(item.on_hand_qty) > 0);

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Inventory Composition (Top Items)</p>
          <p className="text-xs text-muted">What you have, by SKU — quantity and value at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-border p-1 text-xs">
            <button className={`rounded-lg px-2 py-1 ${metric === "value" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("value")}>Value</button>
            <button className={`rounded-lg px-2 py-1 ${metric === "quantity" ? "bg-primary/10 text-primary" : "text-muted"}`} onClick={() => onMetricChange("quantity")}>Quantity</button>
          </div>
          <select className="app-select h-8 text-xs" value={limit} onChange={(event) => onLimitChange(Number(event.target.value) as 10 | 25)}>
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
          </select>
          <button className="text-xs text-primary hover:underline" onClick={onViewAll}>View all</button>
        </div>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-secondary" />
      ) : !hasInventory ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-lg font-semibold">No inventory yet</p>
          <p className="mt-1 text-sm text-muted">Start with a receipt to build your inventory composition view.</p>
          <button className="app-button mt-4" onClick={onViewAll}>Receive Inventory</button>
        </div>
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 22, left: 20, bottom: 8 }} barCategoryGap={12}>
                <CartesianGrid {...GRID_STYLE} horizontal={false} />
                <XAxis
                  type="number"
                  {...AXIS_STYLE}
                  tickFormatter={(value) => metric === "value" ? formatCurrency(Number(value)) : formatQty(Number(value))}
                />
                <YAxis type="category" dataKey="label" {...AXIS_STYLE} width={180} interval={0} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: number, key: string, entry: { payload?: (typeof data)[number] }) => {
                    const row = entry?.payload;
                    const segmentLabel = key === "reserved_segment" ? "Reserved" : "Available";
                    return [metric === "value" ? formatCurrency(value) : formatQty(value), segmentLabel, row?.fullLabel ?? ""];
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!row) return "";
                    return `${row.item_name}${row.sku ? ` (${row.sku})` : ""}`;
                  }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof data)[number] | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold">{row.item_name}{row.sku ? ` (${row.sku})` : ""}</p>
                        <p>On hand: {formatQty(Number(row.on_hand_qty))}</p>
                        <p>Reserved: {formatQty(Number(row.reserved_qty))}</p>
                        <p>Available: {formatQty(Number(row.available_qty))}</p>
                        <p>Landed unit cost: {formatCurrency(Number(row.landed_unit_cost))}</p>
                        <p>Total value: {formatCurrency(Number(row.total_value))}</p>
                        {row.landed_unit_cost_missing && (
                          <p className="mt-1 inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> Missing landed cost, defaulted to 0</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="available_segment" stackId="inv" fill={AVAILABLE_COLOR} radius={[0, 0, 0, 0]} onClick={(entry) => onBarClick(entry.item_id, "available")}>
                  {data.map((row) => <Cell key={`available-${row.item_id}`} className="cursor-pointer" fill={AVAILABLE_COLOR} />)}
                  <LabelList dataKey="fullLabel" position="insideLeft" offset={6} fill="#fff" fontSize={11} formatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)} />
                </Bar>
                <Bar dataKey="reserved_segment" stackId="inv" fill={RESERVED_COLOR} radius={[6, 6, 6, 6]} onClick={(entry) => onBarClick(entry.item_id, "reserved")}>
                  {data.map((row) => <Cell key={`reserved-${row.item_id}`} className="cursor-pointer" fill={RESERVED_COLOR} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AVAILABLE_COLOR }} />Available</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESERVED_COLOR }} />Reserved</span>
          </div>
        </>
      )}
    </div>
  );
}
