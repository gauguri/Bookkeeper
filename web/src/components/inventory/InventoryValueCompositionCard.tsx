import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_STYLE, GRID_STYLE } from "../../utils/chartHelpers";
import { formatCurrency } from "../../utils/formatters";

export type InventoryCompositionItem = {
  id: number;
  item: string;
  on_hand: number;
  total_value: number;
  landed_unit_cost?: number | null;
};

type AbcClass = "A" | "B" | "C";

type Props = {
  items: InventoryCompositionItem[];
  topN?: number;
  activeItemId?: number | null;
  activeClass?: AbcClass | null;
  onItemSelect: (itemId: number) => void;
  onClassSelect: (classification: AbcClass) => void;
  onClearFilters: () => void;
};

type PreparedRow = InventoryCompositionItem & {
  extended_value: number;
  landed_cost: number;
  missingCost: boolean;
  cumulativePct: number;
  abcClass: AbcClass;
  shortLabel: string;
};

type SummaryRow = {
  label: string;
  className: AbcClass;
  count: number;
  value: number;
  pct: number;
};

const CLASS_COLORS: Record<AbcClass, string> = {
  A: "#2563eb",
  B: "#f59e0b",
  C: "#16a34a",
};

const truncate = (value: string, max = 16) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function classify(cumulativePct: number): AbcClass {
  if (cumulativePct <= 80) return "A";
  if (cumulativePct <= 95) return "B";
  return "C";
}

function CompositionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PreparedRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{row.item}</p>
      <p>On hand: {Number(row.on_hand).toLocaleString()}</p>
      <p>Unit cost: {formatCurrency(row.landed_cost)}</p>
      <p>Value: {formatCurrency(row.extended_value)}</p>
      <p>
        Class: {row.abcClass} (cum. {row.cumulativePct.toFixed(0)}%)
      </p>
      {row.missingCost && <p className="text-warning">Missing cost</p>}
    </div>
  );
}

export default function InventoryValueCompositionCard({
  items,
  topN = 10,
  activeItemId,
  activeClass,
  onItemSelect,
  onClassSelect,
  onClearFilters,
}: Props) {
  const prepared = useMemo<PreparedRow[]>(() => {
    const rows = items
      .map((item) => {
        const onHand = Number(item.on_hand ?? 0);
        const totalValue = Number(item.total_value ?? 0);
        const rawCost = Number(item.landed_unit_cost);
        const hasCost = Number.isFinite(rawCost) && rawCost > 0;
        const landedCost = hasCost ? rawCost : 0;
        const extendedValue = Number.isFinite(totalValue) ? Math.max(0, totalValue) : Math.max(0, onHand * landedCost);
        return {
          ...item,
          on_hand: Number.isFinite(onHand) ? onHand : 0,
          landed_cost: landedCost,
          missingCost: !hasCost,
          extended_value: Number.isFinite(extendedValue) ? extendedValue : 0,
          cumulativePct: 0,
          abcClass: "C" as AbcClass,
          shortLabel: truncate(item.item),
        };
      })
      .sort((a, b) => b.extended_value - a.extended_value);

    const totalValue = rows.reduce((sum, row) => sum + row.extended_value, 0);
    let running = 0;

    return rows.map((row) => {
      running += row.extended_value;
      const cumulativePct = totalValue > 0 ? (running / totalValue) * 100 : 0;
      return {
        ...row,
        cumulativePct,
        abcClass: classify(cumulativePct),
      };
    });
  }, [items]);

  const totalValue = useMemo(() => prepared.reduce((sum, row) => sum + row.extended_value, 0), [prepared]);
  const missingCostCount = useMemo(() => prepared.filter((row) => row.missingCost).length, [prepared]);

  const chartRows = useMemo(() => prepared.slice(0, topN), [prepared, topN]);

  const summaries = useMemo<SummaryRow[]>(() => {
    const base = {
      A: { count: 0, value: 0 },
      B: { count: 0, value: 0 },
      C: { count: 0, value: 0 },
    };

    prepared.forEach((row) => {
      base[row.abcClass].count += 1;
      base[row.abcClass].value += row.extended_value;
    });

    return (["A", "B", "C"] as const).map((className) => ({
      label: `${className} Items`,
      className,
      count: base[className].count,
      value: base[className].value,
      pct: totalValue > 0 ? (base[className].value / totalValue) * 100 : 0,
    }));
  }, [prepared, totalValue]);

  if (prepared.length < 2) {
    return (
      <div className="app-card p-4">
        <p className="font-semibold">Inventory Value Composition (ABC)</p>
        <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted">Add at least two inventory items to view ABC value composition.</div>
      </div>
    );
  }

  if (totalValue <= 0) {
    return (
      <div className="app-card p-4">
        <p className="font-semibold">Inventory Value Composition (ABC)</p>
        <div className="mt-3 rounded-xl border border-dashed border-border p-6">
          <p className="text-sm font-medium">No valued inventory yet</p>
          <p className="mt-1 text-sm text-muted">Receive inventory / set landed costs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Inventory Value Composition (ABC)</p>
          <p className="text-xs text-muted">Top {Math.min(topN, chartRows.length)} items ranked by extended value with cumulative Pareto curve.</p>
        </div>
        <button className="text-xs font-medium text-primary underline" onClick={onClearFilters}>View all items</button>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 12, right: 28, left: 8, bottom: 24 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="shortLabel" {...AXIS_STYLE} interval={0} angle={-20} textAnchor="end" height={46} />
            <YAxis yAxisId="left" {...AXIS_STYLE} tickFormatter={(value) => formatCurrency(Number(value))} width={90} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...AXIS_STYLE} tickFormatter={(value) => `${value}%`} width={40} />
            <Tooltip content={<CompositionTooltip />} />
            <ReferenceLine yAxisId="right" y={80} stroke="#94a3b8" strokeDasharray="5 3" />
            <ReferenceLine yAxisId="right" y={95} stroke="#94a3b8" strokeDasharray="5 3" />
            <Bar yAxisId="left" dataKey="extended_value" radius={[6, 6, 0, 0]} onClick={(entry) => entry?.id && onItemSelect(entry.id)}>
              {chartRows.map((row) => (
                <Cell key={`abc-${row.id}`} fill={CLASS_COLORS[row.abcClass]} className="cursor-pointer" />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#0f172a" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {summaries.map((summary) => {
          const isActive = activeClass === summary.className;
          return (
            <button
              key={summary.className}
              className={`rounded-xl border p-3 text-left ${isActive ? "border-primary/40 bg-primary/5" : "border-border"}`}
              onClick={() => onClassSelect(summary.className)}
            >
              <p className="text-xs uppercase tracking-wide" style={{ color: CLASS_COLORS[summary.className] }}>{summary.label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{summary.count} items</p>
              <p className="text-xs text-muted">{formatCurrency(summary.value)} · {summary.pct.toFixed(1)}%</p>
            </button>
          );
        })}
      </div>

      {activeItemId ? <p className="mt-2 text-xs text-primary">Filtered to selected item.</p> : null}
      {missingCostCount > 0 ? <p className="mt-2 text-xs text-warning">Some items have missing landed cost.</p> : null}
    </div>
  );
}
