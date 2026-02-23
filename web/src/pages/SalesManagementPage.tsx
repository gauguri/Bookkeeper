import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { formatCurrency } from "../utils/formatters";

type Summary = {
  pipeline_value: number;
  open_opportunities: number;
  quotes_pending_approval: number;
  orders_pending_fulfillment: number;
  won_last_30d: number;
  by_stage: { stage: string; count: number; amount: number }[];
};

type ListResponse<T> = { items: T[]; total_count: number };
type Account = { id: number; name: string; industry?: string; owner_user_id?: number; updated_at: string };
type Opportunity = { id: number; name: string; stage: string; amount_estimate: number; probability: number; expected_close_date?: string };
type Quote = { id: number; quote_number: string; status: string; approval_status: string; total: number; updated_at: string };
type Order = { id: number; order_number: string; status: string; total: number; fulfillment_type: string; updated_at: string };

const SECTIONS = ["dashboard", "accounts", "opportunities", "quotes", "orders", "activities", "reports"] as const;
const SAVED_VIEWS = ["all", "my_records", "recently_updated", "needs_approval"];

export default function SalesManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get("section") || "dashboard") as (typeof SECTIONS)[number];
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
  const [error, setError] = useState<string>("");
  const [accounts, setAccounts] = useState<ListResponse<Account>>({ items: [], total_count: 0 });
  const [opportunities, setOpportunities] = useState<ListResponse<Opportunity>>({ items: [], total_count: 0 });
  const [quotes, setQuotes] = useState<ListResponse<Quote>>({ items: [], total_count: 0 });
  const [orders, setOrders] = useState<ListResponse<Order>>({ items: [], total_count: 0 });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key); else next.set(key, value);
    if (key !== "page") next.set("page", "0");
    setSearchParams(next);
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    const tasks: Promise<any>[] = [apiFetch<Summary>("/sales/reports/summary").then(setSummary)];
    if (section === "accounts") {
      tasks.push(apiFetch<ListResponse<Account>>(`/sales/accounts?search=${encodeURIComponent(search)}&page=${page}&page_size=${pageSize}`).then(setAccounts));
    } else if (section === "opportunities") {
      const stage = view === "needs_approval" ? "Negotiation" : "";
      tasks.push(apiFetch<ListResponse<Opportunity>>(`/sales/opportunities?search=${encodeURIComponent(search)}&stage=${stage}&page=${page}&page_size=${pageSize}`).then(setOpportunities));
    } else if (section === "quotes") {
      const status = view === "needs_approval" ? "Sent" : "";
      tasks.push(apiFetch<ListResponse<Quote>>(`/sales/quotes?status=${encodeURIComponent(status)}&page=${page}&page_size=${pageSize}`).then(setQuotes));
    } else if (section === "orders") {
      const status = view === "needs_approval" ? "CONFIRMED" : "";
      tasks.push(apiFetch<ListResponse<Order>>(`/sales/orders?status=${encodeURIComponent(status)}&page=${page}&page_size=${pageSize}`).then(setOrders));
    }
    Promise.all(tasks).catch((e) => setError(e.message || "Failed to load sales data")).finally(() => setLoading(false));
  }, [section, search, view, page, pageSize]);

  const kpis = useMemo(() => [
    { label: "Pipeline Value", value: formatCurrency(summary?.pipeline_value || 0) },
    { label: "Won Last 30d", value: formatCurrency(summary?.won_last_30d || 0) },
    { label: "Open Opportunities", value: String(summary?.open_opportunities || 0) },
    { label: "Pending Quote Approvals", value: String(summary?.quotes_pending_approval || 0) },
    { label: "Orders Pending Fulfillment", value: String(summary?.orders_pending_fulfillment || 0) },
  ], [summary]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Sales Command Center</h2>
          <p className="text-sm text-muted">End-to-end sales lifecycle from accounts to cash.</p>
        </div>
        <div className="flex gap-2">
          <button className="app-button" onClick={() => setParam("section", "accounts")}>New account</button>
          <button className="app-button" onClick={() => setParam("section", "opportunities")}>New opportunity</button>
          <button className="app-button" onClick={() => setParam("section", "quotes")}>New quote</button>
          <button className="app-button" onClick={() => setParam("section", "orders")}>New order</button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button key={s} className={`rounded-xl px-3 py-2 text-sm ${section === s ? "bg-primary text-white" : "app-button-secondary"}`} onClick={() => setParam("section", s)}>
            {s.replace("_", " ")}
          </button>
        ))}
      </nav>

      {error && <div className="app-card border border-red-500/40 p-4 text-sm text-red-300">{error}</div>}

      {section === "dashboard" && (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            {kpis.map((kpi) => <div key={kpi.label} className="app-card p-4"><p className="text-xs uppercase tracking-wide text-muted">{kpi.label}</p><p className="mt-2 text-2xl font-semibold">{loading ? "…" : kpi.value}</p></div>)}
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
              </div>
            </div>
            <div className="app-card p-4">
              <h3 className="text-sm font-semibold">My Work</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>• Tasks due today surfaced from activities.</li>
                <li>• Approvals pending from quote discount rules.</li>
                <li>• Recently viewed records (placeholder for user personalization).</li>
              </ul>
            </div>
          </section>
        </>
      )}

      {["accounts", "opportunities", "quotes", "orders"].includes(section) && (
        <section className="app-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input aria-label="Search records" className="bedrock-focus rounded-xl border border-[var(--bedrock-border)] bg-transparent px-3 py-2 text-sm" placeholder="Search" value={search} onChange={(e) => setParam("search", e.target.value)} />
            <select aria-label="Saved views" className="bedrock-focus rounded-xl border border-[var(--bedrock-border)] bg-transparent px-3 py-2 text-sm" value={view} onChange={(e) => setParam("view", e.target.value)}>
              {SAVED_VIEWS.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}
            </select>
            <select aria-label="Density" className="bedrock-focus rounded-xl border border-[var(--bedrock-border)] bg-transparent px-3 py-2 text-sm" value={density} onChange={(e) => setParam("density", e.target.value)}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
            <button className="app-button-secondary" onClick={() => setParam("columns", columns.includes("updated") ? "name,status,total" : "name,status,total,updated")}>Columns</button>
            <button className="app-button-secondary" onClick={() => setParam("sortDir", sortDir === "asc" ? "desc" : "asc")}>Sort {sortBy} {sortDir}</button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="app-skeleton h-10 rounded-lg" />)}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--bedrock-bg)] text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-2">Name / Number</th><th>Status</th><th>Total</th>{columns.includes("updated") && <th>Updated</th>}<th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={density === "compact" ? "[&_tr]:h-9" : "[&_tr]:h-12"}>
                    {(section === "accounts" ? accounts.items.map((a) => ({ label: a.name, status: a.industry || "—", total: "—", updated: a.updated_at, link: `/sales/accounts/${a.id}` }))
                      : section === "opportunities" ? opportunities.items.map((o) => ({ label: o.name, status: o.stage, total: formatCurrency(o.amount_estimate), updated: o.expected_close_date, link: `/sales/opportunities/${o.id}` }))
                      : section === "quotes" ? quotes.items.map((q) => ({ label: q.quote_number, status: `${q.status} / ${q.approval_status}`, total: formatCurrency(q.total), updated: q.updated_at, link: `/sales/quotes/${q.id}` }))
                      : orders.items.map((o) => ({ label: o.order_number, status: o.status, total: formatCurrency(o.total), updated: o.updated_at, link: `/sales/orders/${o.id}` }))).map((row) => (
                      <tr key={row.link} className="border-t border-[var(--bedrock-border)]">
                        <td>{row.label}</td><td>{row.status}</td><td>{row.total}</td>{columns.includes("updated") && <td>{row.updated ? new Date(row.updated).toLocaleDateString() : "—"}</td>}
                        <td className="text-right"><Link to={row.link} className="text-primary underline">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(section === "accounts" ? accounts.total_count : section === "opportunities" ? opportunities.total_count : section === "quotes" ? quotes.total_count : orders.total_count) === 0 && (
                <div className="mt-6 rounded-xl border border-dashed border-[var(--bedrock-border)] p-8 text-center text-sm text-muted">No records found. Adjust filters or create new sales records.</div>
              )}
              <div className="mt-4 flex items-center justify-between text-sm">
                <p>Total: {section === "accounts" ? accounts.total_count : section === "opportunities" ? opportunities.total_count : section === "quotes" ? quotes.total_count : orders.total_count}</p>
                <div className="flex items-center gap-2">
                  <button className="app-button-secondary" disabled={page <= 0} onClick={() => setParam("page", String(Math.max(0, page - 1)))}>Prev</button>
                  <span>Page {page + 1}</span>
                  <button className="app-button-secondary" onClick={() => setParam("page", String(page + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {section === "activities" && <section className="app-card p-4 text-sm text-muted">Activity timeline workspace is ready. Use <code>/api/sales/activities</code> endpoints to power notes/tasks/calls in each record context.</section>}
      {section === "reports" && <section className="app-card p-4 text-sm text-muted">Reporting workspace scaffolded with summary metrics and stage distribution. Expand with win-rate, velocity, and cohort reports next.</section>}
    </div>
  );
}
