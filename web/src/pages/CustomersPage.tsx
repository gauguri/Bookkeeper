import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Activity,
  ArrowUpDown,
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileUp,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  useArchiveCustomer,
  useCreateCustomer,
  useCustomersEnriched,
  useCustomersIntelligence,
  type CustomerFilters,
  type CustomerListItem,
} from "../hooks/useCustomers";
import TierBadge from "../components/customers/TierBadge";
import PaymentScoreBadge from "../components/customers/PaymentScoreBadge";
import { formatCompact, formatCurrency, formatPercent } from "../utils/formatters";

const TIERS = ["ALL", "PLATINUM", "GOLD", "SILVER", "BRONZE", "STANDARD"];
const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "true" },
  { label: "Archived", value: "false" },
];

const PERIOD_OPTIONS = [
  { label: "MTD", value: "mtd" },
  { label: "QTD", value: "qtd" },
  { label: "YTD", value: "ytd" },
  { label: "Last 12M", value: "ltm" },
] as const;

const CHART_COLORS = ["#2563eb", "#059669", "#f59e0b", "#ef4444", "#7c3aed"];

const emptyForm = {
  customer_number: "",
  name: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  zip_code: "",
  email: "",
  phone: "",
  fax_number: "",
  primary_contact: "",
  credit_limit: "",
  shipping_method: "",
  payment_terms: "",
  upload_to_peach: false,
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
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const [intelligencePeriod, setIntelligencePeriod] = useState<"mtd" | "qtd" | "ytd" | "ltm">("ytd");
  const selectAllRef = useRef<HTMLInputElement>(null);

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
  const { data: intelligence, isLoading: intelligenceLoading } = useCustomersIntelligence(intelligencePeriod, 5);
  const createMutation = useCreateCustomer();
  const archiveCustomerMutation = useArchiveCustomer();

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
  const visibleCustomerIds = useMemo(() => normalizedCustomers.map((customer) => customer.id), [normalizedCustomers]);
  const allVisibleSelected = visibleCustomerIds.length > 0 && visibleCustomerIds.every((id) => selectedRows.includes(id));
  const someVisibleSelected = visibleCustomerIds.some((id) => selectedRows.includes(id));
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === intelligencePeriod)?.label ?? "YTD";

  const trendChartData = useMemo(() => {
    if (!intelligence?.trend?.length) return [];
    const grouped = new Map<string, Record<string, string | number>>();
    intelligence.trend.forEach((point) => {
      const bucket = grouped.get(point.period) ?? { period: point.period };
      bucket[point.customer_name] = Number(point.revenue ?? 0);
      grouped.set(point.period, bucket);
    });
    return Array.from(grouped.values()).map((row) => ({
      ...row,
      label: new Date(`${String(row.period)}-01`).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    }));
  }, [intelligence]);

  const growthLeader = intelligence?.fastest_growing?.[0] ?? null;
  const declineLeader = intelligence?.biggest_declines?.[0] ?? null;
  const overdueLeader = intelligence?.largest_overdue?.[0] ?? null;

  const intelligenceCards = [
    {
      label: `Fastest Growing ${selectedPeriodLabel}`,
      icon: TrendingUp,
      tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20",
      row: growthLeader,
      value: growthLeader?.change_percent != null ? `${growthLeader.change_percent > 0 ? "+" : ""}${growthLeader.change_percent.toFixed(0)}%` : "—",
      meta: growthLeader ? formatCurrency(growthLeader.revenue) : "No growth signal yet",
    },
    {
      label: "Biggest Decline",
      icon: TrendingDown,
      tint: "bg-amber-50 text-amber-700 dark:bg-amber-900/20",
      row: declineLeader,
      value: declineLeader?.change_percent != null ? `${declineLeader.change_percent.toFixed(0)}%` : "—",
      meta: declineLeader ? formatCurrency(declineLeader.revenue) : "No decline signal yet",
    },
    {
      label: "Largest Overdue",
      icon: AlertTriangle,
      tint: "bg-red-50 text-red-700 dark:bg-red-900/20",
      row: overdueLeader,
      value: overdueLeader ? formatCurrency(overdueLeader.overdue_amount) : "—",
      meta: overdueLeader ? `${formatCurrency(overdueLeader.outstanding_ar)} total open` : "Nothing overdue",
    },
    {
      label: "Dormant Customers",
      icon: Boxes,
      tint: "bg-violet-50 text-violet-700 dark:bg-violet-900/20",
      row: intelligence?.dormant_customers?.[0] ?? null,
      value: String(intelligence?.dormant_count ?? 0),
      meta: intelligence?.dormant_customers?.length ? "Top dormant accounts by value" : "No dormant accounts surfaced",
    },
    {
      label: "Top 10 Concentration",
      icon: BarChart3,
      tint: "bg-blue-50 text-blue-700 dark:bg-blue-900/20",
      row: null,
      value: intelligence ? formatPercent(intelligence.concentration.top_10_share_percent, 0) : "—",
      meta: intelligence ? `Top customer ${formatPercent(intelligence.concentration.top_customer_share_percent, 0)}` : "No concentration data",
    },
    {
      label: "Collections Priority",
      icon: Activity,
      tint: "bg-orange-50 text-orange-700 dark:bg-orange-900/20",
      row: intelligence?.collections_priority?.[0] ?? null,
      value: String(intelligence?.collections_priority_count ?? 0),
      meta: intelligence?.collections_priority?.length ? "Highest overdue revenue accounts" : "No priority collections accounts",
    },
  ];

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      const composedAddress = [
        [form.address_line_1.trim(), form.address_line_2.trim()].filter(Boolean).join(", "),
        [form.city.trim(), form.state.trim()].filter(Boolean).join(", "),
        form.zip_code.trim(),
      ].filter(Boolean).join(" ").replace(/\s+,/g, ",");
      await createMutation.mutateAsync({
        ...form,
        customer_number: form.customer_number.trim() || undefined,
        name: form.name.trim(),
        address_line_1: form.address_line_1.trim() || undefined,
        address_line_2: form.address_line_2.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip_code: form.zip_code.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        fax_number: form.fax_number.trim() || undefined,
        primary_contact: form.primary_contact.trim() || undefined,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
        shipping_method: form.shipping_method.trim() || undefined,
        payment_terms: form.payment_terms.trim() || undefined,
        billing_address: composedAddress || undefined,
        shipping_address: composedAddress || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const toggleSelectAllVisible = () => {
    setSelectedRows((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleCustomerIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleCustomerIds]));
    });
  };

  const toggleCustomerSelection = (customerId: number) => {
    setSelectedRows((prev) => (prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]));
  };

  const deleteSelectedCustomers = async () => {
    if (selectedRows.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedRows.length} selected customer${selectedRows.length === 1 ? "" : "s"}? Referenced customers will fail and remain in place.`,
    );
    if (!confirmed) return;

    setFormError("");
    try {
      const results = await Promise.allSettled(
        selectedRows.map((id) => archiveCustomerMutation.mutateAsync(id)),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      const deleted = results.length - failed;
      setSelectedRows([]);
      if (failed > 0) {
        setFormError(
          `${failed} customer${failed === 1 ? "" : "s"} could not be deleted because they are referenced by other records.`,
        );
      }
      if (deleted > 0) {
        setToast(`${deleted} customer${deleted === 1 ? "" : "s"} deleted`);
      }
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

      {toast ? <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{toast}</div> : null}
      {formError && !showForm ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{formError}</div> : null}

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

      <div className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Customer Intelligence</p>
            <h2 className="text-lg font-semibold">Growth, collections, dormancy, and concentration</h2>
            <p className="text-sm text-muted">See who is accelerating, who is slipping, and where collections or concentration risk needs attention.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  intelligencePeriod === option.value
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted hover:bg-secondary"
                }`}
                onClick={() => setIntelligencePeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {intelligenceCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                type="button"
                className="app-card flex items-start gap-3 p-4 text-left transition hover:border-primary/30 hover:shadow-sm disabled:cursor-default"
                onClick={() => card.row && navigate(`/sales/customers/${card.row.customer_id}`)}
                disabled={!card.row}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${card.tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{card.label}</p>
                  <p className="mt-1 text-xl font-bold">{card.value}</p>
                  <p className="mt-1 truncate text-sm font-medium">{card.row?.customer_name ?? "Overview metric"}</p>
                  <p className="mt-1 text-xs text-muted">{card.row?.customer_number ? `#${card.row.customer_number} · ` : ""}{card.meta}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="app-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">Top Customer Revenue Trend</p>
              <p className="text-xs text-muted">Monthly revenue trend for the current leading customers.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, true)} />
                  {intelligence?.trend
                    ? Array.from(new Set(intelligence.trend.map((point) => point.customer_name))).slice(0, 5).map((customerName, index) => (
                      <Line
                        key={customerName}
                        type="monotone"
                        dataKey={customerName}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))
                    : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">Revenue Concentration</p>
              <p className="text-xs text-muted">How dependent the book is on a handful of customers.</p>
            </div>
            <div className="space-y-3">
              {[
                { label: "Top Customer Share", value: intelligence ? formatPercent(intelligence.concentration.top_customer_share_percent, 1) : "—" },
                { label: "Top 5 Share", value: intelligence ? formatPercent(intelligence.concentration.top_5_share_percent, 1) : "—" },
                { label: "Top 10 Share", value: intelligence ? formatPercent(intelligence.concentration.top_10_share_percent, 1) : "—" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="app-card p-4">
            <div className="mb-3">
              <p className="font-semibold">Growth and Decline Watchlist</p>
              <p className="text-xs text-muted">Customers to expand, protect, or re-engage.</p>
            </div>
            <div className="space-y-3">
              {[
                { title: "Fastest Growing Customers", rows: intelligence?.fastest_growing ?? [], positive: true },
                { title: "Biggest Revenue Declines", rows: intelligence?.biggest_declines ?? [], positive: false },
              ].map((section) => (
                <div key={section.title}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted">{section.title}</p>
                  <div className="space-y-2">
                    {section.rows.length ? section.rows.map((row) => (
                      <button
                        key={`${section.title}-${row.customer_id}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-secondary/40"
                        onClick={() => navigate(`/sales/customers/${row.customer_id}`)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.customer_name}</p>
                          <p className="text-xs text-muted">{row.customer_number ? `#${row.customer_number}` : "No customer number"} · {formatCurrency(row.revenue)}</p>
                        </div>
                        <span className={`text-sm font-semibold ${section.positive ? "text-emerald-600" : "text-rose-600"}`}>
                          {row.change_percent != null ? `${row.change_percent > 0 ? "+" : ""}${row.change_percent.toFixed(0)}%` : "—"}
                        </span>
                      </button>
                    )) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">No movement signal yet for this period.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3">
              <p className="font-semibold">Collections and Re-Engagement</p>
              <p className="text-xs text-muted">Who needs collection action now, and who has gone quiet.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Collections Priority",
                  subtitle: "Overdue customers with current-period revenue and open exposure",
                  rows: intelligence?.collections_priority ?? [],
                  showOverdue: true,
                },
                {
                  title: "Dormant Customers",
                  subtitle: "Previously active accounts with no invoice in the last 180 days",
                  rows: intelligence?.dormant_customers ?? [],
                  showOverdue: false,
                },
              ].map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{section.title}</p>
                  <p className="mb-2 mt-1 text-xs text-muted">{section.subtitle}</p>
                  <div className="space-y-2">
                    {section.rows.length ? section.rows.map((row) => (
                      <button
                        key={`${section.title}-${row.customer_id}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-secondary/40"
                        onClick={() => navigate(`/sales/customers/${row.customer_id}`)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.customer_name}</p>
                          <p className="text-xs text-muted">{row.customer_number ? `#${row.customer_number}` : "No customer number"} · {row.last_invoice_date ? new Date(row.last_invoice_date).toLocaleDateString() : "No invoice date"}</p>
                        </div>
                        <span className="text-sm font-semibold">
                          {section.showOverdue ? formatCurrency(row.overdue_amount) : formatCurrency(row.revenue)}
                        </span>
                      </button>
                    )) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">Nothing surfaced here for the current data set.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {intelligenceLoading ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
            Loading customer intelligence...
          </div>
        ) : null}
      </div>

      <div className="app-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder="Search by customer, contact, phone, or email..."
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
          {selectedRows.length > 0 && (
            <button className="app-button-secondary text-danger" onClick={() => void deleteSelectedCustomers()}>
              Delete Selected
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
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-gray-800/50">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible customers"
                  />
                </th>
                <th className="w-[46%] px-4 py-3 text-left">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("name")}>
                    Customer <SortIcon col="name" />
                  </button>
                </th>
                <th className="w-24 px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("total_revenue")}>
                    YTD Revenue <SortIcon col="total_revenue" />
                  </button>
                </th>
                <th className="w-28 px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("outstanding_ar")}>
                    Outstanding <SortIcon col="outstanding_ar" />
                  </button>
                </th>
                <th className="w-20 px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("invoice_count")}>
                    Invoices <SortIcon col="invoice_count" />
                  </button>
                </th>
                <th className="w-24 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">Payment</th>
                <th className="w-28 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">Last Invoice</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b">
                    <td colSpan={7} className="px-4 py-4">
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
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(customer.id)}
                      onChange={() => toggleCustomerSelection(customer.id)}
                      aria-label={`Select customer ${customer.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 max-w-full">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{customer.name}</span>
                          <TierBadge tier={customer.tier} />
                          {customer.payment_terms ? (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted">
                              {customer.payment_terms}
                            </span>
                          ) : null}
                          {!customer.is_active && (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {[customer.customer_number ? `#${customer.customer_number}` : "", customer.primary_contact || "", customer.email || customer.phone || ""]
                            .filter(Boolean)
                            .join(" | ") || "No contact info"}
                        </p>
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
                  <td className="whitespace-nowrap px-4 py-3 text-center text-xs text-muted tabular-nums">
                    {customer.last_invoice_date ? new Date(customer.last_invoice_date).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
              {!isLoading && normalizedCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
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
          <div className="app-card w-full max-w-4xl p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Customer</h2>
              <button className="app-button-ghost" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input className="app-input" placeholder="Customer Number" value={form.customer_number} onChange={(event) => setForm({ ...form, customer_number: event.target.value })} />
              <input className="app-input lg:col-span-2" placeholder="Customer Name *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <input className="app-input" placeholder="Address Line 1" value={form.address_line_1} onChange={(event) => setForm({ ...form, address_line_1: event.target.value })} />
              <input className="app-input" placeholder="Address Line 2" value={form.address_line_2} onChange={(event) => setForm({ ...form, address_line_2: event.target.value })} />
              <input className="app-input" placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
              <input className="app-input" placeholder="State" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
              <input className="app-input" placeholder="Zip Code" value={form.zip_code} onChange={(event) => setForm({ ...form, zip_code: event.target.value })} />
              <input className="app-input" placeholder="Telephone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <input className="app-input" placeholder="Fax Number" value={form.fax_number} onChange={(event) => setForm({ ...form, fax_number: event.target.value })} />
              <input className="app-input" placeholder="Primary Contact" value={form.primary_contact} onChange={(event) => setForm({ ...form, primary_contact: event.target.value })} />
              <input className="app-input" placeholder="Customer Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className="app-input" placeholder="Credit Limit" type="number" min="0" step="0.01" value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} />
              <input className="app-input" placeholder="Shipping Method" value={form.shipping_method} onChange={(event) => setForm({ ...form, shipping_method: event.target.value })} />
              <input className="app-input" placeholder="Payment Terms" value={form.payment_terms} onChange={(event) => setForm({ ...form, payment_terms: event.target.value })} />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={form.upload_to_peach} onChange={(event) => setForm({ ...form, upload_to_peach: event.target.checked })} />
                UploadtoPeach
              </label>
              <textarea className="app-input min-h-24 sm:col-span-2 lg:col-span-3" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
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
