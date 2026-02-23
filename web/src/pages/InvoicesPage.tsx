import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  FileText,
  Send,
  AlertTriangle,
  Clock,
  Target,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  Truck,
  Ban,
} from "lucide-react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";
import { formatCurrency } from "../utils/formatters";
import CustomerInsightsPanel from "../components/CustomerInsightsPanel";
import InvoiceStatusBadge from "../components/invoices/InvoiceStatusBadge";
import InvoicePipelineBar from "../components/invoices/InvoicePipelineBar";
import {
  useInvoicesEnriched,
  useInvoicesViewSummary,
  type InvoiceFilters,
  type InvoiceListEnriched,
} from "../hooks/useInvoices";

/* ── Create form types (preserved) ── */

type Customer = { id: number; name: string };
type Item = {
  id: number;
  name: string;
  unit_price: number;
  preferred_supplier_id?: number | null;
  preferred_supplier_name?: string | null;
  preferred_landed_cost?: number | null;
};
type LineItem = {
  item_id?: number;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  supplier_id?: number;
  override_cost: boolean;
  discount: string;
  tax_rate: string;
  landed_unit_cost: string;
  margin_threshold_percent: number;
};
type SupplierLink = {
  supplier_id: number;
  item_id: number;
  supplier_name: string;
  landed_cost: number;
  is_preferred: boolean;
};
type PricingContextResponse = {
  landed_unit_cost: number;
  available_qty: number;
  recommended_price: number;
  margin_threshold_percent: number;
};

const emptyLine: LineItem = {
  item_id: undefined,
  description: "",
  quantity: "1",
  unit_price: "",
  unit_cost: "",
  supplier_id: undefined,
  override_cost: false,
  discount: "0",
  tax_rate: "0",
  landed_unit_cost: "0",
  margin_threshold_percent: 20,
};

const formatNumber = (value: string) => (value === "" ? 0 : Number(value));

const parseTermsDays = (terms: string) => {
  if (!terms.trim()) return null;
  const n = terms.trim().toLowerCase();
  if (n === "due on receipt") return 0;
  const m = n.match(/net\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

const formatDateForInput = (d: Date) => {
  const adj = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return adj.toISOString().slice(0, 10);
};

const addDaysToDateString = (ds: string, days: number) => {
  const [y, m, d] = ds.split("-").map(Number);
  if (!y || !m || !d) return ds;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

/* ── List View definitions ── */

type ListView = {
  id: string;
  label: string;
  statusPreset?: string[];
  overdue?: boolean;
};

const LIST_VIEWS: ListView[] = [
  { id: "open_invoices", label: "Open Invoices", statusPreset: ["DRAFT", "SENT"] },
  { id: "awaiting_payment", label: "Awaiting Payment", statusPreset: ["SHIPPED", "PARTIALLY_PAID"] },
  { id: "paid_closed", label: "Paid / Closed", statusPreset: ["PAID"] },
  { id: "voided", label: "Voided", statusPreset: ["VOID"] },
  { id: "all", label: "All Invoices" },
  { id: "overdue", label: "Overdue", overdue: true },
];

const PAGE_SIZE = 25;

/* ── Helpers ── */

const formatDate = (value?: string | null) => {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString();
};

/* ── KPI Card ── */

function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
}) {
  return (
    <div className="app-card flex items-start gap-3 p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/* ========== Main Component ========== */

export default function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // View & pagination
  const [currentView, setCurrentView] = useState("open_invoices");
  const [page, setPage] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    issue_date: formatDateForInput(new Date()),
    due_date: "",
    notes: "",
    terms: "",
  });
  const [dueDateWasAuto, setDueDateWasAuto] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([{ ...emptyLine }]);
  const [supplierOptions, setSupplierOptions] = useState<Record<number, SupplierLink[]>>({});

  const selectedCustomerId = form.customer_id ? Number(form.customer_id) : null;

  // Active view config
  const activeView = LIST_VIEWS.find((v) => v.id === currentView) ?? LIST_VIEWS[0];

  // Build filter for React Query
  const filters: InvoiceFilters = useMemo(
    () => ({
      search: search || undefined,
      status: activeView.statusPreset,
      sort_by: sortBy,
      sort_dir: sortDir,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      overdue_only: activeView.overdue,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [search, activeView, sortBy, sortDir, dateFrom, dateTo, page],
  );

  // Data hooks
  const { data: viewSummary } = useInvoicesViewSummary(currentView);
  const { data: paginatedData, isLoading } = useInvoicesEnriched(filters);
  const invoices = paginatedData?.items;
  const totalCount = paginatedData?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Load dependencies for create form
  const loadDeps = useCallback(async () => {
    const [c, i] = await Promise.allSettled([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Item[]>("/items"),
    ]);
    if (c.status === "fulfilled") setCustomers(c.value);
    if (i.status === "fulfilled") setItems(i.value);
  }, []);

  useEffect(() => {
    loadDeps().catch(() => undefined);
  }, [loadDeps]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, sortBy, sortDir]);

  const handleViewChange = (viewId: string) => {
    setCurrentView(viewId);
    setPage(0);
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "invoice_number" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (search ? 1 : 0);
  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSearch(""); setPage(0); };

  /* ── Create form logic (preserved from original) ── */

  const addLine = () => setLines((p) => [...p, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updateLine = (i: number, u: Partial<LineItem>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...u } : l)));

  const loadSuppliersForItem = async (itemId: number) => {
    if (supplierOptions[itemId]) return supplierOptions[itemId];
    const data = await apiFetch<SupplierLink[]>(`/items/${itemId}/suppliers`);
    setSupplierOptions((p) => ({ ...p, [itemId]: data }));
    return data;
  };

  const resolveLineCost = (itemId: number, supplierId?: number) => {
    const sups = supplierOptions[itemId] ?? [];
    const matched = sups.find((l) => l.supplier_id === supplierId);
    if (matched) return matched.landed_cost.toString();
    const pref = sups.find((l) => l.is_preferred);
    if (pref) return pref.landed_cost.toString();
    const it = items.find((e) => e.id === itemId);
    if (it?.preferred_landed_cost != null) return it.preferred_landed_cost.toString();
    return "";
  };

  const handleItemChange = async (index: number, itemId: string) => {
    const item = items.find((e) => e.id === Number(itemId));
    if (!item) {
      updateLine(index, { item_id: undefined, description: "", unit_price: "", unit_cost: "", supplier_id: undefined, override_cost: false, landed_unit_cost: "0", margin_threshold_percent: 20 });
      return;
    }
    updateLine(index, {
      item_id: item.id, description: item.name, unit_price: item.unit_price.toString(),
      supplier_id: item.preferred_supplier_id ?? undefined,
      unit_cost: item.preferred_landed_cost != null ? item.preferred_landed_cost.toString() : "",
      landed_unit_cost: item.preferred_landed_cost != null ? item.preferred_landed_cost.toString() : "0",
      override_cost: false,
    });
    try {
      const cParam = form.customer_id ? `?customer_id=${form.customer_id}` : "";
      const ctx = await apiFetch<PricingContextResponse>(`/items/${item.id}/pricing-context${cParam}`);
      updateLine(index, { landed_unit_cost: String(ctx.landed_unit_cost), margin_threshold_percent: ctx.margin_threshold_percent, unit_price: String(ctx.recommended_price), unit_cost: String(ctx.landed_unit_cost) });
      const sups = await loadSuppliersForItem(item.id);
      if (sups.length > 0) {
        const pref = sups.find((l) => l.is_preferred);
        const sid = item.preferred_supplier_id ?? pref?.supplier_id;
        if (sid) {
          const sc = sups.find((l) => l.supplier_id === sid)?.landed_cost.toString();
          updateLine(index, { supplier_id: sid, unit_cost: sc ?? "", landed_unit_cost: sc ?? "0" });
        }
      }
    } catch (err) { setError((err as Error).message); }
  };

  const totals = useMemo(() => lines.reduce((a, l) => {
    const q = formatNumber(l.quantity), p = formatNumber(l.unit_price), d = formatNumber(l.discount), t = formatNumber(l.tax_rate);
    const sub = q * p - d, tax = sub * t;
    return { subtotal: a.subtotal + sub, tax: a.tax + tax, total: a.total + sub + tax };
  }, { subtotal: 0, tax: 0, total: 0 }), [lines]);

  const dueDateInvalid = Boolean(form.issue_date) && Boolean(form.due_date) && form.due_date < form.issue_date;

  const handleIssueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nd = e.target.value;
    const td = parseTermsDays(form.terms);
    let dd = form.due_date, da = dueDateWasAuto;
    if (nd && td !== null && (dueDateWasAuto || !form.due_date)) { dd = addDaysToDateString(nd, td); da = true; }
    setForm({ ...form, issue_date: nd, due_date: dd }); setDueDateWasAuto(da);
  };
  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, due_date: e.target.value }); setDueDateWasAuto(false); };
  const handleTermsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nt = e.target.value, td = parseTermsDays(nt);
    let dd = form.due_date, da = dueDateWasAuto;
    if (!nt.trim()) { da = false; } else if (td !== null && form.issue_date && (dueDateWasAuto || !form.due_date)) { dd = addDaysToDateString(form.issue_date, td); da = true; }
    setForm({ ...form, terms: nt, due_date: dd }); setDueDateWasAuto(da);
  };

  const createInvoice = async () => {
    if (!form.customer_id || !form.issue_date || !form.due_date) { setError("Customer, issue date, and due date are required."); return; }
    if (dueDateInvalid) { setError("Due date cannot be earlier than the invoice date."); return; }
    const payload = {
      customer_id: Number(form.customer_id), issue_date: form.issue_date, due_date: form.due_date,
      notes: form.notes || null, terms: form.terms || null,
      line_items: lines.map((l) => ({
        item_id: l.item_id ?? null, description: l.description || null,
        quantity: Number(l.quantity), unit_price: Number(l.unit_price),
        unit_cost: l.unit_cost ? Number(l.unit_cost) : null,
        supplier_id: l.supplier_id ?? null, landed_unit_cost: Number(l.landed_unit_cost || 0),
        discount: Number(l.discount || 0), tax_rate: Number(l.tax_rate || 0),
      })),
    };
    try {
      await apiFetch("/invoices", { method: "POST", body: JSON.stringify(payload) });
      setForm({ customer_id: "", issue_date: formatDateForInput(new Date()), due_date: "", notes: "", terms: "" });
      setDueDateWasAuto(false); setLines([{ ...emptyLine }]); setError(""); setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) { setError((err as Error).message); }
  };

  /* ========== RENDER ========== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Invoices</h2>
          <p className="text-sm text-muted">Create, send, and monitor every invoice lifecycle.</p>
        </div>
        <button className="app-button" onClick={() => setShowCreate((p) => !p)}>
          <Plus className="h-4 w-4" /> New Invoice
        </button>
      </header>

      {error && <section className="app-card text-sm text-danger p-4">{error}</section>}

      {/* Create form (collapsible) */}
      {showCreate && (
        <div id="invoice-form" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="app-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Create invoice</h2>
              <span className="app-badge border-primary/30 bg-primary/10 text-primary">New document</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select className="app-select" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">Select customer *</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="space-y-2 text-sm font-medium">
                <span className="text-muted">Invoice date</span>
                <input className="app-input" type="date" value={form.issue_date} onChange={handleIssueDateChange} />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span className="text-muted">Due date</span>
                <input className="app-input" type="date" value={form.due_date} onChange={handleDueDateChange} />
                {dueDateInvalid && <span className="text-xs text-danger">Due date must be on or after invoice date.</span>}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="app-input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <input className="app-input" placeholder="Terms (e.g. Net 30)" value={form.terms} onChange={handleTermsChange} />
            </div>

            {/* Line items */}
            <div className="space-y-3">
              <div className="grid grid-cols-[1.1fr_1fr_1.1fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2 text-xs uppercase tracking-widest text-muted">
                <span>Item</span><span>Supplier</span><span>Description</span><span>Qty</span><span>Unit price</span><span>Cost</span><span>Discount</span><span>Tax rate</span><span />
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[1.1fr_1fr_1.1fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2">
                  <select className="app-select" value={line.item_id ?? ""} onChange={(e) => handleItemChange(index, e.target.value)}>
                    <option value="">Custom</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                  <select className="app-select" value={line.supplier_id ?? ""} onChange={(e) => {
                    const sid = e.target.value ? Number(e.target.value) : undefined;
                    if (!line.item_id) return;
                    const nc = line.override_cost ? line.unit_cost : resolveLineCost(line.item_id, sid);
                    updateLine(index, { supplier_id: sid, unit_cost: nc });
                  }} disabled={!line.item_id || (supplierOptions[line.item_id]?.length ?? 0) === 0}>
                    <option value="">Preferred</option>
                    {(line.item_id ? supplierOptions[line.item_id] ?? [] : []).map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                  </select>
                  <input className="app-input" placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                  <input className="app-input" type="number" min="0" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                  <input className="app-input" type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(index, { unit_price: e.target.value })} />
                  <div className="space-y-1">
                    <input className="app-input" type="number" min="0" step="0.01" value={line.unit_cost} disabled={!line.override_cost} onChange={(e) => updateLine(index, { unit_cost: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input type="checkbox" checked={line.override_cost} onChange={(e) => {
                        const ov = e.target.checked;
                        const nc = !ov && line.item_id ? resolveLineCost(line.item_id, line.supplier_id) : line.unit_cost;
                        updateLine(index, { override_cost: ov, unit_cost: nc });
                      }} />
                      Override
                    </label>
                  </div>
                  <input className="app-input" type="number" min="0" step="0.01" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
                  <input className="app-input" type="number" min="0" max="1" step="0.01" value={line.tax_rate} onChange={(e) => updateLine(index, { tax_rate: e.target.value })} />
                  <button className="app-button-ghost text-danger" onClick={() => removeLine(index)} disabled={lines.length === 1}>Remove</button>
                  <div className="col-span-full text-xs text-muted">
                    {(() => {
                      const q = Number(line.quantity || 0), s = Number(line.unit_price || 0), lc = Number(line.landed_unit_cost || 0);
                      const md = (s - lc) * q, mp = s > 0 ? ((s - lc) / s) * 100 : 0;
                      return (
                        <span className={mp < line.margin_threshold_percent ? "text-danger" : ""}>
                          Landed unit cost: {currency(lc)} &bull; Margin: {currency(md)} ({mp.toFixed(1)}%)
                          {mp < line.margin_threshold_percent ? ` \u2022 Below ${line.margin_threshold_percent}% target` : ""}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ))}
              <div><button className="app-button-ghost text-sm" onClick={addLine}>+ Add line</button></div>
            </div>

            <div className="flex flex-wrap justify-between gap-4">
              <div className="text-sm text-muted">
                <div>Subtotal: {currency(totals.subtotal)}</div>
                <div>Tax: {currency(totals.tax)}</div>
                <div className="font-semibold text-foreground">Total: {currency(totals.total)}</div>
              </div>
              <div className="flex gap-2">
                <button className="app-button-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="app-button" onClick={createInvoice} disabled={dueDateInvalid}>Create invoice</button>
              </div>
            </div>
          </div>
          <CustomerInsightsPanel customerId={selectedCustomerId} />
        </div>
      )}

      {/* ── List View Tabs ── */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {LIST_VIEWS.map((view) => (
          <button
            key={view.id}
            onClick={() => handleViewChange(view.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              currentView === view.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {view.label}
            {currentView === view.id && totalCount > 0 && (
              <span className="ml-1.5 text-xs text-muted">({totalCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contextual KPIs ── */}
      {viewSummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {currentView === "open_invoices" && (
            <>
              <KpiCard label="Total Outstanding" value={formatCurrency(Number(viewSummary.total_outstanding ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Invoice Size" value={viewSummary.avg_invoice_size != null ? formatCurrency(Number(viewSummary.avg_invoice_size)) : "\u2014"} icon={TrendingUp} iconBg="bg-sky-500/10 text-sky-600" />
              <KpiCard label="Drafts" value={String(viewSummary.draft_count ?? 0)} icon={FileText} iconBg="bg-slate-500/10 text-slate-600" />
              <KpiCard label="Sent" value={String(viewSummary.sent_count ?? 0)} icon={Send} iconBg="bg-blue-500/10 text-blue-600" />
            </>
          )}
          {currentView === "awaiting_payment" && (
            <>
              <KpiCard label="Total AR" value={formatCurrency(Number(viewSummary.total_ar ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Overdue Amount" value={formatCurrency(Number(viewSummary.overdue_amount ?? 0))} icon={AlertTriangle} iconBg={Number(viewSummary.overdue_amount ?? 0) > 0 ? "bg-red-500/10 text-red-600" : "bg-slate-500/10 text-slate-600"} />
              <KpiCard label="Avg Days Outstanding" value={viewSummary.avg_days_outstanding != null ? `${viewSummary.avg_days_outstanding}d` : "\u2014"} icon={Clock} iconBg="bg-amber-500/10 text-amber-600" />
              <KpiCard label="In Fulfillment" value={String(viewSummary.order_count ?? 0)} icon={Truck} iconBg="bg-purple-500/10 text-purple-600" />
            </>
          )}
          {currentView === "paid_closed" && (
            <>
              <KpiCard label="Total Collected" value={formatCurrency(Number(viewSummary.total_collected ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Days to Pay" value={viewSummary.avg_days_to_pay != null ? `${viewSummary.avg_days_to_pay}d` : "\u2014"} icon={Clock} iconBg="bg-amber-500/10 text-amber-600" />
              <KpiCard label="Collection Rate" value={viewSummary.collection_rate != null ? `${viewSummary.collection_rate}%` : "\u2014"} icon={Target} iconBg="bg-violet-500/10 text-violet-600" />
              <KpiCard label="Paid Invoices" value={String(viewSummary.order_count ?? 0)} icon={ShoppingCart} iconBg="bg-blue-500/10 text-blue-600" />
            </>
          )}
          {currentView === "voided" && (
            <>
              <KpiCard label="Voided Count" value={String(viewSummary.voided_count ?? 0)} icon={Ban} iconBg="bg-red-500/10 text-red-600" />
              <KpiCard label="Total Voided Value" value={formatCurrency(Number(viewSummary.total_voided_value ?? 0))} icon={DollarSign} iconBg="bg-red-500/10 text-red-600" />
            </>
          )}
          {currentView === "overdue" && (
            <>
              <KpiCard label="Total Overdue" value={formatCurrency(Number(viewSummary.total_overdue ?? 0))} icon={AlertTriangle} iconBg="bg-red-500/10 text-red-600" />
              <KpiCard label="Avg Days Overdue" value={viewSummary.avg_days_overdue != null ? `${viewSummary.avg_days_overdue}d` : "\u2014"} icon={Clock} iconBg="bg-amber-500/10 text-amber-600" />
              <KpiCard label="Overdue Count" value={String(viewSummary.count ?? 0)} icon={FileText} iconBg="bg-red-500/10 text-red-600" />
              <KpiCard label="Highest Overdue" value={formatCurrency(Number(viewSummary.highest_overdue ?? 0))} icon={DollarSign} iconBg="bg-red-500/10 text-red-600" />
            </>
          )}
          {currentView === "all" && (
            <>
              <KpiCard label="Total Invoices" value={String(viewSummary.total_invoices ?? 0)} icon={ShoppingCart} iconBg="bg-blue-500/10 text-blue-600" />
              <KpiCard label="Total Outstanding" value={formatCurrency(Number(viewSummary.total_outstanding ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Total Collected" value={formatCurrency(Number(viewSummary.total_collected ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Overdue" value={String(viewSummary.overdue_count ?? 0)} icon={AlertTriangle} iconBg={Number(viewSummary.overdue_count ?? 0) > 0 ? "bg-red-500/10 text-red-600" : "bg-slate-500/10 text-slate-600"} />
            </>
          )}
        </div>
      )}

      {/* Pipeline Bar (only for open_invoices) */}
      {currentView === "open_invoices" && viewSummary && (
        <InvoicePipelineBar
          invoicesByStatus={{
            DRAFT: viewSummary.draft_count ?? 0,
            SENT: viewSummary.sent_count ?? 0,
          }}
          totalOutstanding={Number(viewSummary.total_outstanding ?? 0)}
        />
      )}

      {/* Search & Filters + Table */}
      <section className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="app-input w-full pl-9" placeholder="Search invoice #, customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className={`app-button-secondary relative ${activeFilterCount > 0 ? "border-primary text-primary" : ""}`} onClick={() => setShowFilters((p) => !p)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button className="text-xs text-muted hover:text-foreground" onClick={clearFilters}>
              <X className="mr-0.5 inline h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-3 rounded-lg border border-border/60 bg-surface p-4">
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1 text-sm"><span className="text-xs font-medium text-muted">From</span><input type="date" className="app-input w-44" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="text-xs font-medium text-muted">To</span><input type="date" className="app-input w-44" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="app-skeleton h-12 rounded-lg" style={{ width: `${100 - i * 3}%` }} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && invoices && invoices.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted/30" />
            <p className="mt-3 font-semibold">No invoices found</p>
            <p className="mt-1 text-sm text-muted">
              {activeFilterCount > 0 ? "Try adjusting your filters or switching views." : currentView !== "all" ? "No invoices match this view. Try switching to All Invoices." : "Create your first invoice to get started."}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && invoices && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("invoice_number")}><span className="flex items-center gap-1">Invoice # <SortIcon col="invoice_number" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("customer_name")}><span className="flex items-center gap-1">Customer <SortIcon col="customer_name" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("status")}><span className="flex items-center gap-1">Status <SortIcon col="status" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("total")}><span className="flex items-center gap-1">Total <SortIcon col="total" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("amount_due")}><span className="flex items-center gap-1">Balance Due <SortIcon col="amount_due" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("issue_date")}><span className="flex items-center gap-1">Issue Date <SortIcon col="issue_date" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("due_date")}><span className="flex items-center gap-1">Due Date <SortIcon col="due_date" /></span></th>
                  <th className="px-4 py-3">Aging</th>
                  <th className="px-4 py-3">Lines</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: InvoiceListEnriched) => (
                  <tr key={inv.id} className="cursor-pointer border-b border-border/70 last:border-b-0 transition-colors hover:bg-secondary/60" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {inv.invoice_number}
                      {inv.sales_request_number && <span className="ml-1.5 inline-block rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">SO</span>}
                    </td>
                    <td className="px-4 py-3">{inv.customer_name}</td>
                    <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(Number(inv.total), true)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(Number(inv.amount_due), true)}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-3">
                      {inv.days_overdue != null && inv.days_overdue > 0 ? (
                        <span className="font-medium text-red-600">{inv.days_overdue}d overdue</span>
                      ) : inv.days_until_due != null ? (
                        <span className={inv.days_until_due <= 7 ? "text-amber-600 font-medium" : "text-muted"}>{inv.days_until_due}d</span>
                      ) : (
                        <span className="text-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{inv.line_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && !isLoading && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted">
              Showing <span className="font-medium text-foreground">{page * PAGE_SIZE + 1}</span>{"\u2013"}<span className="font-medium text-foreground">{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> of <span className="font-medium text-foreground">{totalCount}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button className="app-button-ghost px-2 py-1.5" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const pageNum = startPage + i;
                  if (pageNum >= totalPages) return null;
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)} className={`h-8 w-8 rounded text-sm font-medium transition-colors ${pageNum === page ? "bg-primary text-white" : "text-muted hover:bg-secondary"}`}>{pageNum + 1}</button>
                  );
                })}
                <button className="app-button-ghost px-2 py-1.5" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
