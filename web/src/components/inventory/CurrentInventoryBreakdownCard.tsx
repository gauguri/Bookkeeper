import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../../utils/formatters";

type BreakdownFilter = "all" | "reserved" | "available" | "inbound";

type SummaryTotals = {
  total_on_hand_qty: number;
  total_reserved_qty: number;
  total_available_qty: number;
  total_inbound_qty: number;
  total_value: number;
};

type Props = {
  summary: SummaryTotals | null;
  activeFilter: BreakdownFilter;
  onFilterChange: (next: BreakdownFilter) => void;
  mismatch: boolean;
};

type Segment = {
  key: Exclude<BreakdownFilter, "all">;
  label: string;
  value: number;
  color: string;
};

const SEGMENT_COLORS = {
  onHand: "#2563eb",
  reserved: "#f59e0b",
  available: "#16a34a",
  inbound: "#7c3aed",
};

const formatQuantity = (value: number) => (Number.isFinite(value) ? Math.round(value).toLocaleString() : "0");

function SegmentTooltip({ active, payload, totalOnHand }: { active?: boolean; payload?: Array<{ payload: Segment }>; totalOnHand: number }) {
  if (!active || !payload?.length) return null;
  const segment = payload[0]?.payload;
  if (!segment) return null;

  const pct = totalOnHand > 0 ? (segment.value / totalOnHand) * 100 : 0;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{segment.label}</p>
      <p>Qty: {formatQuantity(segment.value)} units</p>
      <p>% of On Hand: {pct.toFixed(1)}%</p>
    </div>
  );
}

export default function CurrentInventoryBreakdownCard({ summary, activeFilter, onFilterChange, mismatch }: Props) {
  const totals = {
    onHand: Number(summary?.total_on_hand_qty ?? 0),
    reserved: Number(summary?.total_reserved_qty ?? 0),
    available: Number(summary?.total_available_qty ?? 0),
    inbound: Number(summary?.total_inbound_qty ?? 0),
    value: Number(summary?.total_value ?? 0),
  };

  const segments = useMemo<Segment[]>(() => {
    const rows: Segment[] = [
      { key: "reserved", label: "Reserved", value: totals.reserved, color: SEGMENT_COLORS.reserved },
      { key: "available", label: "Available", value: totals.available, color: SEGMENT_COLORS.available },
    ];
    if (totals.inbound > 0) rows.push({ key: "inbound", label: "Inbound", value: totals.inbound, color: SEGMENT_COLORS.inbound });
    return rows;
  }, [totals.available, totals.inbound, totals.reserved]);

  const maxValue = Math.max(...segments.map((segment) => segment.value), 0);
  const data = useMemo(
    () =>
      segments.map((segment) => ({
        ...segment,
        displayLabel: maxValue > 0 && segment.value / maxValue > 0.24 ? `${segment.label}: ${formatQuantity(segment.value)}` : "",
      })),
    [maxValue, segments],
  );

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Current Inventory Breakdown</p>
          <p className="text-xs text-muted">Click a segment to filter the inventory grid in place.</p>
        </div>
        {mismatch && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> Totals mismatch
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={12}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" hide />
                <Tooltip cursor={{ fill: "transparent" }} content={<SegmentTooltip totalOnHand={totals.onHand} />} />
                <Bar dataKey="value" radius={6} onClick={(_, index) => onFilterChange(data[index]?.key ?? "all")}>
                  <LabelList dataKey="displayLabel" position="insideLeft" offset={8} fill="#ffffff" fontSize={12} fontWeight={600} />
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} className="cursor-pointer" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            {segments.map((segment) => (
              <button key={segment.key} className="inline-flex items-center gap-2 hover:text-foreground" onClick={() => onFilterChange(segment.key)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                <span>{segment.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <button className={`rounded-xl border p-3 text-left ${activeFilter === "all" ? "border-primary/40 bg-primary/5" : "border-border"}`} onClick={() => onFilterChange("all")}>
            <p className="text-xs uppercase tracking-wide text-muted">Total On Hand</p>
            <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: SEGMENT_COLORS.onHand }}>{formatQuantity(totals.onHand)}</p>
          </button>
          <button className={`rounded-xl border p-3 text-left ${activeFilter === "reserved" ? "border-primary/40 bg-primary/5" : "border-border"}`} onClick={() => onFilterChange("reserved")}>
            <p className="text-xs uppercase tracking-wide text-muted">Total Reserved</p>
            <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: SEGMENT_COLORS.reserved }}>{formatQuantity(totals.reserved)}</p>
          </button>
          <button className={`rounded-xl border p-3 text-left ${activeFilter === "available" ? "border-primary/40 bg-primary/5" : "border-border"}`} onClick={() => onFilterChange("available")}>
            <p className="text-xs uppercase tracking-wide text-muted">Total Available</p>
            <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: SEGMENT_COLORS.available }}>{formatQuantity(totals.available)}</p>
          </button>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted">Total Inventory Value</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(Number.isFinite(totals.value) ? totals.value : 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
