import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useExpenses } from "../../hooks/useAnalytics";
import KpiTile from "../../components/analytics/KpiTile";
import DistributionChart from "../../components/analytics/DistributionChart";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCompact } from "../../utils/formatters";

export default function Expenses() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = useExpenses(period);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Expense Analytics</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
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
        <p className="mt-2 text-sm text-muted">Failed to load expense data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Expense Analytics</h1>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile kpi={data.total_operating_expenses} invertDirection />
        <KpiTile kpi={data.cogs_total} invertDirection />
      </div>

      {/* Expense by Category */}
      {data.expense_by_category.length > 0 && (
        <DistributionChart
          data={data.expense_by_category}
          title="Expenses by Category"
          centerLabel="Total"
          centerValue={formatCompact(data.expense_by_category.reduce((s, c) => s + c.value, 0))}
        />
      )}
    </div>
  );
}
