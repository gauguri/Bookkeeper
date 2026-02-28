import { PO_KPIS, KpiItem } from "../../data/poMockData";
import { TrendingUp, TrendingDown } from "lucide-react";

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({ kpi }: { kpi: KpiItem }) {
  const isPositive = kpi.change >= 0;
  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div className="app-card flex flex-col gap-2 p-4 transition-shadow hover:shadow-lg">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{kpi.label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold">{kpi.value}</p>
        <MiniSparkline data={kpi.sparkline} color={color} />
      </div>
      <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
        {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        {isPositive ? "+" : ""}{kpi.change}%
        <span className="ml-1 text-muted">vs last month</span>
      </div>
    </div>
  );
}

export default function POKpiCards() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {PO_KPIS.map((kpi) => (
        <KpiCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  );
}
