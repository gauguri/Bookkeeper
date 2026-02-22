import { AlertTriangle } from "lucide-react";
import { useBalanceSheet } from "../../hooks/useAnalytics";
import FinancialStatement from "../../components/analytics/FinancialStatement";
import DistributionChart from "../../components/analytics/DistributionChart";
import { formatCurrency, formatCompact } from "../../utils/formatters";

export default function BalanceSheet() {
  const { data, isLoading, error } = useBalanceSheet();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
        <div className="app-card h-80 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load balance sheet data.</p>
      </div>
    );
  }

  const assetBreakdown = (data.sections.assets?.items || []).map((item) => ({
    category: item.label,
    value: item.value,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Balance Sheet</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Assets</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(data.total_assets)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Liabilities</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(data.total_liabilities)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Equity</p>
          <p className="mt-2 text-3xl font-bold">{formatCurrency(data.total_equity)}</p>
        </div>
      </div>

      {/* Asset Composition */}
      {assetBreakdown.length > 0 && (
        <DistributionChart
          data={assetBreakdown}
          title="Asset Composition"
          centerLabel="Total Assets"
          centerValue={formatCompact(data.total_assets)}
        />
      )}

      {/* Financial Statement */}
      <FinancialStatement
        title="Balance Sheet"
        sections={[
          {
            title: "Assets",
            items: [
              ...(data.sections.assets?.items || []).map((item) => ({
                label: item.label,
                value: item.value,
                indent: 1,
              })),
            ],
            total: data.total_assets,
          },
          {
            title: "Liabilities",
            items: (data.sections.liabilities?.items || []).map((item) => ({
              label: item.label,
              value: item.value,
              indent: 1,
            })),
            total: data.total_liabilities,
          },
          {
            title: "Equity",
            items: [
              ...(data.sections.equity?.items || []).map((item) => ({
                label: item.label,
                value: item.value,
                indent: 1,
              })),
            ],
            total: data.total_equity,
          },
          {
            title: "Verification",
            items: [
              { label: "Total Liabilities + Equity", value: data.total_liabilities + data.total_equity, isTotal: true, bold: true },
              { label: "Net Assets (Assets - Liabilities)", value: data.net_assets, isSubtotal: true },
            ],
          },
        ]}
      />
    </div>
  );
}
