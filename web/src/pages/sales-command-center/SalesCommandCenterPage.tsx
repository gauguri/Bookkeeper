import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpDown, BriefcaseBusiness, Building2, ChevronDown, ChevronUp, PackageCheck, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "../../api";
import { ListResponse, SalesAccount, SalesOpportunity, SalesOrder, SalesQuote } from "../../components/sales/types";
import { formatCurrency } from "../../utils/formatters";
import SalesCommandCenterTabs from "./SalesCommandCenterTabs";
import SalesCreateAccountView from "./SalesCreateAccountView";
import SalesCreateOpportunityView from "./SalesCreateOpportunityView";
import SalesCreateQuoteView from "./SalesCreateQuoteView";
import SalesCreateOrderView from "./SalesCreateOrderView";

type Summary = { pipeline_value: number; open_opportunities: number; quotes_pending_approval: number; orders_pending_fulfillment: number; won_last_30d: number; by_stage: { stage: string; count: number; amount: number }[] };
type Section = "dashboard" | "accounts" | "opportunities" | "quotes" | "orders" | "activities" | "reports";
type Row = { label: string; status: string; total: string; updated?: string | null; link: string };

const SAVED_VIEWS = ["all", "my_records", "recently_updated", "needs_approval"];
const SECTION_EMPTY_COPY: Record<Section, string> = {
  dashboard: "No dashboard metrics available yet.", accounts: "No accounts found. Create a new account to get started.", opportunities: "No opportunities found. Create one to start your pipeline.", quotes: "No quotes found. Create a quote to continue the flow.", orders: "No orders found. Create an order to begin fulfillment.", activities: "No activities available yet.", reports: "No reports are available yet.",
};

export default function SalesCommandCenterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [sortDir, setSortDir] = useState("desc");
  const [density, setDensity] = useState("comfortable");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [columns, setColumns] = useState(["name", "status", "total", "updated"]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [accounts, setAccounts] = useState<ListResponse<SalesAccount>>({ items: [], total_count: 0 });
  const [opportunities, setOpportunities] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [quotes, setQuotes] = useState<ListResponse<SalesQuote>>({ items: [], total_count: 0 });
  const [orders, setOrders] = useState<ListResponse<SalesOrder>>({ items: [], total_count: 0 });

  const path = location.pathname.replace("/sales/command-center", "") || "/";
  const section = ((path.split("/")[1] || "dashboard") as Section);
  const isCreate = path.endsWith("/new");

  useEffect(() => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    const tasks: Promise<unknown>[] = [apiFetch<Summary>("/sales/reports/summary").then(setSummary)];
    if (section === "accounts" && !isCreate) tasks.push(apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?${query}`).then(setAccounts));
    if (section === "opportunities" && !isCreate) tasks.push(apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?${query}`).then(setOpportunities));
    if (section === "quotes" && !isCreate) tasks.push(apiFetch<ListResponse<SalesQuote>>(`/sales/quotes?${query}`).then(setQuotes));
    if (section === "orders" && !isCreate) tasks.push(apiFetch<ListResponse<SalesOrder>>(`/sales/orders?${query}`).then(setOrders));
    Promise.all(tasks).catch((e: Error) => setError(e.message || "Failed to load sales data")).finally(() => setLoading(false));
  }, [section, search, view, page, pageSize, isCreate]);

  const kpis = useMemo(() => [
    { label: "Pipeline Value", value: formatCurrency(summary?.pipeline_value || 0) },
    { label: "Open Opportunities", value: (summary?.open_opportunities || 0).toLocaleString() },
    { label: "Quotes Pending", value: (summary?.quotes_pending_approval || 0).toLocaleString() },
    { label: "Orders Pending", value: (summary?.orders_pending_fulfillment || 0).toLocaleString() },
    { label: "Won (30d)", value: formatCurrency(summary?.won_last_30d || 0) },
  ], [summary]);

  const dataRows: Row[] = section === "accounts" ? accounts.items.map((a) => ({ label: a.name, status: a.industry || "Active", total: "—", updated: a.updated_at, link: `/sales/accounts/${a.id}` })) : section === "opportunities" ? opportunities.items.map((o) => ({ label: o.name, status: o.stage, total: formatCurrency(o.amount_estimate), updated: o.updated_at, link: `/sales/opportunities/${o.id}` })) : section === "quotes" ? quotes.items.map((q) => ({ label: q.quote_number, status: q.status, total: formatCurrency(q.total), updated: q.updated_at, link: `/sales/quotes/${q.id}` })) : orders.items.map((o) => ({ label: o.order_number, status: o.status, total: formatCurrency(o.total), updated: o.updated_at, link: `/sales/orders/${o.id}` }));
  const totalCount = section === "accounts" ? accounts.total_count : section === "opportunities" ? opportunities.total_count : section === "quotes" ? quotes.total_count : orders.total_count;

  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Sales</p><h1 className="text-2xl font-bold">Sales Command Center</h1><p className="text-sm text-muted">End-to-end sales lifecycle from accounts to cash.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="app-button" onClick={() => navigate("/sales/command-center/accounts/new")}><Plus className="h-4 w-4" /> New Account</button>
        <button className="app-button-secondary" onClick={() => navigate("/sales/command-center/opportunities/new")}>New Opportunity</button>
        <button className="app-button-secondary" onClick={() => navigate("/sales/command-center/quotes/new")}>New Quote</button>
        <button className="app-button-secondary" onClick={() => navigate("/sales/command-center/orders/new")}>New Order</button>
      </div>
    </header>

    {error && <div className="app-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{error}</div>}
    <SalesCommandCenterTabs />

    {section === "accounts" && isCreate && <SalesCreateAccountView />}
    {section === "opportunities" && isCreate && <SalesCreateOpportunityView />}
    {section === "quotes" && isCreate && <SalesCreateQuoteView />}
    {section === "orders" && isCreate && <SalesCreateOrderView />}

    {!isCreate && <>
      <div className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="app-input w-full pl-9" placeholder={`Search ${section}...`} value={search} onChange={(e) => setSearch(e.target.value)} disabled={! ["accounts", "opportunities", "quotes", "orders"].includes(section)} /></div>
          <button className={`app-button-secondary flex items-center gap-1.5 ${showFilters ? "ring-2 ring-primary/30" : ""}`} onClick={() => setShowFilters((prev) => !prev)}><SlidersHorizontal className="h-3.5 w-3.5" />Filters</button>
          <button className="app-button-ghost text-xs" onClick={() => { setSearch(""); setView("all"); setDensity("comfortable"); }}><X className="h-3 w-3" /> Clear</button>
        </div>
        {showFilters && <div className="flex flex-wrap gap-4 rounded-xl border p-3"><div><label className="text-xs font-medium text-muted">Saved View</label><select className="app-select mt-1" value={view} onChange={(e) => setView(e.target.value)}>{SAVED_VIEWS.map((savedView) => <option key={savedView} value={savedView}>{savedView.replace("_", " ")}</option>)}</select></div><div><label className="text-xs font-medium text-muted">Density</label><select className="app-select mt-1" value={density} onChange={(e) => setDensity(e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><div><label className="text-xs font-medium text-muted">Columns</label><button className="app-button-secondary mt-1" onClick={() => setColumns((prev) => prev.includes("updated") ? ["name", "status", "total"] : ["name", "status", "total", "updated"])}>Toggle Updated</button></div></div>}
      </div>

      {section === "dashboard" && <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{kpis.map((kpi) => <div key={kpi.label} className="app-card p-4"><p className="text-xs text-muted">{kpi.label}</p><p className="mt-1 text-lg font-bold">{loading ? "…" : kpi.value}</p></div>)}</section>}
      {["accounts", "opportunities", "quotes", "orders"].includes(section) && <div className="app-card overflow-hidden">{loading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="app-skeleton h-10 rounded-lg" />)}</div> : <><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-gray-50/80 dark:bg-gray-800/50"><th className="px-4 py-3 text-left">Name / Number</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Total</th>{columns.includes("updated") && <th className="px-4 py-3 text-left"><button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => setSortDir((p) => p === "asc" ? "desc" : "asc")}>Updated <ArrowUpDown className="h-3 w-3" /> {sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button></th>}<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Actions</th></tr></thead><tbody>{dataRows.map((row) => <tr key={row.link} className={`app-table-row border-t ${density === "compact" ? "h-9" : "h-12"}`}><td className="px-4 py-2 font-medium">{row.label}</td><td className="px-4 py-2">{row.status}</td><td className="px-4 py-2">{row.total}</td>{columns.includes("updated") && <td className="px-4 py-2">{row.updated ? new Date(row.updated).toLocaleDateString() : "—"}</td>}<td className="px-4 py-2 text-right"><Link to={row.link} className="text-primary underline">View</Link></td></tr>)}</tbody></table></div>{totalCount === 0 && <div className="m-4 rounded-xl border border-dashed border-[var(--bedrock-border)] p-8 text-center text-sm text-muted">{SECTION_EMPTY_COPY[section as Section]}</div>}<div className="flex items-center justify-between border-t px-4 py-3 text-sm"><p>Total: {totalCount}</p><div className="flex items-center gap-2"><button className="app-button-secondary" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button><span>Page {page + 1}</span><button className="app-button-secondary" onClick={() => setPage((p) => p + 1)}>Next</button></div></div></>}</div>}
      {(["activities", "reports"] as Section[]).includes(section as Section) && <div className="app-card rounded-xl border border-dashed p-8 text-center text-sm text-muted">{SECTION_EMPTY_COPY[section as Section]}</div>}
    </>}
  </section>;
}
