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
  const pnl = data
    ? {
        ...data,
        reconciliation: {
          gl_revenue: data.reconciliation?.gl_revenue ?? 0,
          operational_revenue: data.reconciliation?.operational_revenue ?? 0,
          difference: data.reconciliation?.difference ?? 0,
          within_threshold: data.reconciliation?.within_threshold ?? true,
          show_banner: data.reconciliation?.show_banner ?? false,
          tolerance: data.reconciliation?.tolerance ?? 1,
          why: data.reconciliation?.why ?? [],
        },
        debug: {
          invoices_finalized: data.debug?.invoices_finalized ?? 0,
          invoices_posted_to_gl: data.debug?.invoices_posted_to_gl ?? 0,
          gl_entries_count_for_revenue: data.debug?.gl_entries_count_for_revenue ?? 0,
          gl_date_field: data.debug?.gl_date_field ?? "posting_date",
        },
        waterfall: data.waterfall ?? [],
      }
    : null;
  const revenueMismatch = pnl?.reconciliation.show_banner ?? false;
  const [showWhy, setShowWhy] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Profit & Loss</h1>
        <div className="app-card h-80 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !pnl) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">No financial data yet.</p>
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
        <p>Revenue data source: <span className="font-semibold">{pnl.revenue_data_source}</span></p>
        {revenueMismatch && (
          <div className="mt-2 text-amber-600">
            <p className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Revenue mismatch: GL {formatCurrency(pnl.reconciliation.gl_revenue)} vs Invoices {formatCurrency(pnl.reconciliation.operational_revenue)}
              <button className="underline" onClick={() => setShowWhy((v) => !v)}>Why?</button>
            </p>
            {showWhy && (
              <ul className="ml-5 mt-1 list-disc">
                {pnl.reconciliation.why.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {import.meta.env.DEV && (
          <div className="mt-2 text-xs">
            <p>Debug: invoices_finalized={pnl.debug.invoices_finalized}, invoices_posted_to_gl={pnl.debug.invoices_posted_to_gl}, gl_entries_count_for_revenue={pnl.debug.gl_entries_count_for_revenue}</p>
            <p>GL date field: {pnl.debug.gl_date_field}</p>
          </div>
        )}
      </div>

      {/* Margin Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Gross Margin</p>
          <p className={`mt-2 text-3xl font-bold ${pnl.gross_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(pnl.gross_margin)}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Operating Margin</p>
          <p className={`mt-2 text-3xl font-bold ${pnl.operating_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(pnl.operating_margin)}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Net Margin</p>
          <p className={`mt-2 text-3xl font-bold ${pnl.net_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatPercent(pnl.net_margin)}
          </p>
        </div>
      </div>

      {/* Waterfall */}
      <WaterfallChart data={pnl.waterfall} title="P&L Waterfall" height={320} />

      {/* Financial Statement */}
      <FinancialStatement
        title="Income Statement"
        sections={[
          {
            title: "Revenue",
            items: [
              { label: "Total Revenue", value: pnl.revenue, bold: true },
            ],
            total: pnl.revenue,
          },
          {
            title: "Cost of Goods Sold",
            items: [
              { label: "Cost of Goods Sold", value: -pnl.cogs },
            ],
          },
          {
            title: "Gross Profit",
            items: [
              { label: "Gross Profit", value: pnl.gross_profit, isSubtotal: true },
              { label: "Gross Margin", value: pnl.gross_margin, indent: 1 },
            ],
          },
          {
            title: "Operating Expenses",
            items: [
              { label: "Total Operating Expenses", value: -pnl.operating_expenses },
            ],
          },
          {
            title: "Net Income",
            items: [
              { label: "Operating Income", value: pnl.operating_income, isSubtotal: true },
              { label: "Net Income", value: pnl.net_income, isTotal: true, bold: true },
            ],
            total: pnl.net_income,
          },
        ]}
      />
    </div>
  );
}
