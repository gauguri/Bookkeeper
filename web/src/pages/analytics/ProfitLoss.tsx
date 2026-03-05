import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePnl } from "../../hooks/useAnalytics";
import WaterfallChart from "../../components/analytics/WaterfallChart";
import FinancialStatement from "../../components/analytics/FinancialStatement";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import { formatCurrency, formatPercent } from "../../utils/formatters";

export default function ProfitLoss() {
  const [period, setPeriod] = useState("ytd");
  const { data, isLoading, error } = usePnl(period);
  const revenueMismatch = data ? data.reconciliation.show_banner : false;
  const [showWhy, setShowWhy] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Profit & Loss</h1>
        <div className="app-card h-80 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load P&L data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Profit & Loss</h1>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      <div className="app-card p-4 text-xs text-muted">
        <p>Revenue data source: <span className="font-semibold">{data.revenue_data_source}</span></p>
        {revenueMismatch && (
          <div className="mt-2 text-amber-600">
            <p className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Revenue mismatch: GL {formatCurrency(data.reconciliation.gl_revenue)} vs Invoices {formatCurrency(data.reconciliation.operational_revenue)}
              <button className="underline" onClick={() => setShowWhy((v) => !v)}>Why?</button>
            </p>
            {showWhy && (
              <ul className="ml-5 mt-1 list-disc">
                {data.reconciliation.why.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {import.meta.env.DEV && (
          <div className="mt-2 text-xs">
            <p>Debug: invoices_finalized={data.debug.invoices_finalized}, invoices_posted_to_gl={data.debug.invoices_posted_to_gl}, gl_entries_count_for_revenue={data.debug.gl_entries_count_for_revenue}</p>
            <p>GL date field: {data.debug.gl_date_field}</p>
          </div>
        )}
      </div>

      {/* Margin Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Gross Margin</p>
          <p className={`mt-2 text-3xl font-bold ${data.gross_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(data.gross_margin)}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Operating Margin</p>
          <p className={`mt-2 text-3xl font-bold ${data.operating_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(data.operating_margin)}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Net Margin</p>
          <p className={`mt-2 text-3xl font-bold ${data.net_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(data.net_margin)}
          </p>
        </div>
      </div>

      {/* Waterfall */}
      <WaterfallChart data={data.waterfall} title="P&L Waterfall" height={320} />

      {/* Financial Statement */}
      <FinancialStatement
        title="Income Statement"
        sections={[
          {
            title: "Revenue",
            items: [
              { label: "Total Revenue", value: data.revenue, bold: true },
            ],
            total: data.revenue,
          },
          {
            title: "Cost of Goods Sold",
            items: [
              { label: "Cost of Goods Sold", value: -data.cogs },
            ],
          },
          {
            title: "Gross Profit",
            items: [
              { label: "Gross Profit", value: data.gross_profit, isSubtotal: true },
              { label: "Gross Margin", value: data.gross_margin, indent: 1 },
            ],
          },
          {
            title: "Operating Expenses",
            items: [
              { label: "Total Operating Expenses", value: -data.operating_expenses },
            ],
          },
          {
            title: "Net Income",
            items: [
              { label: "Operating Income", value: data.operating_income, isSubtotal: true },
              { label: "Net Income", value: data.net_income, isTotal: true, bold: true },
            ],
            total: data.net_income,
          },
        ]}
      />
    </div>
  );
}
