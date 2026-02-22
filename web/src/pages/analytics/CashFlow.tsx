import { useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { useCashFlow } from "../../hooks/useAnalytics";
import TrendChart from "../../components/analytics/TrendChart";
import MetricCard from "../../components/analytics/MetricCard";
import { formatCurrency, formatCompact } from "../../utils/formatters";
import { CHART_COLORS, COLOR } from "../../utils/colorScales";

export default function CashFlow() {
  const [periods, setPeriods] = useState(3);
  const { data, isLoading, error } = useCashFlow(periods);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Cash Flow Analysis</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
        <p className="mt-2 text-sm text-muted">Failed to load cash flow data.</p>
      </div>
    );
  }

  // Build chart data for historical + forecast
  const historicalMonths = data.historical_inflows.map((inflow, i) => ({
    period: `M-${12 - i}`,
    value: inflow - data.historical_outflows[i],
  }));

  const forecastMonths = data.forecast_periods.map((fp) => ({
    period: fp.period,
    value: fp.net_cash_flow,
  }));

  const inflowTrend = data.historical_inflows.map((v, i) => ({
    period: `M-${12 - i}`,
    value: v,
  }));

  const outflowTrend = data.historical_outflows.map((v, i) => ({
    period: `M-${12 - i}`,
    value: v,
  }));

  const burnRate = data.burn_rate_monthly;
  const trendDirection = data.trend.direction;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cash Flow Analysis</h1>
        <div className="flex gap-2">
          {[3, 6, 12].map((p) => (
            <button
              key={p}
              onClick={() => setPeriods(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                periods === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-100 text-muted dark:bg-gray-800"
              }`}
            >
              {p}mo forecast
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Expected Collections</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(data.expected_collections)}</p>
          <p className="mt-1 text-xs text-muted">From open invoices in forecast period</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Monthly Burn Rate</p>
          <p className={`mt-2 text-3xl font-bold ${burnRate > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(Math.abs(burnRate))}
          </p>
          <p className="mt-1 text-xs text-muted">{burnRate > 0 ? "Net outflow" : "Net inflow"} per month</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Cash Trend</p>
          <div className="mt-2 flex items-center gap-2">
            {trendDirection === "up" ? (
              <TrendingUp className="h-8 w-8 text-green-600" />
            ) : trendDirection === "down" ? (
              <TrendingDown className="h-8 w-8 text-red-600" />
            ) : (
              <span className="text-3xl font-bold text-gray-500">—</span>
            )}
            <span className="text-lg font-semibold capitalize">{trendDirection}</span>
          </div>
          <p className="mt-1 text-xs text-muted">R² = {data.trend.r_squared?.toFixed(2) ?? "N/A"}</p>
        </div>
      </div>

      {/* Net Cash Flow Chart */}
      <TrendChart
        data={historicalMonths}
        forecastData={forecastMonths.map((fp) => ({ ...fp, forecast: fp.value, value: 0 }))}
        title="Net Cash Flow (Historical + Forecast)"
        type="bar"
        formatValue={(v) => formatCompact(v)}
        color={CHART_COLORS[0]}
      />

      {/* Inflows vs Outflows */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart
          data={inflowTrend}
          title="Cash Inflows (12 Months)"
          type="area"
          formatValue={(v) => formatCompact(v)}
          color={COLOR.positive}
        />
        <TrendChart
          data={outflowTrend}
          title="Cash Outflows (12 Months)"
          type="area"
          formatValue={(v) => formatCompact(v)}
          color={COLOR.negative}
        />
      </div>

      {/* Forecast Table */}
      <div className="app-card overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Cash Flow Forecast</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted">Period</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Proj. Inflows</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Proj. Outflows</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Net</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {data.forecast_periods.map((fp) => (
                <tr key={fp.period} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{fp.period}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-600">
                    {formatCurrency(fp.projected_inflows)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600">
                    {formatCurrency(fp.projected_outflows)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${fp.net_cash_flow >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(fp.net_cash_flow)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${fp.cumulative >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(fp.cumulative)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
