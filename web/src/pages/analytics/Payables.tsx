import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePayables } from "../../hooks/useAnalytics";
import AgingChart from "../../components/analytics/AgingChart";
import AnalyticsTable from "../../components/analytics/AnalyticsTable";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCurrency } from "../../utils/formatters";

export default function Payables() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = usePayables(period);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Accounts Payable</h1>
        <div className="app-card h-64 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load payables data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Accounts Payable</h1>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* AP Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total A/P Outstanding</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(data.aging.total)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Overdue (90+ days)</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {formatCurrency(data.aging.buckets["90_plus"] || 0)}
          </p>
        </div>
      </div>

      {/* Aging Chart */}
      <AgingChart data={data.aging} title="A/P Aging Breakdown" />

      {/* Top Vendors */}
      <AnalyticsTable
        title="Top Vendors by Spend"
        columns={[
          { key: "vendor_name", label: "Vendor", align: "left" },
          {
            key: "total_spend",
            label: "Total Spend",
            align: "right",
            format: (v: number) => formatCurrency(v, true),
          },
        ]}
        data={data.top_vendors}
      />
    </div>
  );
}
