import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  X,
  AlertTriangle,
} from "lucide-react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { apiFetch } from "../../api";
import { ListResponse, SalesAccount, SalesOpportunity, SalesOrder, SalesQuote } from "../../components/sales/types";
import { formatCompact, formatCurrency } from "../../utils/formatters";
import type { AgingData, KpiData } from "../../hooks/useAnalytics";
import SalesCommandCenterTabs from "./SalesCommandCenterTabs";
import SalesCreateAccountView from "./SalesCreateAccountView";
import SalesCreateOpportunityView from "./SalesCreateOpportunityView";
import SalesCreateQuoteView from "./SalesCreateQuoteView";
import SalesCreateOrderView from "./SalesCreateOrderView";
import AccountsView from "./AccountsView";
import OpportunitiesView from "./OpportunitiesView";
import QuotesView from "./QuotesView";
import OrdersView from "./OrdersView";
import DashboardFilter from "../../components/analytics/DashboardFilter";
import KpiTile from "../../components/analytics/KpiTile";
import TrendChart from "../../components/analytics/TrendChart";
import WaterfallChart from "../../components/analytics/WaterfallChart";
import AgingChart from "../../components/analytics/AgingChart";
import { CHART_COLORS } from "../../utils/colorScales";
import { AXIS_STYLE, CHART_MARGIN, GRID_STYLE, TOOLTIP_STYLE } from "../../utils/chartHelpers";

type Summary = {
  pipeline_value: number;
  open_opportunities: number;
  quotes_pending_approval: number;
  orders_pending_fulfillment: number;
  won_last_30d: number;
  by_stage: { stage: string; count: number; amount: number }[];
};
type TrendPoint = { period: string; value: number };
type ConversionSummary = { quotes: number; orders: number; invoices: number };
type Section = "dashboard" | "accounts" | "opportunities" | "quotes" | "orders" | "activities" | "reports";
type Row = { label: string; status: string; total: string; updated?: string | null; link: string };

const SAVED_VIEWS = ["all", "my_records", "recently_updated", "needs_approval"];
const SECTION_EMPTY_COPY: Record<Section, string> = {
  dashboard: "No dashboard metrics available yet.",
  accounts: "No accounts found. Create a new account to get started.",
  opportunities: "No opportunities found. Create one to start your pipeline.",
  quotes: "No quotes found. Create a quote to continue the flow.",
  orders: "No orders found. Create an order to begin fulfillment.",
  activities: "No activities available yet.",
  reports: "No reports are available yet.",
};

const STAGE_COLORS = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], CHART_COLORS[4], CHART_COLORS[5]];
const CONVERSION_COLORS = {
  quotes: "#3b82f6",
  orders: "#f59e0b",
  invoices: "#10b981",
} as const;

export default function SalesCommandCenterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [sortDir, setSortDir] = useState("desc");
  const [density, setDensity] = useState("comfortable");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [columns, setColumns] = useState(["name", "status", "total", "updated"]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pipelineTrend, setPipelineTrend] = useState<TrendPoint[]>([]);
  const [conversion, setConversion] = useState<ConversionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [accounts, setAccounts] = useState<ListResponse<SalesAccount>>({ items: [], total_count: 0 });
  const [opportunities, setOpportunities] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [quotes, setQuotes] = useState<ListResponse<SalesQuote>>({ items: [], total_count: 0 });
  const [orders, setOrders] = useState<ListResponse<SalesOrder>>({ items: [], total_count: 0 });

  const path = location.pathname.replace("/sales/command-center", "") || "/";
  const section = (path.split("/")[1] || "dashboard") as Section;
  const isCreate = path.endsWith("/new");
  const period = searchParams.get("period") || "ytd";

  useEffect(() => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    const tasks: Promise<unknown>[] = [
      apiFetch<Summary>("/sales/reports/summary").then(setSummary),
      apiFetch<TrendPoint[]>("/sales/reports/pipeline_trend?months=12").then(setPipelineTrend),
      apiFetch<ConversionSummary>("/sales/reports/conversion_summary").then(setConversion),
    ];
    if (section === "accounts" && !isCreate) tasks.push(apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?${query}`).then(setAccounts));
    if (section === "opportunities" && !isCreate) tasks.push(apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?${query}`).then(setOpportunities));
    if (section === "quotes" && !isCreate) tasks.push(apiFetch<ListResponse<SalesQuote>>(`/sales/quotes?${query}`).then(setQuotes));
    if (section === "orders" && !isCreate) tasks.push(apiFetch<ListResponse<SalesOrder>>(`/sales/orders?${query}`).then(setOrders));
    Promise.all(tasks)
      .catch((e: Error) => setError(e.message || "Failed to load sales data"))
      .finally(() => setLoading(false));
  }, [section, search, view, page, pageSize, isCreate, period]);

  const dataRows: Row[] =
    section === "accounts"
      ? accounts.items.map((a) => ({ label: a.name, status: a.industry || "Active", total: "—", updated: a.updated_at, link: `/sales/accounts/${a.id}` }))
      : section === "opportunities"
        ? opportunities.items.map((o) => ({ label: o.name, status: o.stage, total: formatCurrency(o.amount_estimate), updated: o.updated_at, link: `/sales/opportunities/${o.id}` }))
        : section === "quotes"
          ? quotes.items.map((q) => ({ label: q.quote_number, status: q.status, total: formatCurrency(q.total), updated: q.updated_at, link: `/sales/quotes/${q.id}` }))
          : orders.items.map((o) => ({ label: o.order_number, status: o.status, total: formatCurrency(o.total), updated: o.updated_at, link: `/sales/orders/${o.id}` }));
  const totalCount = section === "accounts" ? accounts.total_count : section === "opportunities" ? opportunities.total_count : section === "quotes" ? quotes.total_count : orders.total_count;

  const pipelineHasData = (summary?.pipeline_value || 0) > 0 || (summary?.open_opportunities || 0) > 0;
  const kpis = useMemo<KpiData[]>(
    () => [
      {
        kpi_key: "pipeline_value",
        label: "Pipeline Value",
        current_value: Number(summary?.pipeline_value || 0),
        unit: "currency",
        change_percent: 0,
        direction: "flat",
        status: "good",
        sparkline: pipelineTrend.slice(-8).map((point) => Number(point.value || 0)),
        comparison_period: "last period",
        category: "sales",
        previous_value: 0,
        change_absolute: 0,
        target_value: null,
        period,
        drill_down_url: "",
      },
      {
        kpi_key: "won_last_30d",
        label: "Won Last 30 Days",
        current_value: Number(summary?.won_last_30d || 0),
        unit: "currency",
        change_percent: 0,
        direction: "flat",
        status: "good",
        sparkline: pipelineTrend.slice(-8).map((point) => Number(point.value || 0)),
        comparison_period: "last 30d",
        category: "sales",
        previous_value: 0,
        change_absolute: 0,
        target_value: null,
        period,
        drill_down_url: "",
      },
      {
        kpi_key: "open_opportunities",
        label: "Open Opportunities",
        current_value: Number(summary?.open_opportunities || 0),
        unit: "number",
        change_percent: 0,
        direction: "flat",
        status: "good",
        sparkline: summary?.by_stage.map((stage) => stage.count) || [],
        comparison_period: "active pipeline",
        category: "sales",
        previous_value: 0,
        change_absolute: 0,
        target_value: null,
        period,
        drill_down_url: "",
      },
      {
        kpi_key: "pending_work",
        label: "Quotes / Orders Pending",
        current_value: Number((summary?.quotes_pending_approval || 0) + (summary?.orders_pending_fulfillment || 0)),
        unit: "number",
        change_percent: 0,
        direction: "flat",
        status: "warning",
        sparkline: [
          Number(summary?.quotes_pending_approval || 0),
          Number(summary?.orders_pending_fulfillment || 0),
          Number(conversion?.quotes || 0),
          Number(conversion?.orders || 0),
        ],
        comparison_period: "approval + fulfillment",
        category: "sales",
        previous_value: 0,
        change_absolute: 0,
        target_value: null,
        period,
        drill_down_url: "",
      },
    ],
    [summary, pipelineTrend, conversion],
  );

  const stageAgingData = useMemo<AgingData>(
    () => ({
      kpi_key: "stage_distribution",
      category: "sales",
      buckets: Object.fromEntries((summary?.by_stage || []).map((row) => [row.stage, Number(row.amount || 0)])),
      label: "Open Opportunities by Stage",
      total: summary?.by_stage.reduce((acc, stage) => acc + Number(stage.amount || 0), 0) || 0,
      bucket_labels: (summary?.by_stage || []).map((row) => row.stage),
      bucket_values: (summary?.by_stage || []).map((row) => Number(row.amount || 0)),
    }),
    [summary],
  );

  const pipelineWaterfall = useMemo(
    () => {
      const pipelineTotal = Number(summary?.pipeline_value || 0);
      const wonLast30d = Number(summary?.won_last_30d || 0);
      const quotesPending = Number(summary?.quotes_pending_approval || 0) * 1500;
      const ordersPending = Number(summary?.orders_pending_fulfillment || 0) * 2000;
      const openTotal = pipelineTotal - wonLast30d + quotesPending + ordersPending;

      return [
        { label: "Pipeline", value: pipelineTotal, type: "total" },
        { label: "Won 30d", value: wonLast30d, type: "decrease" },
        { label: "Quotes Pending", value: quotesPending, type: "increase" },
        { label: "Orders Pending", value: ordersPending, type: "increase" },
        { label: "Open", value: openTotal, type: "subtotal" },
      ];
    },
    [summary],
  );

  const listingContent = (
    <>
      {section !== "dashboard" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.kpi_key} className="app-card p-3">
              <p className="text-xs text-muted">{kpi.label}</p>
              <p className="mt-1 text-base font-semibold">{kpi.unit === "currency" ? formatCurrency(kpi.current_value) : kpi.current_value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      <div className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="app-input w-full pl-9" placeholder={`Search ${section}...`} value={search} onChange={(e) => setSearch(e.target.value)} disabled={! ["accounts", "opportunities", "quotes", "orders"].includes(section)} />
          </div>
          <button className={`app-button-secondary flex items-center gap-1.5 ${showFilters ? "ring-2 ring-primary/30" : ""}`} onClick={() => setShowFilters((prev) => !prev)}><SlidersHorizontal className="h-3.5 w-3.5" />Filters</button>
          <button className="app-button-ghost text-xs" onClick={() => { setSearch(""); setView("all"); setDensity("comfortable"); }}><X className="h-3 w-3" /> Clear</button>
        </div>
        {showFilters && <div className="flex flex-wrap gap-4 rounded-xl border p-3"><div><label className="text-xs font-medium text-muted">Saved View</label><select className="app-select mt-1" value={view} onChange={(e) => setView(e.target.value)}>{SAVED_VIEWS.map((savedView) => <option key={savedView} value={savedView}>{savedView.replace("_", " ")}</option>)}</select></div><div><label className="text-xs font-medium text-muted">Density</label><select className="app-select mt-1" value={density} onChange={(e) => setDensity(e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><div><label className="text-xs font-medium text-muted">Columns</label><button className="app-button-secondary mt-1" onClick={() => setColumns((prev) => prev.includes("updated") ? ["name", "status", "total"] : ["name", "status", "total", "updated"])}>Toggle Updated</button></div></div>}
      </div>

      <div className="app-card overflow-hidden">{loading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="app-skeleton h-10 rounded-lg" />)}</div> : <><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-gray-50/80 dark:bg-gray-800/50"><th className="px-4 py-3 text-left">Name / Number</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Total</th>{columns.includes("updated") && <th className="px-4 py-3 text-left"><button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => setSortDir((p) => p === "asc" ? "desc" : "asc")}>Updated <ArrowUpDown className="h-3 w-3" /> {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button></th>}<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Actions</th></tr></thead><tbody>{dataRows.map((row) => <tr key={row.link} className={`app-table-row border-t ${density === "compact" ? "h-9" : "h-12"}`}><td className="px-4 py-2 font-medium">{row.label}</td><td className="px-4 py-2">{row.status}</td><td className="px-4 py-2">{row.total}</td>{columns.includes("updated") && <td className="px-4 py-2">{row.updated ? new Date(row.updated).toLocaleDateString() : "—"}</td>}<td className="px-4 py-2 text-right"><Link to={row.link} className="text-primary underline">View</Link></td></tr>)}</tbody></table></div>{totalCount === 0 && <div className="m-4 rounded-xl border border-dashed border-[var(--bedrock-border)] p-8 text-center text-sm text-muted">{SECTION_EMPTY_COPY[section as Section]}</div>}<div className="flex items-center justify-between border-t px-4 py-3 text-sm"><p>Total: {totalCount}</p><div className="flex items-center gap-2"><button className="app-button-secondary" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button><span>Page {page + 1}</span><button className="app-button-secondary" onClick={() => setPage((p) => p + 1)}>Next</button></div></div></>}</div>
    </>
  );

  const dashboardContent = (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dashboard</h2>
          <p className="text-xs text-muted">Pipeline performance and conversion analytics</p>
        </div>
        <DashboardFilter
          period={period}
          onPeriodChange={(nextPeriod) => {
            const next = new URLSearchParams(searchParams);
            next.set("period", nextPeriod);
            setSearchParams(next);
          }}
        />
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="app-card h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="app-card h-80 animate-pulse bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </>
      ) : !pipelineHasData ? (
        <div className="app-card p-8 text-center text-sm text-muted">Create your first opportunity to unlock sales analytics.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi, idx) => (
              <KpiTile
                key={kpi.kpi_key}
                kpi={kpi as KpiData}
                onClick={() => navigate(`/sales/command-center/${idx === 0 || idx === 2 ? "opportunities" : idx === 1 ? "opportunities" : idx === 3 ? "quotes" : "dashboard"}`)}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart data={pipelineTrend} title="Pipeline Trend (12 Months)" type="line" formatValue={formatCurrency} color={CHART_COLORS[0]} />
            <WaterfallChart data={pipelineWaterfall} title="Pipeline Stage Waterfall" />
            <AgingChart data={stageAgingData} title="Open Opportunities by Stage" height={280} />
            <div className="app-card p-4">
              <h3 className="mb-4 text-sm font-semibold">Quotes vs Orders vs Invoices</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={[{ label: "Flow", quotes: conversion?.quotes || 0, orders: conversion?.orders || 0, invoices: conversion?.invoices || 0 }]} margin={CHART_MARGIN}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" {...AXIS_STYLE} />
                  <YAxis tickFormatter={formatCompact} {...AXIS_STYLE} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => value.toLocaleString()} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="quotes" stackId="conv" fill={CONVERSION_COLORS.quotes} name="Quotes" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="orders" stackId="conv" fill={CONVERSION_COLORS.orders} name="Orders" />
                  <Bar dataKey="invoices" stackId="conv" fill={CONVERSION_COLORS.invoices} name="Invoices" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Sales</p><h1 className="text-2xl font-bold">Sales Command Center</h1><p className="text-sm text-muted">End-to-end sales lifecycle from accounts to cash.</p></div>
    </header>

    {error && (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load sales analytics data. Please try again.</p>
      </div>
    )}
    <SalesCommandCenterTabs />

    {section === "accounts" && isCreate && <SalesCreateAccountView />}
    {section === "opportunities" && isCreate && <SalesCreateOpportunityView />}
    {section === "quotes" && isCreate && <SalesCreateQuoteView />}
    {section === "orders" && isCreate && <SalesCreateOrderView />}

    {!isCreate && <>
      {section === "dashboard" && dashboardContent}
      {section === "accounts" && <AccountsView onCreate={() => navigate("/sales/command-center/accounts/new")}>{listingContent}</AccountsView>}
      {section === "opportunities" && <OpportunitiesView onCreate={() => navigate("/sales/command-center/opportunities/new")}>{listingContent}</OpportunitiesView>}
      {section === "quotes" && <QuotesView onCreate={() => navigate("/sales/command-center/quotes/new")}>{listingContent}</QuotesView>}
      {section === "orders" && <OrdersView onCreate={() => navigate("/sales/command-center/orders/new")}>{listingContent}</OrdersView>}
      {(["activities", "reports"] as Section[]).includes(section as Section) && <div className="app-card rounded-xl border border-dashed p-8 text-center text-sm text-muted">{SECTION_EMPTY_COPY[section as Section]}</div>}
    </>}
  </section>;
}
