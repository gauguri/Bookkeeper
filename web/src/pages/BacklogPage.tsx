import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import DashboardFilter from "../components/analytics/DashboardFilter";
import AnalyticsTable from "../components/analytics/AnalyticsTable";
import { useOperationalBacklog } from "../hooks/useAnalytics";
import { formatCurrency } from "../utils/formatters";

type RangeValue = "MTD" | "QTD" | "YTD" | "LAST_MONTH" | "LAST_QUARTER" | "LAST_YEAR";

const periodToRange: Record<string, RangeValue> = {
  current_month: "MTD",
  current_quarter: "QTD",
  ytd: "YTD",
  last_month: "LAST_MONTH",
  last_quarter: "LAST_QUARTER",
  last_year: "LAST_YEAR",
};

const rangeToPeriod: Record<RangeValue, string> = {
  MTD: "current_month",
  QTD: "current_quarter",
  YTD: "ytd",
  LAST_MONTH: "last_month",
  LAST_QUARTER: "last_quarter",
  LAST_YEAR: "last_year",
};

export default function BacklogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = (searchParams.get("range") || "YTD") as RangeValue;
  const filters = {
    location_id: searchParams.get("location_id") || undefined,
    customer_id: searchParams.get("customer_id") || undefined,
    sku: searchParams.get("sku") || undefined,
    product: searchParams.get("product") || undefined,
    status: searchParams.get("status") || undefined,
    include_draft: searchParams.get("include_draft") === "true",
  };

  const { data, isLoading, error, refetch, isFetching } = useOperationalBacklog(range, filters);

  const applyFilter = (key: string, value?: string | boolean) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === "" || value === false) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  };

  const kpis = data?.kpis;

  const customerRows = useMemo(
    () =>
      (data?.customer_backlog || []).map((row) => ({
        ...row,
        status_mix_display: `Open: ${row.status_mix.open ?? 0} | Partial: ${row.status_mix.partial ?? 0} | Backordered: ${row.status_mix.backordered ?? 0}`,
      })),
    [data?.customer_backlog]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Operational Backlog</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="app-card h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="app-card h-64 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load backlog data. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operational Backlog</h1>
          <p className="text-xs text-muted">Open demand vs inventory reservations with shortage risk visibility.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="app-button-secondary inline-flex items-center gap-2" onClick={() => void refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
          <DashboardFilter
            period={rangeToPeriod[range] ?? "ytd"}
            onPeriodChange={(period) => applyFilter("range", periodToRange[period] ?? "YTD")}
          />
        </div>
      </div>

      <div className="app-card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <input className="app-input" placeholder="Location / Warehouse" value={filters.location_id ?? ""} onChange={(e) => applyFilter("location_id", e.target.value)} />
          <input className="app-input" placeholder="Customer ID" value={filters.customer_id ?? ""} onChange={(e) => applyFilter("customer_id", e.target.value)} />
          <input className="app-input" placeholder="Product" value={filters.product ?? ""} onChange={(e) => applyFilter("product", e.target.value)} />
          <input className="app-input" placeholder="SKU" value={filters.sku ?? ""} onChange={(e) => applyFilter("sku", e.target.value)} />
          <select className="app-select" value={filters.status ?? ""} onChange={(e) => applyFilter("status", e.target.value)}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="PARTIAL">Partially Fulfilled</option>
            <option value="BACKORDERED">Backordered</option>
          </select>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={filters.include_draft} onChange={(e) => applyFilter("include_draft", e.target.checked)} /> Include Draft
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="app-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Total Backlog Value ($)</p>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(Number(kpis?.total_backlog_value ?? 0), true)}</p>
          <p className="text-xs text-muted">{kpis?.open_lines ?? 0} open lines</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Open Sales Requests</p>
          <p className="mt-2 text-2xl font-bold">{kpis?.open_sales_requests ?? 0}</p>
        </div>
        <Link to="/analytics/receivables?status=open" className="app-card block p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Open Invoices</p>
          <p className="mt-2 text-2xl font-bold">{kpis?.open_invoices ?? 0}</p>
        </Link>
      </div>

      <AnalyticsTable
        title="Item shortages"
        columns={[
          { key: "item", label: "Item", format: (_v, row) => <Link className="text-primary hover:underline" to={`/inventory${row.sku ? `?sku=${encodeURIComponent(row.sku)}` : ""}`}>{row.name}{row.sku ? ` (${row.sku})` : ""}</Link> },
          { key: "on_hand", label: "On Hand", align: "right" },
          { key: "reserved", label: "Reserved", align: "right" },
          { key: "available", label: "Available", align: "right" },
          { key: "backlog_qty", label: "Backlog Qty", align: "right" },
          { key: "shortage_qty", label: "Shortage Qty", align: "right" },
          { key: "next_inbound_eta", label: "Next Inbound ETA", format: (v) => (v ? new Date(v).toLocaleDateString() : "—") },
        ]}
        data={data.item_shortages}
      />

      <AnalyticsTable
        title="Customer backlog"
        columns={[
          {
            key: "customer_name",
            label: "Customer",
            format: (v, row) => <Link className="text-primary hover:underline" to={`/sales/customers/${row.customer_id}`}>{v}</Link>,
          },
          { key: "backlog_value", label: "Backlog $", align: "right", format: (v) => formatCurrency(Number(v), true) },
          { key: "oldest_request_age_days", label: "Oldest Request Age", format: (v) => `${v} days` },
          { key: "status_mix_display", label: "Status Mix" },
          {
            key: "risk_flag",
            label: "Risk Flag",
            format: (v) => <span className={v === "red" ? "text-rose-500" : v === "yellow" ? "text-amber-500" : "text-emerald-500"}>{String(v).toUpperCase()}</span>,
          },
        ]}
        data={customerRows}
      />

      {data.item_shortages.length === 0 && (
        <div className="app-card p-8 text-center text-sm text-muted">No open demand found for the selected filters.</div>
      )}
    </div>
  );
}
