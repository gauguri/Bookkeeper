import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ProcurementCycleMetric } from "./types";

type P2PCycleTimeProps = {
  metrics: ProcurementCycleMetric[];
  loading?: boolean;
};

export default function P2PCycleTime({ metrics, loading = false }: P2PCycleTimeProps) {
  if (loading) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Procure-to-Pay Cycle Time</h3>
        <div className="h-72 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  const liveMetrics = metrics.filter((metric) => metric.sample_size > 0);
  if (liveMetrics.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Procure-to-Pay Cycle Time</h3>
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted">
          No live PO lifecycle timestamps are available yet to calculate cycle times.
        </div>
      </div>
    );
  }

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Procure-to-Pay Cycle Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={liveMetrics} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fill: "hsl(var(--muted))", fontSize: 11 }} axisLine={false} tickLine={false} unit=" d" />
          <YAxis dataKey="stage" type="category" tick={{ fill: "hsl(var(--muted))", fontSize: 12 }} axisLine={false} tickLine={false} width={130} />
          <Tooltip formatter={(value: number, _name, item) => [`${value.toFixed(1)} days`, `${item?.payload?.sample_size ?? 0} records`]} />
          <Bar dataKey="avg_days" name="Avg Days" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {liveMetrics.map((metric) => (
          <span key={metric.key}>{metric.stage}: {metric.sample_size} records</span>
        ))}
      </div>
    </div>
  );
}
