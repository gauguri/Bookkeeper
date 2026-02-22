import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  SlidersHorizontal,
  X,
  Truck,
  Package,
} from "lucide-react";
import { apiFetch } from "../api";
import SalesRequestForm from "../components/SalesRequestForm";
import SalesOrderStatusBadge from "../components/sales-orders/SalesOrderStatusBadge";
import SalesOrderPipelineBar from "../components/sales-orders/SalesOrderPipelineBar";
import {
  useSalesRequestsSummary,
  useSalesRequestsEnriched,
  useSalesRequestsViewSummary,
  type SalesRequestFilters,
  type SalesRequestListEnriched,
} from "../hooks/useSalesRequests";
import { formatCurrency } from "../utils/formatters";

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };

/* ---------- List View definitions ---------- */

type ListView = {
  id: string;
  label: string;
  statusPreset?: string[];
  needsAttention?: boolean;
};

const LIST_VIEWS: ListView[] = [
  {
    id: "active_pipeline",
    label: "Active Pipeline",
    statusPreset: ["NEW", "QUOTED", "CONFIRMED"],
  },
  {
    id: "fulfillment",
    label: "Fulfillment",
    statusPreset: ["INVOICED", "SHIPPED"],
  },
  { id: "closed", label: "Closed / Won", statusPreset: ["CLOSED"] },
  { id: "all", label: "All Orders" },
  { id: "needs_attention", label: "Needs Attention", needsAttention: true },
];

const PAGE_SIZE = 25;

/* ---------- Helpers ---------- */

const URGENCY_STYLES: Record<string, string> = {
  overdue: "text-red-600 font-semibold",
  due_soon: "text-amber-600 font-medium",
  normal: "text-muted",
  none: "text-muted",
};

const formatDate = (value?: string | null) => {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString();
};

/* ---------- KPI Card helper ---------- */

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
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ========== Main component ========== */

export default function SalesRequestsPage() {
  const navigate = useNavigate();

  // View & pagination state
  const [currentView, setCurrentView] = useState("active_pipeline");
  const [page, setPage] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState("");

  // Active view config
  const activeView =
    LIST_VIEWS.find((v) => v.id === currentView) ?? LIST_VIEWS[0];

  // Build filter object for React Query
  const filters: SalesRequestFilters = useMemo(
    () => ({
      search: search || undefined,
      status: activeView.statusPreset,
      sort_by: sortBy,
      sort_dir: sortDir,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      needs_attention: activeView.needsAttention,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [search, activeView, sortBy, sortDir, dateFrom, dateTo, page]
  );

  // Data hooks
  const { data: viewSummary } = useSalesRequestsViewSummary(currentView);
  const { data: paginatedData, isLoading } = useSalesRequestsEnriched(filters);
  const requests = paginatedData?.items;
  const totalCount = paginatedData?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Full summary for pipeline bar (only used in active_pipeline view)
  const { data: summary } = useSalesRequestsSummary();

  // Load dependencies for create form
  const loadDependencies = useCallback(async () => {
    const [c, i] = await Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Item[]>("/items"),
    ]);
    setCustomers(c);
    setItems(i);
  }, []);

  useEffect(() => {
    loadDependencies().catch(() => undefined);
  }, [loadDependencies]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, sortBy, sortDir]);

  // View change handler
  const handleViewChange = (viewId: string) => {
    setCurrentView(viewId);
    setPage(0);
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  // Sorting
  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "request_number" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col)
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  const activeFilterCount = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (search ? 1 : 0);

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Sales Orders</h2>
          <p className="text-sm text-muted">
            Manage your sales pipeline from request to fulfillment.
          </p>
        </div>
        <button
          className="app-button"
          onClick={() => {
            setFormKey((prev) => prev + 1);
            setShowCreate((prev) => !prev);
          }}
        >
          <Plus className="h-4 w-4" /> New Sales Order
        </button>
      </header>

      {notice && (
        <section className="app-card text-sm text-success p-4">
          {notice}
        </section>
      )}

      {/* Create form */}
      {showCreate && (
        <SalesRequestForm
          key={formKey}
          customers={customers}
          items={items}
          createdByUserId={1}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            setNotice("Sales Order created successfully.");
            setTimeout(() => setNotice(""), 5000);
          }}
        />
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
              <span className="ml-1.5 text-xs text-muted">
                ({totalCount})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contextual KPIs ── */}
      {viewSummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {currentView === "active_pipeline" && (
            <>
              <KpiCard
                label="Pipeline Value"
                value={formatCurrency(Number(viewSummary.pipeline_value ?? 0))}
                icon={DollarSign}
                iconBg="bg-emerald-500/10 text-emerald-600"
              />
              <KpiCard
                label="Avg Deal Size"
                value={
                  viewSummary.avg_deal_size != null
                    ? formatCurrency(Number(viewSummary.avg_deal_size))
                    : "\u2014"
                }
                icon={TrendingUp}
                iconBg="bg-sky-500/10 text-sky-600"
              />
              <KpiCard
                label="Avg Days Open"
                value={
                  viewSummary.avg_days_open != null
                    ? `${viewSummary.avg_days_open}d`
                    : "\u2014"
                }
                icon={Clock}
                iconBg="bg-amber-500/10 text-amber-600"
              />
              <KpiCard
                label="Active Orders"
                value={String(viewSummary.order_count ?? 0)}
                icon={ShoppingCart}
                iconBg="bg-blue-500/10 text-blue-600"
              />
            </>
          )}

          {currentView === "fulfillment" && (
            <>
              <KpiCard
                label="Orders to Ship"
                value={String(viewSummary.orders_to_ship ?? 0)}
                icon={Truck}
                iconBg="bg-indigo-500/10 text-indigo-600"
              />
              <KpiCard
                label="Overdue Shipments"
                value={String(viewSummary.overdue_shipments ?? 0)}
                icon={AlertTriangle}
                iconBg={
                  Number(viewSummary.overdue_shipments ?? 0) > 0
                    ? "bg-red-500/10 text-red-600"
                    : "bg-slate-500/10 text-slate-600"
                }
              />
              <KpiCard
                label="In Fulfillment"
                value={String(viewSummary.order_count ?? 0)}
                icon={Package}
                iconBg="bg-purple-500/10 text-purple-600"
              />
            </>
          )}

          {currentView === "closed" && (
            <>
              <KpiCard
                label="Total Closed Value"
                value={formatCurrency(
                  Number(viewSummary.total_closed_value ?? 0)
                )}
                icon={DollarSign}
                iconBg="bg-emerald-500/10 text-emerald-600"
              />
              <KpiCard
                label="Avg Cycle Time"
                value={
                  viewSummary.avg_cycle_time_days != null
                    ? `${viewSummary.avg_cycle_time_days}d`
                    : "\u2014"
                }
                icon={Clock}
                iconBg="bg-amber-500/10 text-amber-600"
              />
              <KpiCard
                label="Conversion Rate"
                value={
                  viewSummary.conversion_rate != null
                    ? `${viewSummary.conversion_rate}%`
                    : "\u2014"
                }
                icon={Target}
                iconBg="bg-violet-500/10 text-violet-600"
              />
              <KpiCard
                label="Closed Orders"
                value={String(viewSummary.order_count ?? 0)}
                icon={ShoppingCart}
                iconBg="bg-blue-500/10 text-blue-600"
              />
            </>
          )}

          {(currentView === "all" || currentView === "needs_attention") &&
            viewSummary && (
              <>
                <KpiCard
                  label="Total Orders"
                  value={String(viewSummary.total_orders ?? 0)}
                  icon={ShoppingCart}
                  iconBg="bg-blue-500/10 text-blue-600"
                />
                <KpiCard
                  label="Pipeline Value"
                  value={formatCurrency(
                    Number(viewSummary.pipeline_value ?? 0)
                  )}
                  icon={DollarSign}
                  iconBg="bg-emerald-500/10 text-emerald-600"
                />
                <KpiCard
                  label="Overdue"
                  value={String(viewSummary.overdue_orders ?? 0)}
                  icon={AlertTriangle}
                  iconBg={
                    Number(viewSummary.overdue_orders ?? 0) > 0
                      ? "bg-red-500/10 text-red-600"
                      : "bg-slate-500/10 text-slate-600"
                  }
                />
                <KpiCard
                  label="Conversion"
                  value={
                    viewSummary.conversion_rate != null
                      ? `${Number(viewSummary.conversion_rate).toFixed(1)}%`
                      : "\u2014"
                  }
                  icon={Target}
                  iconBg="bg-violet-500/10 text-violet-600"
                />
              </>
            )}
        </div>
      )}

      {/* Pipeline Bar (only for Active Pipeline view) */}
      {currentView === "active_pipeline" && summary && (
        <SalesOrderPipelineBar
          ordersByStatus={summary.orders_by_status}
          pipelineValue={Number(summary.pipeline_value)}
          activeStatus={[]}
          onStatusClick={() => {}}
        />
      )}

      {/* Search & Filters + Table */}
      <section className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder="Search order #, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`app-button-secondary relative ${
              activeFilterCount > 0 ? "border-primary text-primary" : ""
            }`}
            onClick={() => setShowFilters((p) => !p)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              className="text-xs text-muted hover:text-foreground"
              onClick={clearFilters}
            >
              <X className="mr-0.5 inline h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Expandable filters (date range only — status handled by views) */}
        {showFilters && (
          <div className="space-y-3 rounded-lg border border-border/60 bg-surface p-4">
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium text-muted">From</span>
                <input
                  type="date"
                  className="app-input w-44"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium text-muted">To</span>
                <input
                  type="date"
                  className="app-input w-44"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {/* Table loading skeleton */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="app-skeleton h-12 rounded-lg"
                style={{ width: `${100 - i * 3}%` }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && requests && requests.length === 0 && (
          <div className="py-12 text-center">
            <ShoppingCart className="mx-auto h-12 w-12 text-muted/30" />
            <p className="mt-3 font-semibold">No sales orders found</p>
            <p className="mt-1 text-sm text-muted">
              {activeFilterCount > 0
                ? "Try adjusting your filters or switching views."
                : currentView !== "all"
                  ? "No orders match this view. Try switching to All Orders."
                  : "Create your first sales order to get started."}
            </p>
            {currentView === "all" && activeFilterCount === 0 && (
              <button
                className="app-button mt-4"
                onClick={() => {
                  setFormKey((p) => p + 1);
                  setShowCreate(true);
                }}
              >
                <Plus className="h-4 w-4" /> New Sales Order
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!isLoading && requests && requests.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th
                    className="cursor-pointer px-4 py-3"
                    onClick={() => handleSort("request_number")}
                  >
                    <span className="flex items-center gap-1">
                      Order # <SortIcon col="request_number" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3"
                    onClick={() => handleSort("customer_name")}
                  >
                    <span className="flex items-center gap-1">
                      Customer <SortIcon col="customer_name" />
                    </span>
                  </th>
                  <th className="px-4 py-3">Items</th>
                  <th
                    className="cursor-pointer px-4 py-3"
                    onClick={() => handleSort("total_amount")}
                  >
                    <span className="flex items-center gap-1">
                      Amount <SortIcon col="total_amount" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3"
                    onClick={() => handleSort("status")}
                  >
                    <span className="flex items-center gap-1">
                      Status <SortIcon col="status" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3"
                    onClick={() => handleSort("created_at")}
                  >
                    <span className="flex items-center gap-1">
                      Created <SortIcon col="created_at" />
                    </span>
                  </th>
                  <th className="px-4 py-3">Days Open</th>
                  <th className="px-4 py-3">Fulfillment</th>
                  <th className="px-4 py-3">Margin</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: SalesRequestListEnriched) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-border/70 last:border-b-0 transition-colors hover:bg-secondary/60"
                    onClick={() => navigate(`/sales-requests/${r.id}`)}
                  >
                    <td className="px-4 py-3 font-semibold text-primary">
                      {r.request_number}
                      {r.has_linked_invoice && (
                        <span className="ml-1.5 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                          INV
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.customer_name ?? (
                        <span className="text-muted">Walk-in</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.line_count}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatCurrency(Number(r.total_amount), true)}
                    </td>
                    <td className="px-4 py-3">
                      <SalesOrderStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span
                        className={
                          r.days_open > 14
                            ? "text-amber-600 font-medium"
                            : "text-muted"
                        }
                      >
                        {r.days_open}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.requested_fulfillment_date ? (
                        <span
                          className={
                            URGENCY_STYLES[r.fulfillment_urgency] ??
                            "text-muted"
                          }
                        >
                          {formatDate(r.requested_fulfillment_date)}
                          {r.fulfillment_urgency === "overdue" && (
                            <AlertTriangle className="ml-1 inline h-3 w-3" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.estimated_margin_percent != null ? (
                        <span
                          className={`font-medium ${
                            Number(r.estimated_margin_percent) >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {Number(r.estimated_margin_percent).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted">{"\u2014"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > 0 && !isLoading && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted">
              Showing{" "}
              <span className="font-medium text-foreground">
                {page * PAGE_SIZE + 1}
              </span>
              {"\u2013"}
              <span className="font-medium text-foreground">
                {Math.min((page + 1) * PAGE_SIZE, totalCount)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">{totalCount}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  className="app-button-ghost px-2 py-1.5"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from(
                  { length: Math.min(totalPages, 5) },
                  (_, i) => {
                    const startPage = Math.max(
                      0,
                      Math.min(page - 2, totalPages - 5)
                    );
                    const pageNum = startPage + i;
                    if (pageNum >= totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`h-8 w-8 rounded text-sm font-medium transition-colors ${
                          pageNum === page
                            ? "bg-primary text-white"
                            : "text-muted hover:bg-secondary"
                        }`}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  }
                )}
                <button
                  className="app-button-ghost px-2 py-1.5"
                  disabled={page >= totalPages - 1}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
