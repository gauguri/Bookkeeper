import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProcurementVendorSpendPoint } from "./types";

type VendorPerformanceRadarProps = {
  vendors: ProcurementVendorSpendPoint[];
  loading?: boolean;
};

export default function VendorPerformanceRadar({ vendors, loading = false }: VendorPerformanceRadarProps) {
  if (loading) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Vendor Spend Concentration</h3>
        <div className="h-80 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Vendor Spend Concentration</h3>
        <div className="flex h-80 items-center justify-center rounded-xl border border-dashed text-sm text-muted">
          No live supplier spend is available for the current period.
        </div>
      </div>
    );
  }

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Vendor Spend Concentration</h3>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={vendors} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "hsl(var(--muted))", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`}
          />
          <YAxis
            dataKey="supplier_name"
            type="category"
            tick={{ fill: "hsl(var(--muted))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip formatter={(value: number) => [value.toLocaleString(undefined, { style: "currency", currency: "USD" }), "Spend"]} />
          <Bar dataKey="total_spend" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
