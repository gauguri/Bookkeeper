import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Users, DollarSign, AlertTriangle, ChevronDown, ChevronUp,
  ArrowUpDown, SlidersHorizontal, X,
} from "lucide-react";
import {
  useCustomersEnriched, useCustomersSummary, useCreateCustomer,
  type CustomerFilters, type CustomerListItem,
} from "../hooks/useCustomers";
import { formatCurrency, formatCompact } from "../utils/formatters";
import TierBadge from "../components/customers/TierBadge";
import PaymentScoreBadge from "../components/customers/PaymentScoreBadge";

const TIERS = ["ALL", "PLATINUM", "GOLD", "SILVER", "BRONZE", "STANDARD"];
const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "true" },
  { label: "Archived", value: "false" },
];

const emptyForm = {
  name: "", email: "", phone: "", billing_address: "", shipping_address: "",
  notes: "", tier: "STANDARD", is_active: true,
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const filters: CustomerFilters = useMemo(() => ({
    search: search || undefined,
    tier: tierFilter !== "ALL" ? tierFilter : undefined,
    is_active: statusFilter ? statusFilter === "true" : undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [search, tierFilter, statusFilter, sortBy, sortDir]);

  const { data: summary } = useCustomersSummary();
  const { data: customers, isLoading } = useCustomersEnriched(filters);
  const createMutation = useCreateCustomer();

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />;
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    try {
      await createMutation.mutateAsync(form);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  return (
    <section className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Customers</p>
          <h1 className="text-2xl font-bold">Customer Ledger</h1>
          <p className="text-sm text-muted">Manage, segment, and analyze your customer portfolio.</p>
        </div>
        <button className="app-button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Customer
        </button>
      </div>

      {/* ── Summary KPI Bar ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Customers</p>
              <p className="text-lg font-bold">{summary.active_customers}<span className="text-xs font-normal text-muted">/{summary.total_customers}</span></p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/20">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted">YTD Revenue</p>
              <p className="text-lg font-bold">{formatCompact(summary.total_revenue_ytd)}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Outstanding A/R</p>
              <p className="text-lg font-bold">{formatCompact(summary.total_outstanding_ar)}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted">At Risk</p>
              <p className="text-lg font-bold">{summary.customers_at_risk}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filters ── */}
      <div className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`app-button-secondary flex items-center gap-1.5 ${showFilters ? "ring-2 ring-primary/30" : ""}`}
            onClick={() => setShowFilters((p) => !p)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {(tierFilter !== "ALL" || statusFilter) && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {(tierFilter !== "ALL" ? 1 : 0) + (statusFilter ? 1 : 0)}
              </span>
            )}
          </button>
          {(tierFilter !== "ALL" || statusFilter) && (
            <button
              className="app-button-ghost text-xs"
              onClick={() => { setTierFilter("ALL"); setStatusFilter(""); }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-4 rounded-xl border p-3">
            <div>
              <label className="text-xs font-medium text-muted">Tier</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTierFilter(t)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      tierFilter === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Status</label>
              <div className="mt-1 flex gap-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      statusFilter === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Customer Table ── */}
      <div className="app-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("name")}>
                    Customer <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("total_revenue")}>
                    YTD Revenue <SortIcon col="total_revenue" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("outstanding_ar")}>
                    Outstanding <SortIcon col="outstanding_ar" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("invoice_count")}>
                    Invoices <SortIcon col="invoice_count" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  Payment
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  Last Invoice
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-5 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </td>
                  </tr>
                ))
              )}
              {customers?.map((c) => (
                <tr
                  key={c.id}
                  className="border-b last:border-0 cursor-pointer transition hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                  onClick={() => navigate(`/sales/customers/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{c.name}</span>
                          <TierBadge tier={c.tier} />
                          {!c.is_active && (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate">{c.email || c.phone || "No contact info"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(c.total_revenue)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${c.outstanding_ar > 0 ? "text-amber-600" : ""}`}>
                    {formatCurrency(c.outstanding_ar)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.invoice_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PaymentScoreBadge score={c.payment_score} />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted tabular-nums">
                    {c.last_invoice_date ? new Date(c.last_invoice_date).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {!isLoading && (!customers || customers.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                        <Users className="h-6 w-6 text-muted" />
                      </div>
                      <p className="font-semibold">No customers found</p>
                      <p className="text-sm text-muted">Try adjusting your filters or create a new customer.</p>
                      <button className="app-button" onClick={() => setShowForm(true)}>
                        <Plus className="h-4 w-4" /> Create Customer
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Customer Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-20" onClick={() => setShowForm(false)}>
          <div className="app-card w-full max-w-lg p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Customer</h2>
              <button className="app-button-ghost" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="app-input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="app-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="app-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <select className="app-input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {TIERS.filter((t) => t !== "ALL").map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="app-input sm:col-span-2" placeholder="Billing address" value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} />
              <input className="app-input sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="app-button-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="app-button" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
