import { useMemo } from "react";
import { Link } from "react-router-dom";
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
import { computeAbcClassification, getAbcColor, type AbcClass } from "../../utils/inventoryAbc";

export type InventoryCompositionItem = {
  id: number;
  item: string;
  on_hand: number;
  landed_unit_cost?: number | null;
};

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
  missing_cost: boolean;
  cumulative_pct: number;
  abc_class: AbcClass;
  shortLabel: string;
};

const truncate = (value: string, max = 16) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

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
      <p>Class: {row.abc_class}</p>
      <p>Cum: {(row.cumulative_pct * 100).toFixed(0)}%</p>
      {row.missing_cost ? <p className="text-warning">Missing cost</p> : null}
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
  const prepared = useMemo<PreparedRow[]>(() => computeAbcClassification(items).map((row) => ({ ...row, shortLabel: truncate(row.item) })), [items]);
  const totalValue = useMemo(() => prepared.reduce((sum, row) => sum + row.extended_value, 0), [prepared]);
  const missingCostCount = useMemo(() => prepared.filter((row) => row.missing_cost).length, [prepared]);
  const chartRows = useMemo(() => prepared.slice(0, topN), [prepared, topN]);

  const summaries = useMemo(() => {
    const base = {
      A: { count: 0, value: 0 },
      B: { count: 0, value: 0 },
      C: { count: 0, value: 0 },
    };

    prepared.forEach((row) => {
      base[row.abc_class].count += 1;
      base[row.abc_class].value += row.extended_value;
    });

    return (Object.keys(base) as AbcClass[]).map((className) => ({
      label: `${className} Items`,
      className,
      count: base[className].count,
      value: base[className].value,
      pct: totalValue > 0 ? base[className].value / totalValue : 0,
    }));
  }, [prepared, totalValue]);

  if (totalValue <= 0) {
    return (
      <div className="app-card p-4">
        <p className="font-semibold">Inventory Value Composition (ABC)</p>
        <p className="text-xs text-muted">See where inventory value is concentrated. Click bars or classes to filter.</p>
        <div className="mt-3 rounded-xl border border-dashed border-border p-6">
          <p className="text-sm font-medium">No valued inventory yet. Receive inventory or set landed costs.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/purchasing/purchase-orders" className="app-button-secondary">Receive Inventory</Link>
            <Link to="/items" className="app-button-ghost">Set Landed Costs</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Inventory Value Composition (ABC)</p>
          <p className="text-xs text-muted">See where inventory value is concentrated. Click bars or classes to filter.</p>
        </div>
        <button className="text-xs font-medium text-primary underline" onClick={onClearFilters}>Clear filters</button>
      </div>

      {prepared.length < 2 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Add at least two inventory items to view an ABC/Pareto chart.</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 12, right: 28, left: 8, bottom: 24 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="shortLabel" {...AXIS_STYLE} interval={0} angle={-20} textAnchor="end" height={46} />
              <YAxis yAxisId="left" {...AXIS_STYLE} tickFormatter={(value) => formatCurrency(Number(value))} width={90} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} {...AXIS_STYLE} tickFormatter={(value) => `${value}%`} width={44} />
              <Tooltip content={<CompositionTooltip />} />
              <ReferenceLine yAxisId="right" y={80} stroke="#94a3b8" strokeDasharray="5 3" label={{ value: "80%", position: "insideTopRight", fill: "#64748b", fontSize: 10 }} />
              <ReferenceLine yAxisId="right" y={95} stroke="#94a3b8" strokeDasharray="5 3" label={{ value: "95%", position: "insideTopRight", fill: "#64748b", fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="extended_value" radius={[6, 6, 0, 0]} onClick={(entry) => entry?.id && onItemSelect(entry.id)}>
                {chartRows.map((row) => (
                  <Cell key={`abc-${row.id}`} fill={getAbcColor(row.abc_class)} className="cursor-pointer" />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey={(row: PreparedRow) => row.cumulative_pct * 100} stroke="#0f172a" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {summaries.map((summary) => {
          const isActive = activeClass === summary.className;
          return (
            <button
              key={summary.className}
              className={`rounded-xl border p-3 text-left ${isActive ? "border-primary/40 bg-primary/5" : "border-border"}`}
              onClick={() => onClassSelect(summary.className)}
            >
              <p className="text-xs uppercase tracking-wide" style={{ color: getAbcColor(summary.className) }}>{summary.label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{summary.count} items</p>
              <p className="text-xs text-muted">{formatCurrency(summary.value)} · {(summary.pct * 100).toFixed(1)}%</p>
            </button>
          );
        })}
      </div>

      {activeItemId ? <p className="mt-2 text-xs text-primary">Filtered: selected item</p> : null}
      {missingCostCount > 0 ? <p className="mt-2 text-xs text-warning">Some items have missing landed cost.</p> : null}
    </div>
  );
}
