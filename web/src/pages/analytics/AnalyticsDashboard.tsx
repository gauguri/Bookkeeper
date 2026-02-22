import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Activity, TrendingUp, Wallet, Users, Package, FileText, AlertTriangle } from "lucide-react";
import { useDashboard } from "../../hooks/useAnalytics";
import KpiTile from "../../components/analytics/KpiTile";
import TrendChart from "../../components/analytics/TrendChart";
import AgingChart from "../../components/analytics/AgingChart";
import WaterfallChart from "../../components/analytics/WaterfallChart";
import AlertPanel from "../../components/analytics/AlertPanel";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCurrency } from "../../utils/formatters";

const INVERTED_KPIS = new Set(["dso", "overdue_receivables", "total_operating_expenses", "cogs_total", "expense_growth_rate", "cash_burn_rate"]);

const QUICK_LINKS = [
  { label: "Financial Health", to: "/analytics/financial-health", icon: Activity },
  { label: "Cash Flow", to: "/analytics/cash-flow", icon: Wallet },
  { label: "Receivables", to: "/analytics/receivables", icon: Users },
  { label: "Payables", to: "/analytics/payables", icon: Package },
  { label: "Revenue", to: "/analytics/revenue", icon: TrendingUp },
  { label: "Expenses", to: "/analytics/expenses", icon: BarChart3 },
  { label: "Profit & Loss", to: "/analytics/pnl", icon: FileText },
  { label: "Balance Sheet", to: "/analytics/balance-sheet", icon: FileText },
];

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = useDashboard(period);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load analytics data. Please try again.</p>
      </div>
    );
  }

  // Select top KPIs for tiles
  const topKpiKeys = ["revenue_ytd", "net_profit_margin", "dso", "ar_total", "current_ratio", "gross_profit_margin"];
  const topKpis = topKpiKeys
    .map((key) => data.kpis.find((k) => k.kpi_key === key))
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <p className="text-xs text-muted">
            Last updated: {new Date(data.computed_at).toLocaleTimeString()}
          </p>
        </div>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topKpis.map((kpi) => (
          <KpiTile
            key={kpi!.kpi_key}
            kpi={kpi!}
            invertDirection={INVERTED_KPIS.has(kpi!.kpi_key)}
          />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart
          data={data.revenue_trend}
          title="Revenue Trend (12 Months)"
          formatValue={(v) => formatCurrency(v)}
          color="#3b82f6"
        />
        <WaterfallChart data={data.pnl_summary.waterfall} title="P&L Waterfall" />
      </div>

      {/* AR / AP Aging */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgingChart data={data.ar_aging} title="A/R Aging" />
        <AgingChart data={data.ap_aging} title="A/P Aging" />
      </div>

      {/* Anomalies */}
      {data.anomalies.length > 0 && <AlertPanel anomalies={data.anomalies} />}

      {/* Quick Navigation */}
      <div className="app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Explore Analytics</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-gray-50 hover:shadow-sm dark:hover:bg-gray-800"
            >
              <link.icon className="h-4 w-4 text-primary" />
              {link.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
