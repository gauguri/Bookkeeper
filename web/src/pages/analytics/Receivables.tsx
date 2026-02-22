import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useReceivables } from "../../hooks/useAnalytics";
import KpiTile from "../../components/analytics/KpiTile";
import AgingChart from "../../components/analytics/AgingChart";
import AnalyticsTable from "../../components/analytics/AnalyticsTable";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCurrency } from "../../utils/formatters";

export default function Receivables() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = useReceivables(period);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Accounts Receivable</h1>
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
        <p className="mt-2 text-sm text-muted">Failed to load receivables data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Accounts Receivable</h1>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile kpi={data.ar_total} />
        <KpiTile kpi={data.dso} invertDirection />
        <KpiTile kpi={data.overdue_receivables} invertDirection />
        <KpiTile kpi={data.collection_effectiveness} />
        <KpiTile kpi={data.average_invoice_value} />
      </div>

      {/* Aging Chart */}
      <AgingChart data={data.aging} title="A/R Aging Breakdown" />

      {/* Top Customers */}
      <AnalyticsTable
        title="Top Customers by Outstanding Balance"
        columns={[
          { key: "customer_name", label: "Customer", align: "left" },
          {
            key: "outstanding",
            label: "Outstanding",
            align: "right",
            format: (v: number) => formatCurrency(v, true),
          },
        ]}
        data={data.top_customers}
      />
    </div>
  );
}
