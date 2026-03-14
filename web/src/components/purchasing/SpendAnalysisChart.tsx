import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProcurementSpendTrendPoint } from "./types";

type SpendAnalysisChartProps = {
  data: ProcurementSpendTrendPoint[];
  loading?: boolean;
};

const fmt = (value: number) => `$${(value / 1000).toFixed(0)}k`;

export default function SpendAnalysisChart({ data, loading = false }: SpendAnalysisChartProps) {
  if (loading) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Spend Analysis - Actual Purchase Orders</h3>
        <div className="h-80 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  if (data.length === 0 || data.every((point) => point.actual_spend === 0)) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Spend Analysis - Actual Purchase Orders</h3>
        <div className="flex h-80 items-center justify-center rounded-xl border border-dashed text-sm text-muted">
          No live purchase-order spend has been recorded for the last 12 months.
        </div>
      </div>
    );
  }

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Spend Analysis - Actual Purchase Orders</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <Tooltip formatter={(value: number) => [value.toLocaleString(undefined, { style: "currency", currency: "USD" }), "Actual spend"]} />
          <Bar dataKey="actual_spend" name="Actual Spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
