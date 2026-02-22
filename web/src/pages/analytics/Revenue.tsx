import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRevenue } from "../../hooks/useAnalytics";
import KpiTile from "../../components/analytics/KpiTile";
import TrendChart from "../../components/analytics/TrendChart";
import DistributionChart from "../../components/analytics/DistributionChart";
import MetricCard from "../../components/analytics/MetricCard";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCurrency, formatCompact } from "../../utils/formatters";

export default function Revenue() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = useRevenue(period);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Revenue Analytics</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="app-card h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load revenue data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Revenue Analytics</h1>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard kpi={data.revenue_mtd} />
        <MetricCard kpi={data.revenue_ytd} />
        <KpiTile kpi={data.revenue_growth_mom} />
        <KpiTile kpi={data.revenue_growth_yoy} />
        <KpiTile kpi={data.avg_revenue_per_customer} />
        <div className="app-card flex items-center justify-center p-5">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Active Customers</p>
            <p className="mt-2 text-3xl font-bold">{data.active_customer_count}</p>
            <p className="mt-1 text-xs text-muted">with invoiced revenue</p>
          </div>
        </div>
      </div>

      {/* Revenue Trend */}
      <TrendChart
        data={data.revenue_trend}
        title="Revenue Trend (12 Months)"
        formatValue={(v) => formatCurrency(v)}
        color="#3b82f6"
      />

      {/* Revenue by Category */}
      {data.revenue_by_category.length > 0 && (
        <DistributionChart
          data={data.revenue_by_category}
          title="Revenue by Product/Category"
          centerLabel="Total"
          centerValue={formatCompact(data.revenue_by_category.reduce((s, c) => s + c.value, 0))}
        />
      )}
    </div>
  );
}
