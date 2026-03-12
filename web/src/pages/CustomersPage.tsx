import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileUp,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  useCreateCustomer,
  useCustomersEnriched,
  type CustomerFilters,
  type CustomerListItem,
} from "../hooks/useCustomers";
import TierBadge from "../components/customers/TierBadge";
import PaymentScoreBadge from "../components/customers/PaymentScoreBadge";
import { formatCompact, formatCurrency } from "../utils/formatters";

const TIERS = ["ALL", "PLATINUM", "GOLD", "SILVER", "BRONZE", "STANDARD"];
const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "true" },
  { label: "Archived", value: "false" },
];

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  billing_address: "",
  shipping_address: "",
  notes: "",
  tier: "STANDARD",
  is_active: true,
};

type CustomerListApiRecord = CustomerListItem & {
  totalRevenue?: number | string;
  ytd_revenue?: number | string;
  ytdRevenue?: number | string;
  outstanding?: number | string;
  outstandingAr?: number | string;
  invoiceCount?: number;
  paymentScore?: "good" | "average" | "slow" | "at-risk";
  lastInvoiceDate?: string | null;
  isActive?: boolean;
};

type NormalizedCustomerRow = CustomerListItem;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeCustomerRow = (row: CustomerListApiRecord): NormalizedCustomerRow => ({
  ...row,
  is_active: row.is_active ?? row.isActive ?? true,
  total_revenue: toNumber(row.total_revenue ?? row.ytd_revenue ?? row.ytdRevenue ?? row.totalRevenue),
  outstanding_ar: toNumber(row.outstanding_ar ?? row.outstanding ?? row.outstandingAr),
  invoice_count: row.invoice_count ?? row.invoiceCount ?? 0,
  payment_score: row.payment_score ?? row.paymentScore ?? "good",
  last_invoice_date: row.last_invoice_date ?? row.lastInvoiceDate ?? null,
});

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

  const filters: CustomerFilters = useMemo(
    () => ({
      search: search || undefined,
      tier: tierFilter !== "ALL" ? tierFilter : undefined,
      is_active: statusFilter ? statusFilter === "true" : undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [search, tierFilter, statusFilter, sortBy, sortDir],
  );

  const { data: customers, isLoading } = useCustomersEnriched(filters);
  const createMutation = useCreateCustomer();

  const normalizedCustomers = useMemo(
    () => (customers ?? []).map((row) => normalizeCustomerRow(row as CustomerListApiRecord)),
    [customers],
  );

  const kpis = useMemo(
    () => ({
      customers: normalizedCustomers.length,
      ytdRevenue: normalizedCustomers.reduce((sum, row) => sum + toNumber(row.total_revenue), 0),
      outstandingAr: normalizedCustomers.reduce((sum, row) => sum + toNumber(row.outstanding_ar), 0),
      atRisk: normalizedCustomers.filter((row) => row.payment_score === "at-risk").length,
    }),
    [normalizedCustomers],
  );

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir(column === "name" ? "asc" : "desc");
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Customers</p>
          <h1 className="text-2xl font-bold">Customer Ledger</h1>
          <p className="text-sm text-muted">Manage, segment, and analyze your customer portfolio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={() => navigate("/sales/customers/import")}>
            <FileUp className="h-4 w-4" /> Import
          </button>
          <button className="app-button" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> New Customer
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="app-card p-4">
              <div className="mb-2 h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-7 w-28 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Customers (filtered)</p>
              <p className="text-lg font-bold">{kpis.customers}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/20">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted">YTD Revenue</p>
              <p className="text-lg font-bold">{formatCompact(kpis.ytdRevenue)}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Outstanding A/R</p>
              <p className="text-lg font-bold">{formatCompact(kpis.outstandingAr)}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted">At Risk</p>
              <p className="text-lg font-bold">{kpis.atRisk}</p>
            </div>
          </div>
        </div>
      )}

      <div className="app-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder="Search by name or email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button
            className={`app-button-secondary flex items-center gap-1.5 ${showFilters ? "ring-2 ring-primary/30" : ""}`}
            onClick={() => setShowFilters((current) => !current)}
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
              onClick={() => {
                setTierFilter("ALL");
                setStatusFilter("");
              }}
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
                {TIERS.map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      tierFilter === tier
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Status</label>
              <div className="mt-1 flex gap-1">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      statusFilter === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

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
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">Payment</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">Last Invoice</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-5 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </td>
                  </tr>
                ))}
              {normalizedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer border-b transition hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                  onClick={() => navigate(`/sales/customers/${customer.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{customer.name}</span>
                          <TierBadge tier={customer.tier} />
                          {!customer.is_active && (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted">{customer.email || customer.phone || "No contact info"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(customer.total_revenue)}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${customer.outstanding_ar > 0 ? "text-amber-600" : ""}`}>
                    {formatCurrency(customer.outstanding_ar)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{customer.invoice_count}</td>
                  <td className="px-4 py-3 text-center">
                    <PaymentScoreBadge score={customer.payment_score} />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted tabular-nums">
                    {customer.last_invoice_date ? new Date(customer.last_invoice_date).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
              {!isLoading && normalizedCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                        <Users className="h-6 w-6 text-muted" />
                      </div>
                      <p className="font-semibold">No customers found</p>
                      <p className="text-sm text-muted">Try adjusting your filters or import/create a new customer.</p>
                      <div className="mt-2 flex flex-wrap justify-center gap-2">
                        <button className="app-button-secondary" onClick={() => navigate("/sales/customers/import")}>
                          <FileUp className="h-4 w-4" /> Import Customers
                        </button>
                        <button className="app-button" onClick={() => setShowForm(true)}>
                          <Plus className="h-4 w-4" /> Create Customer
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-20 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="app-card w-full max-w-lg p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Customer</h2>
              <button className="app-button-ghost" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="app-input" placeholder="Name *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <input className="app-input" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className="app-input" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <select className="app-input" value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })}>
                {TIERS.filter((tier) => tier !== "ALL").map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
              <input className="app-input sm:col-span-2" placeholder="Billing address" value={form.billing_address} onChange={(event) => setForm({ ...form, billing_address: event.target.value })} />
              <input className="app-input sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
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
