import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Package, DollarSign, AlertTriangle, TrendingDown, TrendingUp, Activity, Boxes,
  ChevronDown, ChevronUp, ArrowUpDown, SlidersHorizontal, X, Upload,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  useItemsEnriched, useItemsSummary, useCreateItem, useArchiveItem, useItemsCatalogIntelligence,
  type ItemFilters, type ItemListEnriched,
} from "../hooks/useItems";
import { formatCurrency, formatCompact, formatPercent } from "../utils/formatters";
import StockStatusBadge from "../components/items/StockStatusBadge";

const STOCK_FILTERS = [
  { label: "All", value: "" },
  { label: "In Stock", value: "in_stock" },
  { label: "Low Stock", value: "low_stock" },
  { label: "Out of Stock", value: "out_of_stock" },
  { label: "Overstocked", value: "overstocked" },
];

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
  name: "", sku: "", description: "", unit_price: "",
  income_account_id: "", is_active: true,
};

export default function ItemsPage() {
  const PAGE_SIZE = 100;
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [intelligencePeriod, setIntelligencePeriod] = useState<"mtd" | "qtd" | "ytd" | "ltm">("ytd");

  const filters: ItemFilters = useMemo(() => ({
    search: search || undefined,
    is_active: statusFilter ? statusFilter === "true" : undefined,
    stock_status: stockFilter || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    page,
    page_size: PAGE_SIZE,
  }), [search, stockFilter, statusFilter, sortBy, sortDir, page]);

  const { data: summary } = useItemsSummary();
  const { data: intelligence, isLoading: intelligenceLoading } = useItemsCatalogIntelligence(intelligencePeriod, 5);
  const { data: itemsPage, isLoading } = useItemsEnriched(filters);
  const createMutation = useCreateItem();
  const archiveMutation = useArchiveItem();

  const items = itemsPage?.items ?? [];
  const totalCount = itemsPage?.total_count ?? 0;
  const pageSize = itemsPage?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = itemsPage?.page ?? page;
  const visibleIds = items?.map((item) => item.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));
  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === intelligencePeriod)?.label ?? "YTD";

  const trendChartData = useMemo(() => {
    if (!intelligence?.trend?.length) return [];
    const grouped = new Map<string, Record<string, string | number>>();
    intelligence.trend.forEach((point) => {
      const bucket = grouped.get(point.period) ?? { period: point.period };
      bucket[point.item_code || point.item_name] = Number(point.revenue ?? 0);
      grouped.set(point.period, bucket);
    });
    return Array.from(grouped.values()).map((row) => ({
      ...row,
      label: new Date(`${String(row.period)}-01`).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    }));
  }, [intelligence]);

  const topSeller = intelligence?.top_sellers?.[0] ?? null;
  const topSellerYtd = intelligence?.top_sellers_ytd?.[0] ?? null;
  const risingLeader = intelligence?.rising_items?.[0] ?? null;
  const decliningLeader = intelligence?.declining_items?.[0] ?? null;

  const intelligenceCards = [
    {
      label: `Top Seller ${selectedPeriodLabel}`,
      icon: TrendingUp,
      tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20",
      item: topSeller,
      value: topSeller ? formatCurrency(topSeller.revenue) : "—",
      meta: topSeller ? `${Number(topSeller.units).toLocaleString()} units` : "No sales yet",
    },
    {
      label: "Top Seller YTD",
      icon: DollarSign,
      tint: "bg-blue-50 text-blue-700 dark:bg-blue-900/20",
      item: topSellerYtd,
      value: topSellerYtd ? formatCurrency(topSellerYtd.revenue) : "—",
      meta: topSellerYtd ? `${Number(topSellerYtd.units).toLocaleString()} units` : "No YTD sales",
    },
    {
      label: "Fastest Rising",
      icon: Activity,
      tint: "bg-violet-50 text-violet-700 dark:bg-violet-900/20",
      item: risingLeader,
      value: risingLeader?.change_percent != null ? `${risingLeader.change_percent > 0 ? "+" : ""}${risingLeader.change_percent.toFixed(0)}%` : "—",
      meta: risingLeader ? formatCurrency(risingLeader.revenue) : "No mover yet",
    },
    {
      label: "Biggest Decline",
      icon: TrendingDown,
      tint: "bg-amber-50 text-amber-700 dark:bg-amber-900/20",
      item: decliningLeader,
      value: decliningLeader?.change_percent != null ? `${decliningLeader.change_percent.toFixed(0)}%` : "—",
      meta: decliningLeader ? formatCurrency(decliningLeader.revenue) : "No decline yet",
    },
    {
      label: "Dead Stock",
      icon: Boxes,
      tint: "bg-rose-50 text-rose-700 dark:bg-rose-900/20",
      item: intelligence?.dead_stock?.[0] ?? null,
      value: String(intelligence?.dead_stock_count ?? 0),
      meta: intelligence?.dead_stock?.length ? "Top dormant items by value" : "No dormant items surfaced",
    },
    {
      label: "Low Stock / High Demand",
      icon: AlertTriangle,
      tint: "bg-orange-50 text-orange-700 dark:bg-orange-900/20",
      item: intelligence?.low_stock_high_demand?.[0] ?? null,
      value: String(intelligence?.low_stock_high_demand_count ?? 0),
      meta: intelligence?.low_stock_high_demand?.length ? "Top reorder candidates" : "No urgent demand gaps",
    },
  ];

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleIds.includes(id)));
  }, [items]);

  useEffect(() => {
    setPage(0);
  }, [search, stockFilter, statusFilter, sortBy, sortDir]);

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
    if (!form.name.trim() || !form.unit_price) {
      setFormError("Name and unit price are required.");
      return;
    }
    setFormError("");
    try {
      await createMutation.mutateAsync({
        name: form.name,
        sku: form.sku || null,
        description: form.description || null,
        unit_price: Number(form.unit_price),
        income_account_id: form.income_account_id ? Number(form.income_account_id) : null,
        is_active: form.is_active,
      });
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const toggleItemSelection = (itemId: number, checked: boolean) => {
    setSelectedIds((prev) => (
      checked
        ? (prev.includes(itemId) ? prev : [...prev, itemId])
        : prev.filter((id) => id !== itemId)
    ));
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (!checked) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length || archiveMutation.isPending) return;
    setBulkError("");
    setBulkSuccess("");
    try {
      await Promise.all(selectedIds.map((id) => archiveMutation.mutateAsync(id)));
      const deletedCount = selectedIds.length;
      setSelectedIds([]);
      setBulkSuccess(`${deletedCount} item${deletedCount === 1 ? "" : "s"} deleted.`);
    } catch (err) {
      setBulkError((err as Error).message);
    }
  };

  const hasFilters = stockFilter || statusFilter;

  return (
    <section className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Items</p>
          <h1 className="text-2xl font-bold">Product Catalog</h1>
          <p className="text-sm text-muted">Manage pricing, inventory, and supplier costs across your product portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="app-button-secondary" onClick={() => navigate("/sales/items/import")}>
            <Upload className="h-4 w-4" /> Import
          </button>
          <button className="app-button" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> New Item
          </button>
        </div>
      </div>

      {/* ── Summary KPI Bar ── */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="app-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Items</p>
              <p className="text-lg font-bold">{summary.active_items}<span className="text-xs font-normal text-muted">/{summary.total_items}</span></p>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20">
              <DollarSign className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Inventory Value</p>
              <p className="text-lg font-bold">{formatCompact(summary.total_inventory_value)}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4 sm:col-span-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Low Stock</p>
              <p className="text-lg font-bold">{summary.low_stock_items}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4 sm:col-span-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Out of Stock</p>
              <p className="text-lg font-bold">{summary.out_of_stock_items}</p>
            </div>
          </div>
          <div className="app-card flex items-center gap-3 p-4 sm:col-span-1 lg:col-span-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <Package className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted">Active / Total</p>
              <p className="text-lg font-bold">{summary.active_items}<span className="text-xs font-normal text-muted"> active</span></p>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filters ── */}
      <div className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Catalog Intelligence</p>
            <h2 className="text-lg font-semibold">Highest sellers, trend shifts, and inventory risk</h2>
            <p className="text-sm text-muted">Track what is winning now, what is cooling off, and which items need action.</p>
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
                onClick={() => card.item && navigate(`/sales/items/${card.item.item_code || card.item.item_id}`)}
                disabled={!card.item}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${card.tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{card.label}</p>
                  <p className="mt-1 text-xl font-bold">{card.value}</p>
                  <p className="mt-1 truncate text-sm font-medium">{card.item?.item_name ?? "No item to highlight"}</p>
                  <p className="mt-1 text-xs text-muted">{card.item?.item_code ? `Code ${card.item.item_code} · ` : ""}{card.meta}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="app-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">Highest Selling Items Trend</p>
              <p className="text-xs text-muted">Monthly revenue for the current YTD leaders over the last 12 months.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, true)} />
                  {intelligence?.top_sellers_ytd?.slice(0, 5).map((item, index) => (
                    <Line
                      key={item.item_id}
                      type="monotone"
                      dataKey={item.item_code || item.item_name}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">Top Sellers {selectedPeriodLabel}</p>
              <p className="text-xs text-muted">Revenue ranking for the selected period.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(intelligence?.top_sellers ?? []).map((item) => ({
                    item: item.item_code || item.item_name.slice(0, 16),
                    revenue: Number(item.revenue),
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <YAxis type="category" dataKey="item" width={88} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, true)} />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="app-card p-4">
            <div className="mb-3">
              <p className="font-semibold">Fast Movers and Revenue Declines</p>
              <p className="text-xs text-muted">Month-over-month movement so we can spot momentum and slowdown early.</p>
            </div>
            <div className="space-y-3">
              {[
                { title: "Fastest Rising Items", rows: intelligence?.rising_items ?? [], positive: true },
                { title: "Biggest Revenue Declines", rows: intelligence?.declining_items ?? [], positive: false },
              ].map((section) => (
                <div key={section.title}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted">{section.title}</p>
                  <div className="space-y-2">
                    {section.rows.length ? section.rows.map((row) => (
                      <button
                        key={`${section.title}-${row.item_id}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-secondary/40"
                        onClick={() => navigate(`/sales/items/${row.item_code || row.item_id}`)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.item_name}</p>
                          <p className="text-xs text-muted">{row.item_code ? `Code ${row.item_code}` : "No item code"} · {formatCurrency(row.revenue)}</p>
                        </div>
                        <span className={`text-sm font-semibold ${section.positive ? "text-emerald-600" : "text-rose-600"}`}>
                          {row.change_percent != null ? `${row.change_percent > 0 ? "+" : ""}${row.change_percent.toFixed(0)}%` : "—"}
                        </span>
                      </button>
                    )) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">No signal yet for this comparison window.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3">
              <p className="font-semibold">Catalog Intelligence</p>
              <p className="text-xs text-muted">Inventory calls that matter beyond simple top-seller lists.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Dead Stock",
                  subtitle: "In stock with no sales in the last 180 days",
                  rows: intelligence?.dead_stock ?? [],
                  showInventoryValue: true,
                },
                {
                  title: "Low Stock / High Demand",
                  subtitle: "Selling recently and already tight on supply",
                  rows: intelligence?.low_stock_high_demand ?? [],
                  showInventoryValue: false,
                },
              ].map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{section.title}</p>
                  <p className="mb-2 mt-1 text-xs text-muted">{section.subtitle}</p>
                  <div className="space-y-2">
                    {section.rows.length ? section.rows.map((row) => (
                      <button
                        key={`${section.title}-${row.item_id}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary/30 hover:bg-secondary/40"
                        onClick={() => navigate(`/sales/items/${row.item_code || row.item_id}`)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.item_name}</p>
                          <p className="text-xs text-muted">{row.item_code ? `Code ${row.item_code}` : "No item code"} · On hand {Number(row.on_hand_qty).toLocaleString()}</p>
                        </div>
                        <span className="text-sm font-semibold">
                          {section.showInventoryValue ? formatCurrency(row.inventory_value) : `${Number(row.units).toLocaleString()} units`}
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

        {intelligenceLoading && (
          <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
            Loading catalog intelligence...
          </div>
        )}
      </div>

      <div className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              className="app-input w-full pl-9"
              placeholder="Search by name or SKU..."
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
            {hasFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {(stockFilter ? 1 : 0) + (statusFilter ? 1 : 0)}
              </span>
            )}
          </button>
          {hasFilters && (
            <button
              className="app-button-ghost text-xs"
              onClick={() => { setStockFilter(""); setStatusFilter(""); }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          {selectedIds.length > 0 && (
            <button
              className="app-button-ghost text-sm text-danger"
              onClick={() => void handleBulkDelete()}
              disabled={archiveMutation.isPending}
            >
              <X className="h-3.5 w-3.5" />
              {archiveMutation.isPending ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
        </div>

        {bulkError && <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{bulkError}</div>}
        {bulkSuccess && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{bulkSuccess}</div>}

        {showFilters && (
          <div className="flex flex-wrap gap-4 rounded-xl border p-3">
            <div>
              <label className="text-xs font-medium text-muted">Stock Status</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {STOCK_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStockFilter(f.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      stockFilter === f.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {f.label}
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

      {/* ── Items Table ── */}
      <div className="app-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all visible items"
                    checked={allVisibleSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("name")}>
                    Product <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("unit_price")}>
                    List Price <SortIcon col="unit_price" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("available_qty")}>
                    Available <SortIcon col="available_qty" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("total_revenue_ytd")}>
                    YTD Revenue <SortIcon col="total_revenue_ytd" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-foreground" onClick={() => handleSort("gross_margin_percent")}>
                    Margin <SortIcon col="gross_margin_percent" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  Stock
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  Supplier
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-5 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </td>
                  </tr>
                ))
              )}
              {items?.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-0 cursor-pointer transition hover:bg-gray-50/60 dark:hover:bg-gray-800/40"
                  onClick={() => navigate(`/sales/items/${item.id}`)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selectedIds.includes(item.id)}
                      onChange={(e) => toggleItemSelection(item.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.name}</span>
                          {!item.is_active && (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate">
                          {item.sku ? `SKU: ${item.sku}` : "No SKU"}
                          {item.unique_customers > 0 && ` · ${item.unique_customers} customer${item.unique_customers !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(item.unit_price, true)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums">
                      <span className="font-medium">{Number(item.available_qty).toLocaleString()}</span>
                      <p className="text-[10px] text-muted">{Number(item.on_hand_qty).toLocaleString()} on hand</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(item.total_revenue_ytd)}
                    {Number(item.units_sold_ytd) > 0 && (
                      <p className="text-[10px] text-muted">{Number(item.units_sold_ytd).toFixed(0)} units</p>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                    item.gross_margin_percent != null && item.gross_margin_percent < 20
                      ? "text-red-600" : ""
                  }`}>
                    {item.gross_margin_percent != null ? formatPercent(item.gross_margin_percent) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StockStatusBadge status={item.stock_status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.preferred_supplier_name ? (
                      <div className="text-xs">
                        <span className="text-muted">{item.preferred_supplier_name}</span>
                        {item.preferred_landed_cost != null && (
                          <p className="text-[10px] text-muted">{formatCurrency(item.preferred_landed_cost, true)}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (!items || items.length === 0) && (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                        <Package className="h-6 w-6 text-muted" />
                      </div>
                      <p className="font-semibold">No items found</p>
                      <p className="text-sm text-muted">Try adjusting your filters or create a new item.</p>
                      <button className="app-button" onClick={() => setShowForm(true)}>
                        <Plus className="h-4 w-4" /> Create Item
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <p className="text-muted">
            Showing {totalCount === 0 ? 0 : currentPage * pageSize + 1}-
            {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} items
          </p>
          <div className="flex items-center gap-2">
            <button
              className="app-button-ghost"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={currentPage <= 0}
            >
              Previous
            </button>
            <span className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              className="app-button-ghost"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── Create Item Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-20" onClick={() => setShowForm(false)}>
          <div className="app-card w-full max-w-lg p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Item</h2>
              <button className="app-button-ghost" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="app-input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="app-input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              <input className="app-input" placeholder="Unit price *" type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
              <input className="app-input" placeholder="Income account ID" value={form.income_account_id} onChange={(e) => setForm({ ...form, income_account_id: e.target.value })} />
              <input className="app-input sm:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="app-button-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="app-button" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

