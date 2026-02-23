import { FormEvent, useEffect, useMemo, useState } from "react";
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
type Account = { id: number; name: string; industry?: string; owner_user_id?: number; updated_at: string; shipping_address?: string };
type Opportunity = { id: number; account_id: number; name: string; stage: string; amount_estimate: number; probability: number; expected_close_date?: string };
type Quote = { id: number; opportunity_id: number; quote_number: string; status: string; approval_status: string; total: number; updated_at: string };
type Order = { id: number; order_number: string; status: string; total: number; fulfillment_type: string; updated_at: string };
type Section = "dashboard" | "accounts" | "opportunities" | "quotes" | "orders" | "activities" | "reports";
type QuickAction = "account" | "opportunity" | "quote" | "order";

const SECTIONS: Section[] = ["dashboard", "accounts", "opportunities", "quotes", "orders", "activities", "reports"];
const SAVED_VIEWS = ["all", "my_records", "recently_updated", "needs_approval"];

const STAGE_OPTIONS = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const FULFILLMENT_OPTIONS = ["SHIPPING", "PICKUP", "DELIVERY"];

export default function SalesManagementPage() {
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
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [reloadTick, setReloadTick] = useState(0);

  const [accounts, setAccounts] = useState<ListResponse<Account>>({ items: [], total_count: 0 });
  const [opportunities, setOpportunities] = useState<ListResponse<Opportunity>>({ items: [], total_count: 0 });
  const [quotes, setQuotes] = useState<ListResponse<Quote>>({ items: [], total_count: 0 });
  const [orders, setOrders] = useState<ListResponse<Order>>({ items: [], total_count: 0 });

  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [accountForm, setAccountForm] = useState({ name: "", industry: "", website: "", phone: "", billing_address: "", shipping_address: "" });
  const [opportunityForm, setOpportunityForm] = useState({ account_id: "", name: "", stage: "Qualification", amount_estimate: "0", probability: "25", expected_close_date: "" });
  const [quoteForm, setQuoteForm] = useState({ opportunity_id: "", valid_until: "", notes: "" });
  const [orderForm, setOrderForm] = useState({ account_id: "", opportunity_id: "", quote_id: "", order_date: new Date().toISOString().slice(0, 10), requested_ship_date: "", fulfillment_type: "SHIPPING", shipping_address: "" });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.set("page", "0");
    setSearchParams(next);
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    const tasks: Promise<unknown>[] = [apiFetch<Summary>("/sales/reports/summary").then(setSummary)];
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

  const openQuickAction = async (action: QuickAction) => {
    setNotice("");
    setFormError("");
    setQuickAction(action);

    if (action === "opportunity" || action === "order") {
      const resp = await apiFetch<ListResponse<Account>>(`/sales/accounts?page=0&page_size=100`);
      setAccounts(resp);
    }
    if (action === "quote" || action === "order") {
      const resp = await apiFetch<ListResponse<Opportunity>>(`/sales/opportunities?page=0&page_size=100`);
      setOpportunities(resp);
    }
    if (action === "order") {
      const resp = await apiFetch<ListResponse<Quote>>(`/sales/quotes?page=0&page_size=100`);
      setQuotes(resp);
    }
  };

  const closeQuickAction = () => {
    setQuickAction(null);
    setFormError("");
  };

  const submitQuickAction = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (quickAction === "account") {
        if (!accountForm.name.trim()) {
          setFormError("Account name is required.");
          return;
        }
        await apiFetch("/sales/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: accountForm.name,
            industry: accountForm.industry || null,
            website: accountForm.website || null,
            phone: accountForm.phone || null,
            billing_address: accountForm.billing_address || null,
            shipping_address: accountForm.shipping_address || null,
          }),
        });
        setNotice("Account created successfully.");
        setParam("section", "accounts");
      }

      if (quickAction === "opportunity") {
        if (!opportunityForm.account_id || !opportunityForm.name.trim()) {
          setFormError("Account and opportunity name are required.");
          return;
        }
        await apiFetch("/sales/opportunities", {
          method: "POST",
          body: JSON.stringify({
            account_id: Number(opportunityForm.account_id),
            name: opportunityForm.name,
            stage: opportunityForm.stage,
            amount_estimate: Number(opportunityForm.amount_estimate || 0),
            probability: Number(opportunityForm.probability || 0),
            expected_close_date: opportunityForm.expected_close_date || null,
          }),
        });
        setNotice("Opportunity created successfully.");
        setParam("section", "opportunities");
      }

      if (quickAction === "quote") {
        if (!quoteForm.opportunity_id) {
          setFormError("Opportunity is required.");
          return;
        }
        await apiFetch("/sales/quotes", {
          method: "POST",
          body: JSON.stringify({
            opportunity_id: Number(quoteForm.opportunity_id),
            valid_until: quoteForm.valid_until || null,
            notes: quoteForm.notes || null,
            lines: [],
          }),
        });
        setNotice("Quote draft created successfully.");
        setParam("section", "quotes");
      }

      if (quickAction === "order") {
        if (!orderForm.account_id) {
          setFormError("Account is required.");
          return;
        }
        await apiFetch("/sales/orders", {
          method: "POST",
          body: JSON.stringify({
            account_id: Number(orderForm.account_id),
            opportunity_id: orderForm.opportunity_id ? Number(orderForm.opportunity_id) : null,
            quote_id: orderForm.quote_id ? Number(orderForm.quote_id) : null,
            order_date: orderForm.order_date,
            requested_ship_date: orderForm.requested_ship_date || null,
            fulfillment_type: orderForm.fulfillment_type,
            shipping_address: orderForm.shipping_address || null,
          }),
        });
        setNotice("Sales order created successfully.");
        setParam("section", "orders");
      }

      closeQuickAction();
      setReloadTick((prev) => prev + 1);
    } catch (e) {
      setFormError((e as Error).message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  const dataRows =
    section === "accounts"
      ? accounts.items.map((a) => ({ label: a.name, status: a.industry || "—", total: "—", updated: a.updated_at, link: `/sales/accounts/${a.id}` }))
      : section === "opportunities"
      ? opportunities.items.map((o) => ({ label: o.name, status: o.stage, total: formatCurrency(o.amount_estimate), updated: o.expected_close_date, link: `/sales/opportunities/${o.id}` }))
      : section === "quotes"
      ? quotes.items.map((q) => ({ label: q.quote_number, status: `${q.status} / ${q.approval_status}`, total: formatCurrency(q.total), updated: q.updated_at, link: `/sales/quotes/${q.id}` }))
      : orders.items.map((o) => ({ label: o.order_number, status: o.status, total: formatCurrency(o.total), updated: o.updated_at, link: `/sales/orders/${o.id}` }));

  const totalCount =
    section === "accounts"
      ? accounts.total_count
      : section === "opportunities"
      ? opportunities.total_count
      : section === "quotes"
      ? quotes.total_count
      : orders.total_count;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Sales Command Center</h2>
          <p className="text-sm text-muted">End-to-end sales lifecycle from accounts to cash.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={() => openQuickAction("account")}>New account</button>
          <button className="app-button-secondary" onClick={() => openQuickAction("opportunity")}>New opportunity</button>
          <button className="app-button-secondary" onClick={() => openQuickAction("quote")}>New quote</button>
          <button className="app-button-secondary" onClick={() => openQuickAction("order")}>New order</button>
        </div>
      </header>

      {notice && <section className="app-card border border-emerald-500/40 p-3 text-sm text-emerald-300">{notice}</section>}

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s}
            className={`rounded-xl px-3 py-2 text-sm ${section === s ? "bg-primary text-white" : "app-button-secondary"}`}
            onClick={() => setParam("section", s)}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </nav>

      {error && <div className="app-card border border-red-500/40 p-4 text-sm text-red-300">{error}</div>}

      {section === "dashboard" && (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="app-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{kpi.label}</p>
                <p className="mt-2 text-2xl font-semibold">{loading ? "…" : kpi.value}</p>
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
                    <span>
                      {row.count} • {formatCurrency(row.amount)}
                    </span>
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
              {SAVED_VIEWS.map((v) => (
                <option key={v} value={v}>
                  {v.replace("_", " ")}
                </option>
              ))}
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
                      <th className="py-2">Name / Number</th>
                      <th>Status</th>
                      <th>Total</th>
                      {columns.includes("updated") && <th>Updated</th>}
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={density === "compact" ? "[&_tr]:h-9" : "[&_tr]:h-12"}>
                    {dataRows.map((row) => (
                      <tr key={row.link} className="border-t border-[var(--bedrock-border)]">
                        <td>{row.label}</td>
                        <td>{row.status}</td>
                        <td>{row.total}</td>
                        {columns.includes("updated") && <td>{row.updated ? new Date(row.updated).toLocaleDateString() : "—"}</td>}
                        <td className="text-right">
                          <Link to={row.link} className="text-primary underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalCount === 0 && <div className="mt-6 rounded-xl border border-dashed border-[var(--bedrock-border)] p-8 text-center text-sm text-muted">No records found. Adjust filters or create new sales records.</div>}

              <div className="mt-4 flex items-center justify-between text-sm">
                <p>Total: {totalCount}</p>
                <div className="flex items-center gap-2">
                  <button className="app-button-secondary" disabled={page <= 0} onClick={() => setParam("page", String(Math.max(0, page - 1)))}>
                    Prev
                  </button>
                  <span>Page {page + 1}</span>
                  <button className="app-button-secondary" onClick={() => setParam("page", String(page + 1))}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {section === "activities" && <section className="app-card p-4 text-sm text-muted">Activity timeline workspace is ready. Use <code>/api/sales/activities</code> endpoints to power notes/tasks/calls in each record context.</section>}
      {section === "reports" && <section className="app-card p-4 text-sm text-muted">Reporting workspace scaffolded with summary metrics and stage distribution. Expand with win-rate, velocity, and cohort reports next.</section>}

      {quickAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form className="app-card w-full max-w-2xl space-y-4 p-5" onSubmit={submitQuickAction}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create {quickAction}</h3>
              <button type="button" className="app-button-secondary" onClick={closeQuickAction}>
                Close
              </button>
            </div>

            {formError && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</p>}

            {quickAction === "account" && (
              <div className="grid gap-3 md:grid-cols-2">
                <input className="app-input" placeholder="Account name*" value={accountForm.name} onChange={(e) => setAccountForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="app-input" placeholder="Industry" value={accountForm.industry} onChange={(e) => setAccountForm((prev) => ({ ...prev, industry: e.target.value }))} />
                <input className="app-input" placeholder="Website" value={accountForm.website} onChange={(e) => setAccountForm((prev) => ({ ...prev, website: e.target.value }))} />
                <input className="app-input" placeholder="Phone" value={accountForm.phone} onChange={(e) => setAccountForm((prev) => ({ ...prev, phone: e.target.value }))} />
                <textarea className="app-input md:col-span-2" placeholder="Billing address" value={accountForm.billing_address} onChange={(e) => setAccountForm((prev) => ({ ...prev, billing_address: e.target.value }))} />
                <textarea className="app-input md:col-span-2" placeholder="Shipping address" value={accountForm.shipping_address} onChange={(e) => setAccountForm((prev) => ({ ...prev, shipping_address: e.target.value }))} />
              </div>
            )}

            {quickAction === "opportunity" && (
              <div className="grid gap-3 md:grid-cols-2">
                <select className="app-select" value={opportunityForm.account_id} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, account_id: e.target.value }))}>
                  <option value="">Select account*</option>
                  {accounts.items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input className="app-input" placeholder="Opportunity name*" value={opportunityForm.name} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, name: e.target.value }))} />
                <select className="app-select" value={opportunityForm.stage} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, stage: e.target.value }))}>
                  {STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                <input className="app-input" type="number" min="0" placeholder="Amount estimate" value={opportunityForm.amount_estimate} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, amount_estimate: e.target.value }))} />
                <input className="app-input" type="number" min="0" max="100" placeholder="Probability" value={opportunityForm.probability} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, probability: e.target.value }))} />
                <input className="app-input" type="date" value={opportunityForm.expected_close_date} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expected_close_date: e.target.value }))} />
              </div>
            )}

            {quickAction === "quote" && (
              <div className="grid gap-3 md:grid-cols-2">
                <select className="app-select md:col-span-2" value={quoteForm.opportunity_id} onChange={(e) => setQuoteForm((prev) => ({ ...prev, opportunity_id: e.target.value }))}>
                  <option value="">Select opportunity*</option>
                  {opportunities.items.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <input className="app-input" type="date" value={quoteForm.valid_until} onChange={(e) => setQuoteForm((prev) => ({ ...prev, valid_until: e.target.value }))} />
                <textarea className="app-input" placeholder="Quote notes" value={quoteForm.notes} onChange={(e) => setQuoteForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
            )}

            {quickAction === "order" && (
              <div className="grid gap-3 md:grid-cols-2">
                <select className="app-select" value={orderForm.account_id} onChange={(e) => setOrderForm((prev) => ({ ...prev, account_id: e.target.value }))}>
                  <option value="">Select account*</option>
                  {accounts.items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select className="app-select" value={orderForm.opportunity_id} onChange={(e) => setOrderForm((prev) => ({ ...prev, opportunity_id: e.target.value }))}>
                  <option value="">Link opportunity (optional)</option>
                  {opportunities.items.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <select className="app-select" value={orderForm.quote_id} onChange={(e) => setOrderForm((prev) => ({ ...prev, quote_id: e.target.value }))}>
                  <option value="">Link quote (optional)</option>
                  {quotes.items.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quote_number}
                    </option>
                  ))}
                </select>
                <select className="app-select" value={orderForm.fulfillment_type} onChange={(e) => setOrderForm((prev) => ({ ...prev, fulfillment_type: e.target.value }))}>
                  {FULFILLMENT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <input className="app-input" type="date" value={orderForm.order_date} onChange={(e) => setOrderForm((prev) => ({ ...prev, order_date: e.target.value }))} />
                <input className="app-input" type="date" value={orderForm.requested_ship_date} onChange={(e) => setOrderForm((prev) => ({ ...prev, requested_ship_date: e.target.value }))} />
                <textarea className="app-input md:col-span-2" placeholder="Shipping address" value={orderForm.shipping_address} onChange={(e) => setOrderForm((prev) => ({ ...prev, shipping_address: e.target.value }))} />
              </div>
            )}

            <div className="flex justify-end">
              <button className="app-button" disabled={saving} type="submit">
                {saving ? "Saving..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
