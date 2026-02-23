import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  CreditCard,
  Banknote,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  Clock,
} from "lucide-react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";
import { formatCurrency } from "../utils/formatters";
import PaymentMethodBadge from "../components/payments/PaymentMethodBadge";
import {
  usePaymentsEnriched,
  usePaymentsViewSummary,
  type PaymentFilters,
  type PaymentListEnriched,
} from "../hooks/usePayments";

/* ── Deep-link types ── */

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer: { id: number; name: string };
  status: string;
  amount_due: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── List View definitions ── */

type ListView = {
  id: string;
  label: string;
  recentDays?: number;
  largeOnly?: boolean;
};

const LIST_VIEWS: ListView[] = [
  { id: "recent", label: "Recent", recentDays: 30 },
  { id: "by_method", label: "By Method" },
  { id: "all_payments", label: "All Payments" },
  { id: "large_payments", label: "Large Payments", largeOnly: true },
];

const METHODS = ["Cash", "Check", "ACH", "Card", "Wire"];

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

export default function PaymentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const invoiceIdParam = searchParams.get("invoiceId");

  // View & pagination
  const [currentView, setCurrentView] = useState("recent");
  const [page, setPage] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("payment_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    invoice_id: "",
    amount: "",
    payment_date: todayISO(),
    method: "",
    notes: "",
  });

  // Active view config
  const activeView = LIST_VIEWS.find((v) => v.id === currentView) ?? LIST_VIEWS[0];

  // Build filter for React Query
  const filters: PaymentFilters = useMemo(
    () => ({
      search: search || undefined,
      method: currentView === "by_method" && methodFilter ? methodFilter : undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      recent_days: activeView.recentDays,
      large_only: activeView.largeOnly,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [search, currentView, methodFilter, sortBy, sortDir, dateFrom, dateTo, activeView, page],
  );

  // Data hooks
  const { data: viewSummary } = usePaymentsViewSummary(currentView);
  const { data: paginatedData, isLoading } = usePaymentsEnriched(filters);
  const payments = paginatedData?.items;
  const totalCount = paginatedData?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Deep link support
  useEffect(() => {
    const hydrate = async () => {
      if (!invoiceIdParam) {
        setInvoice(null);
        setForm((p) => ({ ...p, invoice_id: "", amount: "" }));
        return;
      }
      const pid = Number(invoiceIdParam);
      if (!Number.isInteger(pid) || pid <= 0) {
        setError("Invalid invoice link.");
        return;
      }
      try {
        const inv = await apiFetch<InvoiceDetail>(`/invoices/${pid}`);
        const due = Math.max(Number(inv.amount_due) || 0, 0);
        setInvoice(inv);
        setForm((p) => ({ ...p, invoice_id: String(inv.id), amount: due.toFixed(2), payment_date: p.payment_date || todayISO() }));
        setShowCreate(true);
        setError("");
      } catch {
        setError("Invoice from link was not found.");
      }
    };
    hydrate();
  }, [invoiceIdParam]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, sortBy, sortDir, methodFilter]);

  const handleViewChange = (viewId: string) => {
    setCurrentView(viewId);
    setPage(0);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setMethodFilter("");
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "customer_name" || col === "invoice_number" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (search ? 1 : 0) + (methodFilter ? 1 : 0);
  const clearFilters = () => { setDateFrom(""); setDateTo(""); setSearch(""); setMethodFilter(""); setPage(0); };

  const selectedInvoiceDisplay = useMemo(() => {
    if (!invoice) return null;
    return { customerName: invoice.customer?.name ?? "\u2014", number: invoice.invoice_number, amountDue: invoice.amount_due };
  }, [invoice]);

  const submitPayment = async () => {
    if (!form.invoice_id || !form.amount || !form.payment_date) { setError("Invoice, amount, and payment date are required."); return; }
    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          invoice_id: Number(form.invoice_id), amount: Number(form.amount),
          payment_date: form.payment_date, method: form.method || null, notes: form.notes || null,
        }),
      });
      setForm({ invoice_id: form.invoice_id, amount: "", payment_date: todayISO(), method: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      if (invoice) {
        const refreshed = await apiFetch<InvoiceDetail>(`/invoices/${invoice.id}`);
        const due = Math.max(Number(refreshed.amount_due) || 0, 0);
        setInvoice(refreshed);
        setForm((p) => ({ ...p, amount: due.toFixed(2) }));
      }
      setError("");
    } catch (err) { setError((err as Error).message); }
  };

  // Top method from breakdown
  const topMethod = useMemo(() => {
    const bd = viewSummary?.methods_breakdown as Record<string, number> | undefined;
    if (!bd) return null;
    const entries = Object.entries(bd).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? entries[0][0] : null;
  }, [viewSummary]);

  /* ========== RENDER ========== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Payments</h2>
          <p className="text-sm text-muted">Record payments against invoices and keep balances up to date.</p>
        </div>
        <button className="app-button" onClick={() => setShowCreate((p) => !p)}>
          <Plus className="h-4 w-4" /> Record Payment
        </button>
      </header>

      {error && <section className="app-card text-sm text-danger p-4">{error}</section>}

      {/* Deep link indicator */}
      {selectedInvoiceDisplay && (
        <div className="app-card border-primary/30 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Deep link</p>
          <h3 className="mt-2 text-lg font-semibold">Record Payment for Invoice {selectedInvoiceDisplay.number}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
            <div><p className="text-xs uppercase tracking-wide text-muted">Customer</p><p className="font-medium">{selectedInvoiceDisplay.customerName}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted">Invoice</p><p className="font-medium">{selectedInvoiceDisplay.number}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-muted">Balance due</p><p className="font-medium tabular-nums">{currency(selectedInvoiceDisplay.amountDue)}</p></div>
          </div>
        </div>
      )}

      {/* Payment form (collapsible) */}
      {showCreate && (
        <div id="payment-form" className="app-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Record payment</h3>
            <span className="app-badge border-primary/30 bg-primary/10 text-primary">New receipt</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="app-input" value={form.invoice_id} readOnly placeholder="Invoice ID" />
            <input className="app-input" type="number" min="0.01" step="0.01" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input className="app-input" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
            <select className="app-select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="">Method (optional)</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input className="app-input md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="app-button-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="app-button" onClick={submitPayment}>Record payment</button>
          </div>
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
          {currentView === "recent" && (
            <>
              <KpiCard label="Collected (30d)" value={formatCurrency(Number(viewSummary.total_collected_30d ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Payment Size" value={viewSummary.avg_payment_size != null ? formatCurrency(Number(viewSummary.avg_payment_size)) : "\u2014"} icon={TrendingUp} iconBg="bg-sky-500/10 text-sky-600" />
              <KpiCard label="Payments" value={String(viewSummary.payment_count ?? 0)} icon={Banknote} iconBg="bg-blue-500/10 text-blue-600" />
              <KpiCard label="Top Method" value={topMethod ?? "\u2014"} icon={CreditCard} iconBg="bg-purple-500/10 text-purple-600" />
            </>
          )}
          {currentView === "by_method" && (
            <>
              <KpiCard label="Total Collected" value={formatCurrency(Number(viewSummary.total_collected ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Payment" value={viewSummary.avg_payment_size != null ? formatCurrency(Number(viewSummary.avg_payment_size)) : "\u2014"} icon={TrendingUp} iconBg="bg-sky-500/10 text-sky-600" />
              <KpiCard label="Payments" value={String(viewSummary.payment_count ?? 0)} icon={Banknote} iconBg="bg-blue-500/10 text-blue-600" />
            </>
          )}
          {currentView === "all_payments" && (
            <>
              <KpiCard label="Total All-Time" value={formatCurrency(Number(viewSummary.total_all_time ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Payment" value={viewSummary.avg_payment != null ? formatCurrency(Number(viewSummary.avg_payment)) : "\u2014"} icon={TrendingUp} iconBg="bg-sky-500/10 text-sky-600" />
              <KpiCard label="Total Payments" value={String(viewSummary.payment_count ?? 0)} icon={Banknote} iconBg="bg-blue-500/10 text-blue-600" />
            </>
          )}
          {currentView === "large_payments" && (
            <>
              <KpiCard label="Largest Payment" value={formatCurrency(Number(viewSummary.largest_payment ?? 0))} icon={DollarSign} iconBg="bg-emerald-500/10 text-emerald-600" />
              <KpiCard label="Avg Large Payment" value={viewSummary.avg_large_payment != null ? formatCurrency(Number(viewSummary.avg_large_payment)) : "\u2014"} icon={TrendingUp} iconBg="bg-sky-500/10 text-sky-600" />
              <KpiCard label="Count" value={String(viewSummary.count ?? 0)} icon={Banknote} iconBg="bg-blue-500/10 text-blue-600" />
              <KpiCard label="Threshold" value={viewSummary.threshold != null ? formatCurrency(Number(viewSummary.threshold)) : "\u2014"} icon={Clock} iconBg="bg-amber-500/10 text-amber-600" />
            </>
          )}
        </div>
      )}

      {/* Search & Filters + Table */}
      <section className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="app-input w-full pl-9" placeholder="Search invoice #, customer, reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {currentView === "by_method" && (
            <select className="app-select w-36" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="">All methods</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
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
        {!isLoading && payments && payments.length === 0 && (
          <div className="py-12 text-center">
            <Banknote className="mx-auto h-12 w-12 text-muted/30" />
            <p className="mt-3 font-semibold">No payments found</p>
            <p className="mt-1 text-sm text-muted">
              {activeFilterCount > 0 ? "Try adjusting your filters or switching views." : currentView !== "all_payments" ? "No payments match this view. Try switching to All Payments." : "Record your first payment to get started."}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && payments && payments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("payment_date")}><span className="flex items-center gap-1">Date <SortIcon col="payment_date" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("invoice_number")}><span className="flex items-center gap-1">Invoice # <SortIcon col="invoice_number" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("customer_name")}><span className="flex items-center gap-1">Customer <SortIcon col="customer_name" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("method")}><span className="flex items-center gap-1">Method <SortIcon col="method" /></span></th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("amount")}><span className="flex items-center gap-1">Amount <SortIcon col="amount" /></span></th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pmt: PaymentListEnriched) => (
                  <tr key={pmt.id} className="cursor-pointer border-b border-border/70 last:border-b-0 transition-colors hover:bg-secondary/60" onClick={() => pmt.invoice_id && navigate(`/invoices/${pmt.invoice_id}`)}>
                    <td className="px-4 py-3 text-muted tabular-nums">{formatDate(pmt.payment_date)}</td>
                    <td className="px-4 py-3 font-semibold text-primary">{pmt.invoice_number ?? "\u2014"}</td>
                    <td className="px-4 py-3">{pmt.customer_name}</td>
                    <td className="px-4 py-3"><PaymentMethodBadge method={pmt.method} /></td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatCurrency(Number(pmt.amount), true)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(Number(pmt.applied_amount), true)}</td>
                    <td className="px-4 py-3 text-muted">{pmt.reference ?? "\u2014"}</td>
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
