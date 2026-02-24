import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { apiFetch } from "../api";
import { ListResponse, SalesAccount, SalesOpportunity, SalesOrder, SalesQuote } from "../components/sales/types";
import { formatCurrency } from "../utils/formatters";
import CreateAccountDrawer from "../components/sales/CreateAccountDrawer";
import CreateOpportunityDrawer from "../components/sales/CreateOpportunityDrawer";
import CreateQuoteDrawer from "../components/sales/CreateQuoteDrawer";
import CreateOrderDrawer from "../components/sales/CreateOrderDrawer";

type Summary = {
  pipeline_value: number;
  open_opportunities: number;
  quotes_pending_approval: number;
  orders_pending_fulfillment: number;
  won_last_30d: number;
  by_stage: { stage: string; count: number; amount: number }[];
};
type Section = "dashboard" | "accounts" | "opportunities" | "quotes" | "orders" | "activities" | "reports";
type DrawerType = "account" | "opportunity" | "quote" | "order" | null;

type Row = {
  label: string;
  status: string;
  total: string;
  updated?: string | null;
  link: string;
};

const SECTIONS: Section[] = ["dashboard", "accounts", "opportunities", "quotes", "orders", "activities", "reports"];
const SAVED_VIEWS = ["all", "my_records", "recently_updated", "needs_approval"];

const SECTION_TITLE: Record<Section, string> = {
  dashboard: "Dashboard",
  accounts: "Accounts",
  opportunities: "Opportunities",
  quotes: "Quotes",
  orders: "Orders",
  activities: "Activities",
  reports: "Reports",
};

const SECTION_EMPTY_COPY: Record<Section, string> = {
  dashboard: "No dashboard metrics available yet.",
  accounts: "No accounts found. Create a new account to get started.",
  opportunities: "No opportunities found. Create one to start your pipeline.",
  quotes: "No quotes found. Create a quote to continue the flow.",
  orders: "No orders found. Create an order to begin fulfillment.",
  activities: "No activities available yet.",
  reports: "No reports are available yet.",
};

export default function SalesManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get("section") || "dashboard") as Section;
  const search = searchParams.get("search") || "";
  const view = searchParams.get("view") || "all";
  const sortBy = searchParams.get("sortBy") || "updated_at";
  const sortDir = searchParams.get("sortDir") || "desc";
  const density = searchParams.get("density") || "comfortable";
  const page = Number(searchParams.get("page") || 0);
  const pageSize = Number(searchParams.get("pageSize") || 25);
  const columns = (searchParams.get("columns") || "name,status,total,updated").split(",");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<DrawerType>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [accounts, setAccounts] = useState<ListResponse<SalesAccount>>({ items: [], total_count: 0 });
  const [opportunities, setOpportunities] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [quotes, setQuotes] = useState<ListResponse<SalesQuote>>({ items: [], total_count: 0 });
  const [orders, setOrders] = useState<ListResponse<SalesOrder>>({ items: [], total_count: 0 });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "page") next.set("page", "0");
    setSearchParams(next);
  };

  useEffect(() => {
    setLoading(true);
    setError("");

    const buildQuery = (params: Record<string, string | number | undefined>) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === "") return;
        query.set(key, String(value));
      });
      return query.toString();
    };

    const tasks: Promise<unknown>[] = [apiFetch<Summary>("/sales/reports/summary").then(setSummary)];

    if (section === "accounts") {
      const q = buildQuery({ search: search.trim() || undefined, page, page_size: pageSize });
      tasks.push(apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?${q}`).then(setAccounts));
    } else if (section === "opportunities") {
      const q = buildQuery({ search: search.trim() || undefined, stage: view === "needs_approval" ? "Negotiation" : undefined, page, page_size: pageSize });
      tasks.push(apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?${q}`).then(setOpportunities));
    } else if (section === "quotes") {
      const q = buildQuery({ status: view === "needs_approval" ? "Sent" : undefined, page, page_size: pageSize });
      tasks.push(apiFetch<ListResponse<SalesQuote>>(`/sales/quotes?${q}`).then(setQuotes));
    } else if (section === "orders") {
      const q = buildQuery({ status: view === "needs_approval" ? "CONFIRMED" : undefined, page, page_size: pageSize });
      tasks.push(apiFetch<ListResponse<SalesOrder>>(`/sales/orders?${q}`).then(setOrders));
    }

    Promise.all(tasks)
      .catch((e: Error) => setError(e.message || "Failed to load sales data"))
      .finally(() => setLoading(false));
  }, [section, search, view, page, pageSize, reloadTick]);

  const kpis = useMemo(
    () => [
      { label: "Pipeline Value", value: formatCurrency(summary?.pipeline_value || 0) },
      { label: "Won Last 30d", value: formatCurrency(summary?.won_last_30d || 0) },
      { label: "Open Opportunities", value: String(summary?.open_opportunities || 0) },
      { label: "Pending Quote Approvals", value: String(summary?.quotes_pending_approval || 0) },
      { label: "Orders Pending Fulfillment", value: String(summary?.orders_pending_fulfillment || 0) },
    ],
    [summary]
  );

  const dataRows: Row[] =
    section === "accounts"
      ? accounts.items.map((a) => ({ label: a.name, status: a.industry || "—", total: "—", updated: a.updated_at, link: `/sales/accounts/${a.id}` }))
      : section === "opportunities"
      ? opportunities.items.map((o) => ({ label: o.name, status: o.stage, total: formatCurrency(o.amount_estimate), updated: o.expected_close_date, link: `/sales/opportunities/${o.id}` }))
      : section === "quotes"
      ? quotes.items.map((q) => ({ label: q.quote_number, status: `${q.status} / ${q.approval_status}`, total: formatCurrency(q.total), updated: q.updated_at, link: `/sales/quotes/${q.id}` }))
      : orders.items.map((o) => ({ label: o.order_number, status: o.status, total: formatCurrency(o.total), updated: o.updated_at, link: `/sales/orders/${o.id}` }));

  const totalCount = section === "accounts" ? accounts.total_count : section === "opportunities" ? opportunities.total_count : section === "quotes" ? quotes.total_count : orders.total_count;
  const activeFilterCount = Number(Boolean(search)) + Number(view !== "all") + Number(density !== "comfortable");

  const handleDrawerCreated = (entityType: Exclude<DrawerType, null>, id: number, saveNew?: boolean) => {
    setNotice(`${SECTION_TITLE[entityType === "account" ? "accounts" : entityType === "opportunity" ? "opportunities" : entityType === "quote" ? "quotes" : "orders"]} created successfully.`);
    if (!saveNew) {
      setDrawerOpen(null);
      const entityPath = entityType === "account" ? "accounts" : entityType === "opportunity" ? "opportunities" : entityType === "quote" ? "quotes" : "orders";
      navigate(`/sales/${entityPath}/${id}`);
    }
    setReloadTick((tick) => tick + 1);
  };

  const SortIcon = () => (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Sales</p>
          <h1 className="text-2xl font-bold">Sales Command Center</h1>
          <p className="text-sm text-muted">End-to-end sales lifecycle from accounts to cash.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="app-button" onClick={() => setDrawerOpen("account")}>
            <Plus className="h-4 w-4" /> New Account
          </button>
          <button className="app-button-secondary" onClick={() => setDrawerOpen("opportunity")}>New Opportunity</button>
          <button className="app-button-secondary" onClick={() => setDrawerOpen("quote")}>New Quote</button>
          <button className="app-button-secondary" onClick={() => setDrawerOpen("order")}>New Order</button>
        </div>
      </header>

      {notice && <div className="app-card border border-success/40 bg-success/10 p-4 text-sm text-success">{notice}</div>}
      {error && <div className="app-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

      <div className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder={`Search ${SECTION_TITLE[section].toLowerCase()}...`}
              value={search}
              onChange={(e) => setParam("search", e.target.value)}
              disabled={! ["accounts", "opportunities", "quotes", "orders"].includes(section)}
            />
          </div>
          <button
            className={`app-button-secondary flex items-center gap-1.5 ${showFilters ? "ring-2 ring-primary/30" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button
              className="app-button-ghost text-xs"
              onClick={() => {
                setParam("search", "");
                setParam("view", "all");
                setParam("density", "comfortable");
              }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-4 rounded-xl border p-3">
            <div>
              <label className="text-xs font-medium text-muted">Saved View</label>
              <select className="app-select mt-1" value={view} onChange={(e) => setParam("view", e.target.value)}>
                {SAVED_VIEWS.map((savedView) => (
                  <option key={savedView} value={savedView}>{savedView.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Density</label>
              <select className="app-select mt-1" value={density} onChange={(e) => setParam("density", e.target.value)}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Columns</label>
              <button
                className="app-button-secondary mt-1"
                onClick={() => setParam("columns", columns.includes("updated") ? "name,status,total" : "name,status,total,updated")}
              >
                Toggle Updated
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${section === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"}`}
            onClick={() => setParam("section", s)}
          >
            {SECTION_TITLE[s]}
          </button>
        ))}
      </nav>

      {section === "dashboard" && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="app-card p-4">
                <p className="text-xs text-muted">{kpi.label}</p>
                <p className="mt-1 text-lg font-bold">{loading ? "…" : kpi.value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="app-card p-4">
              <h3 className="text-sm font-semibold">Pipeline by stage</h3>
              <div className="mt-3 space-y-2">
                {(summary?.by_stage || []).map((row) => (
                  <div key={row.stage} className="flex items-center justify-between rounded-lg border border-[var(--bedrock-border)] px-3 py-2 text-sm">
                    <span>{row.stage}</span>
                    <span>{row.count} • {formatCurrency(row.amount)}</span>
                  </div>
                ))}
                {!loading && !(summary?.by_stage.length) && (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">{SECTION_EMPTY_COPY.dashboard}</div>
                )}
              </div>
            </div>
            <div className="app-card p-4">
              <h3 className="text-sm font-semibold">Quick Actions</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="app-button-secondary justify-center" onClick={() => setDrawerOpen("account")}><Building2 className="h-4 w-4" /> Account</button>
                <button className="app-button-secondary justify-center" onClick={() => setDrawerOpen("opportunity")}><BriefcaseBusiness className="h-4 w-4" /> Opportunity</button>
                <button className="app-button-secondary justify-center" onClick={() => setDrawerOpen("quote")}><Plus className="h-4 w-4" /> Quote</button>
                <button className="app-button-secondary justify-center" onClick={() => setDrawerOpen("order")}><PackageCheck className="h-4 w-4" /> Order</button>
              </div>
            </div>
          </section>
        </>
      )}

      {["accounts", "opportunities", "quotes", "orders"].includes(section) && (
        <div className="app-card overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="app-skeleton h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-left">Name / Number</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Total</th>
                      {columns.includes("updated") && (
                        <th className="px-4 py-3 text-left">
                          <button
                            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground"
                            onClick={() => setParam("sortDir", sortDir === "asc" ? "desc" : "asc")}
                          >
                            Updated <ArrowUpDown className="h-3 w-3" /> <SortIcon />
                          </button>
                        </th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row) => (
                      <tr key={row.link} className={`app-table-row border-t ${density === "compact" ? "h-9" : "h-12"}`}>
                        <td className="px-4 py-2 font-medium">{row.label}</td>
                        <td className="px-4 py-2">{row.status}</td>
                        <td className="px-4 py-2">{row.total}</td>
                        {columns.includes("updated") && <td className="px-4 py-2">{row.updated ? new Date(row.updated).toLocaleDateString() : "—"}</td>}
                        <td className="px-4 py-2 text-right"><Link to={row.link} className="text-primary underline">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalCount === 0 && (
                <div className="m-4 rounded-xl border border-dashed border-[var(--bedrock-border)] p-8 text-center text-sm text-muted">
                  {SECTION_EMPTY_COPY[section]}
                </div>
              )}
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p>Total: {totalCount}</p>
                <div className="flex items-center gap-2">
                  <button className="app-button-secondary" disabled={page <= 0} onClick={() => setParam("page", String(Math.max(0, page - 1)))}>Prev</button>
                  <span>Page {page + 1}</span>
                  <button className="app-button-secondary" onClick={() => setParam("page", String(page + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {(["activities", "reports"] as Section[]).includes(section) && (
        <div className="app-card rounded-xl border border-dashed p-8 text-center text-sm text-muted">{SECTION_EMPTY_COPY[section]}</div>
      )}

      <CreateAccountDrawer open={drawerOpen === "account"} onClose={() => setDrawerOpen(null)} onCreated={(id, saveNew) => handleDrawerCreated("account", id, saveNew)} />
      <CreateOpportunityDrawer open={drawerOpen === "opportunity"} onClose={() => setDrawerOpen(null)} onCreated={(id, saveNew) => handleDrawerCreated("opportunity", id, saveNew)} />
      <CreateQuoteDrawer open={drawerOpen === "quote"} onClose={() => setDrawerOpen(null)} onCreated={(id, saveNew) => handleDrawerCreated("quote", id, saveNew)} />
      <CreateOrderDrawer open={drawerOpen === "order"} onClose={() => setDrawerOpen(null)} onCreated={(id, saveNew) => handleDrawerCreated("order", id, saveNew)} />
    </section>
  );
}
