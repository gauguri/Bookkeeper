import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Package, DollarSign, AlertTriangle, TrendingDown,
  ChevronDown, ChevronUp, ArrowUpDown, SlidersHorizontal, X,
} from "lucide-react";
import {
  useItemsEnriched, useItemsSummary, useCreateItem,
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

const emptyForm = {
  name: "", sku: "", description: "", unit_price: "",
  income_account_id: "", is_active: true,
};

export default function ItemsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const filters: ItemFilters = useMemo(() => ({
    search: search || undefined,
    is_active: statusFilter ? statusFilter === "true" : undefined,
    stock_status: stockFilter || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [search, stockFilter, statusFilter, sortBy, sortDir]);

  const { data: summary } = useItemsSummary();
  const { data: items, isLoading } = useItemsEnriched(filters);
  const createMutation = useCreateItem();

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
        <button className="app-button" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Item
        </button>
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
        </div>

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
                    <td colSpan={7} className="px-4 py-4">
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
                  <td colSpan={7} className="py-12 text-center">
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
