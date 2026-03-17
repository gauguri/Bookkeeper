import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Download,
  Filter,
  PackagePlus,
  Settings2,
  ShoppingCart,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import DashboardFilter from "../components/analytics/DashboardFilter";
import InventoryOverviewCard from "../components/inventory/InventoryOverviewCard";
import InventoryValueCompositionCard from "../components/inventory/InventoryValueCompositionCard";
import { AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE } from "../utils/chartHelpers";
import { CHART_COLORS } from "../utils/colorScales";
import { CATEGORY_COLORS } from "../utils/chartPalette";
import { formatCompact, formatCurrency } from "../utils/formatters";
import { computeAbcClassification } from "../utils/inventoryAbc";
import { useInventoryOverview } from "../hooks/useInventoryOverview";


type ItemRow = {
  id: number;
  sku?: string | null;
  item: string;
  on_hand: number;
  reserved: number;
  available: number;
  reorder_point: number;
  safety_stock: number;
  lead_time_days: number;
  avg_daily_usage: number;
  days_of_supply: number;
  suggested_reorder_qty: number;
  preferred_supplier?: string | null;
  preferred_supplier_id?: number | null;
  last_receipt?: string | null;
  last_issue?: string | null;
  total_value: number;
  landed_unit_cost?: number | null;
  inbound_qty: number;
  health_flag: string;
};

type QueueCount = { key: string; label: string; count: number };
type InventoryItemsResponse = { items: ItemRow[]; queue_counts: QueueCount[]; total: number; page: number; page_size: number };

type AnalyticsResponse = {
  value_trend: { period: string; value: number }[];
  health_breakdown: { name: string; value: number }[];
  top_consumption: { item: string; value: number }[];
  net_flow: { period: string; receipts: number; issues: number; reserved: number }[];
};

type CompositionMetric = "value" | "quantity";
type CompositionLimit = 5 | 10 | 25 | "all";
type OverviewDensity = "compact" | "comfortable";


type Reservation = { source_type: string; source_id: number; source_label: string; qty_reserved: number };
type Detail = {
  item: ItemRow;
  movements: { id: number; reason: string; qty_delta: number; created_at: string }[];
  reservations: Reservation[];
  reorder_explanation: string;
  projected_available: number;
  target_stock: number;
  last_updated?: string | null;
  consumption_trend: { date: string; consumption: number }[];
};

type PlanningPayload = {
  reorder_point_qty: number;
  safety_stock_qty: number;
  lead_time_days: number;
  target_days_supply: number;
};

const toNumeric = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeItemRow = (row: ItemRow): ItemRow => ({
  ...row,
  on_hand: toNumeric(row.on_hand),
  reserved: toNumeric(row.reserved),
  available: toNumeric(row.available),
  reorder_point: toNumeric(row.reorder_point),
  safety_stock: toNumeric(row.safety_stock),
  lead_time_days: toNumeric(row.lead_time_days),
  avg_daily_usage: toNumeric(row.avg_daily_usage),
  days_of_supply: toNumeric(row.days_of_supply),
  suggested_reorder_qty: toNumeric(row.suggested_reorder_qty),
  total_value: toNumeric(row.total_value),
  landed_unit_cost: row.landed_unit_cost == null ? null : toNumeric(row.landed_unit_cost),
  inbound_qty: toNumeric(row.inbound_qty),
});

const normalizeInventoryItemsResponse = (payload: InventoryItemsResponse): InventoryItemsResponse => ({
  ...payload,
  items: (payload.items ?? []).map(normalizeItemRow),
});

const normalizeDetail = (payload: Detail): Detail => ({
  ...payload,
  item: normalizeItemRow(payload.item),
  projected_available: toNumeric(payload.projected_available),
  target_stock: toNumeric(payload.target_stock),
  reservations: (payload.reservations ?? []).map((reservation) => ({
    ...reservation,
    qty_reserved: toNumeric(reservation.qty_reserved),
  })),
  consumption_trend: (payload.consumption_trend ?? []).map((point) => ({
    ...point,
    consumption: toNumeric(point.consumption),
  })),
});

const queueFlagMap: Record<string, string> = { low_stock: "low_stock", stockout: "stockouts", at_risk: "at_risk", excess: "excess", reserved_pressure: "reserved_pressure" };
const formatNumber = (value: number) => (Number.isFinite(value) ? formatCompact(value) : "0");
const healthPillMap: Record<string, string> = {
  healthy: "bg-success/10 text-success",
  low_stock: "bg-warning/10 text-warning",
  stockout: "bg-danger/10 text-danger",
  excess: "bg-primary/10 text-primary",
  at_risk: "bg-warning/10 text-warning",
  reserved_pressure: "bg-warning/10 text-warning",
};

export default function InventoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState("ytd");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("total_value:desc");
  const [usageDays, setUsageDays] = useState(90);
  const [itemsData, setItemsData] = useState<InventoryItemsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [compositionMetric, setCompositionMetric] = useState<CompositionMetric>("value");
  const [compositionLimit, setCompositionLimit] = useState<CompositionLimit>(5);
  const [overviewDensity, setOverviewDensity] = useState<OverviewDensity>("compact");
  const [overviewShowZeroQty, setOverviewShowZeroQty] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<number | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [editingPlanning, setEditingPlanning] = useState(false);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningForm, setPlanningForm] = useState<PlanningPayload>({ reorder_point_qty: 0, safety_stock_qty: 0, lead_time_days: 14, target_days_supply: 30 });
  const [popover, setPopover] = useState<{ itemId: number; x: number; y: number } | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [compact, setCompact] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    safety_stock: true,
    lead_time_days: true,
    avg_daily_usage: true,
    last_receipt: true,
    last_issue: true,
  });

  const queue = searchParams.get("queue") || "needs_attention";
  const breakdownFilter = searchParams.get("breakdown") || "all";
  const abcItemFilter = Number(searchParams.get("abc_item") ?? "");
  const abcClassFilter = (searchParams.get("abc_class") ?? "").toUpperCase();
  const overview = useInventoryOverview(compositionLimit);

  const mismatchLogged = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const setQueue = (nextQueue: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("queue", nextQueue);
      next.delete("breakdown");
      next.delete("abc_item");
      next.delete("abc_class");
      return next;
    }, { replace: false });
  };

  const setBreakdown = (next: string) => {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (next === "all") {
        nextParams.delete("breakdown");
      } else {
        nextParams.set("breakdown", next);
      }
      return nextParams;
    }, { replace: false });
  };


  const setAbcItemFilter = (itemId: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("abc_item", String(itemId));
      next.delete("abc_class");
      return next;
    }, { replace: false });
  };

  const setAbcClassFilter = (classification: "A" | "B" | "C") => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("abc_class", classification);
      next.delete("abc_item");
      return next;
    }, { replace: false });
  };

  const clearAbcFilters = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("abc_item");
      next.delete("abc_class");
      return next;
    }, { replace: false });
  };

  const loadOverview = async () => {
    setError("");
    try {
      const analyticsRes = await apiFetch<AnalyticsResponse>("/inventory/analytics");
      setAnalytics(analyticsRes);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadTable = async () => {
    setTableLoading(true);
    setError("");
    try {
      const itemsRes = await apiFetch<InventoryItemsResponse>(`/inventory/items?queue=${queue}&search=${encodeURIComponent(search)}&sort=${sort}&page=1&page_size=50&usage_days=${usageDays}`);
      setItemsData(normalizeInventoryItemsResponse(itemsRes));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [usageDays]);


  useEffect(() => {
    void loadTable();
  }, [queue, sort, usageDays]);

  useEffect(() => {
    if (overview.error) setError(overview.error);
  }, [overview.error]);

  const queueCounts = useMemo(() => Object.fromEntries(overview.queues.map((entry) => [entry.key, entry.count])), [overview.queues]);

  const kpis = useMemo(() => {
    if (!overview.totals) return [];
    return [
      { label: "Inventory Value", value: formatCurrency(Number(overview.totals.total_inventory_value ?? 0)), queue: "all" },
      { label: "Low Stock Items", value: formatNumber(Number(queueCounts.low_stock ?? 0)), queue: "low_stock" },
      { label: "Stockouts", value: formatNumber(Number(queueCounts.stockouts ?? 0)), queue: "stockouts" },
      { label: "At Risk", value: formatNumber(Number(queueCounts.at_risk ?? 0)), queue: "at_risk" },
      { label: "Excess / Dead Stock", value: formatNumber(Number(queueCounts.excess ?? 0)), queue: "excess" },
      { label: "Backordered / Reserved Pressure", value: formatNumber(Number(queueCounts.reserved_pressure ?? 0)), queue: "reserved_pressure" },
    ];
  }, [overview.totals, queueCounts]);

  const topConsumptionData = useMemo(
    () => [...(analytics?.top_consumption ?? [])].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10),
    [analytics],
  );
  const topConsumptionColors = useMemo(
    () => topConsumptionData.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length] ?? CHART_COLORS[index % CHART_COLORS.length]),
    [topConsumptionData],
  );

  const normalizedItems = useMemo(() => {
    const allItems = itemsData?.items ?? [];
    let hasMismatch = false;
    const rows = allItems.map((row) => {
      const onHand = Number(row.on_hand);
      const reserved = Number(row.reserved);
      const expectedAvailable = Math.max(0, onHand - reserved);
      const mismatch = Math.abs(Number(row.available) - expectedAvailable) > 0.01;
      if (mismatch) hasMismatch = true;
      return {
        ...row,
        available_for_filter: mismatch ? expectedAvailable : Number(row.available),
      };
    });
    if (hasMismatch && !mismatchLogged.current) {
      console.warn("Inventory totals mismatch detected. Using max(0, on_hand - reserved) for availability filtering.");
      mismatchLogged.current = true;
    }
    return rows;
  }, [itemsData?.items]);

  const abcClassByItemId = useMemo(() => {
    const classified = computeAbcClassification(normalizedItems);
    return new Map(classified.map((row) => [row.id, row.abc_class]));
  }, [normalizedItems]);

  const displayedItems = useMemo(() => {
    const all = normalizedItems;
    const breakdownFiltered = breakdownFilter === "reserved"
      ? all.filter((row) => Number(row.reserved) > 0)
      : breakdownFilter === "available"
        ? all.filter((row) => Number(row.available_for_filter) > 0)
        : breakdownFilter === "inbound"
          ? all.filter((row) => Number(row.inbound_qty) > 0)
          : all;

    if (Number.isFinite(abcItemFilter) && abcItemFilter > 0) return breakdownFiltered.filter((row) => row.id === abcItemFilter);
    if (["A", "B", "C"].includes(abcClassFilter)) return breakdownFiltered.filter((row) => abcClassByItemId.get(row.id) === abcClassFilter);
    return breakdownFiltered;
  }, [normalizedItems, breakdownFilter, abcItemFilter, abcClassFilter, abcClassByItemId]);


  const createPOForSelection = () => {
    if (!selectedIds.length) return;
    navigate("/purchasing/purchase-orders/new", {
      state: {
        prefillLines: selectedIds.map((itemId) => ({
          item_id: itemId,
          quantity: 0,
        })),
      },
    });
  };

  const openDetail = async (itemId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    try {
      const payload = await apiFetch<Detail>(`/inventory/items/${itemId}/detail`);
      setDetail(normalizeDetail(payload));
      setEditingPlanning(false);
      setPlanningForm({
        reorder_point_qty: toNumeric(payload.item.reorder_point ?? 0),
        safety_stock_qty: toNumeric(payload.item.safety_stock ?? 0),
        lead_time_days: toNumeric(payload.item.lead_time_days ?? 14),
        target_days_supply: 30,
      });
    } catch (err) {
      setDetailError((err as Error).message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const savePlanning = async () => {
    if (!detail) return;
    setPlanningSaving(true);
    setDetailError("");
    try {
      await apiFetch<ItemRow>(`/inventory/items/${detail.item.id}/planning`, {
        method: "PUT",
        body: JSON.stringify(planningForm),
      });
      await openDetail(detail.item.id);
      void loadTable();
    } catch (err) {
      setDetailError((err as Error).message);
    } finally {
      setPlanningSaving(false);
    }
  };

  const openReservations = async (itemId: number, event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ itemId, x: rect.left, y: rect.bottom + 8 });
    const payload = await apiFetch<Reservation[]>(`/inventory/reservations/${itemId}`);
    setReservations(payload);
  };

  const handleCompositionClick = (itemId: number, segment: "available" | "reserved", event?: MouseEvent) => {
    setBreakdown(segment);
    setAbcItemFilter(itemId);
    setHighlightedItemId(itemId);
    setTimeout(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      rowRefs.current[itemId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 20);
    if (segment === "reserved" && event) void openReservations(itemId, event);
  };

  const handleCompositionViewAll = () => {
    if (!overview.items.length) {
      navigate("/purchasing/purchase-orders");
      return;
    }
    setBreakdown("all");
    clearAbcFilters();
    setHighlightedItemId(null);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (overview.loading && !overview.totals) {
    return (
      <section className="space-y-6">
        <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="app-card h-24 animate-pulse" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="app-card h-72 animate-pulse" />)}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Inventory</p>
          <h1 className="text-3xl font-semibold">Inventory Command Center</h1>
          <p className="text-muted">Real-time stock, reservations, reorder intelligence, and purchasing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="app-button" onClick={() => navigate("/purchasing/purchase-orders")}><PackagePlus className="h-4 w-4" /> + Receive Inventory</button>
          <button className="app-button-secondary" onClick={() => navigate("/inventory/replenishment")}><Boxes className="h-4 w-4" /> Replenishment</button>
          <button className="app-button-secondary" onClick={createPOForSelection}><ShoppingCart className="h-4 w-4" /> + Create Purchase Order</button>
          <button className="app-button-ghost" onClick={() => navigate("/items")}><ArrowDownUp className="h-4 w-4" /> Adjust Stock</button>
          <button className="app-button-ghost"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 app-card p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void loadTable()} placeholder="Search item or SKU" className="app-input h-9 w-64" />
          <select className="app-select h-9" value={usageDays} onChange={(e) => setUsageDays(Number(e.target.value))}>
            <option value={30}>Demand 30D</option><option value={60}>Demand 60D</option><option value={90}>Demand 90D</option>
          </select>
          <select className="app-select h-9" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="total_value:desc">Value ↓</option><option value="days_of_supply:asc">DOS ↑</option><option value="suggested_reorder_qty:desc">ROQ ↓</option>
          </select>
        </div>
        <DashboardFilter period={period} onPeriodChange={setPeriod} />
      </div>

      {error && <div className="app-card border-danger/30 bg-danger/5 p-3 text-sm text-danger"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((tile) => (
          <button key={tile.label} className={`app-card p-4 text-left ${queue === tile.queue ? "ring-2 ring-primary/40" : ""}`} onClick={() => setQueue(tile.queue)}>
            <p className="text-xs uppercase tracking-wide text-muted">{tile.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{tile.value}</p>
            <p className="text-xs text-muted">Click to open queue</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <InventoryOverviewCard
          className="h-full"
          totals={overview.totals}
          items={overview.items}
          metric={compositionMetric}
          limit={compositionLimit}
          density={overviewDensity}
          showZeroQty={overviewShowZeroQty}
          loading={overview.loading}
          missingLandedCostCount={Number(overview.data_quality.missing_landed_cost_count ?? 0)}
          onMetricChange={setCompositionMetric}
          onLimitChange={setCompositionLimit}
          onDensityChange={setOverviewDensity}
          onShowZeroQtyChange={setOverviewShowZeroQty}
          onViewAll={handleCompositionViewAll}
          onItemClick={(itemId) => handleCompositionClick(itemId, "available")}
          onSegmentClick={handleCompositionClick}
          onSetLandedCosts={() => navigate("/items")}
          onReceiveInventory={() => navigate("/purchasing/purchase-orders")}
        />

        <InventoryValueCompositionCard
          className="h-full"
          items={normalizedItems}
          activeItemId={Number.isFinite(abcItemFilter) && abcItemFilter > 0 ? abcItemFilter : null}
          activeClass={["A", "B", "C"].includes(abcClassFilter) ? (abcClassFilter as "A" | "B" | "C") : null}
          onItemSelect={setAbcItemFilter}
          onClassSelect={setAbcClassFilter}
          onClearFilters={clearAbcFilters}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-4"><p className="mb-2 font-semibold">Inventory Value Trend (12 Months)</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics?.value_trend}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Stock Health Breakdown</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analytics?.health_breakdown ?? []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>{(analytics?.health_breakdown ?? []).map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Top Items by Consumption</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={topConsumptionData}><CartesianGrid {...GRID_STYLE} /><XAxis dataKey="item" {...AXIS_STYLE} /><YAxis {...AXIS_STYLE} /><Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => formatNumber(v)} /><Bar dataKey="value">{topConsumptionData.map((_, idx) => <Cell key={`consumption-${idx}`} fill={topConsumptionColors[idx]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Demand vs Supply / Net Flow</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics?.net_flow}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="receipts" stackId="a" fill={CHART_COLORS[1]} /><Bar dataKey="issues" stackId="a" fill={CHART_COLORS[3]} /><Bar dataKey="reserved" stackId="a" fill={CHART_COLORS[4]} /></BarChart></ResponsiveContainer></div></div>
      </div>

      <div ref={gridRef} className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="app-card p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          <div className="space-y-1">
            {(overview.queues ?? []).map((entry) => (
              <button key={entry.key} onClick={() => setQueue(entry.key)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${queue === entry.key ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}>
                <div className="flex items-center justify-between"><span>{entry.label}</span><span className="text-xs tabular-nums text-muted">{entry.count}</span></div>
              </button>
            ))}
          </div>
        </aside>

        <div className="app-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Inventory Items Grid</h3>
            <div className="flex items-center gap-2">
              {breakdownFilter !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
                  Filtered: {breakdownFilter}
                  <button className="underline" onClick={() => setBreakdown("all")}>✕ Clear</button>
                </span>
              )}
              {Number.isFinite(abcItemFilter) && abcItemFilter > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
                  Filtered: selected item
                  <button className="underline" onClick={clearAbcFilters}>✕ Clear</button>
                </span>
              )}
              {["A", "B", "C"].includes(abcClassFilter) && (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
                  Filtered: Class {abcClassFilter}
                  <button className="underline" onClick={clearAbcFilters}>✕ Clear</button>
                </span>
              )}
              {tableLoading && <span className="text-xs text-muted">Updating queue…</span>}
              <button className="app-button-ghost" onClick={() => setCompact((v) => !v)}><Boxes className="h-4 w-4" /> {compact ? "Comfort" : "Compact"}</button>
              <details className="relative"><summary className="app-button-ghost list-none"><Settings2 className="h-4 w-4" /> Columns</summary><div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border bg-surface p-2 shadow-xl">{Object.keys(visibleCols).map((key) => <label key={key} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={visibleCols[key]} onChange={(e) => setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }))} />{key.replace(/_/g, " ")}</label>)}</div></details>
            </div>
          </div>

          <div className="relative overflow-auto">
            {tableLoading && <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 animate-pulse bg-primary/30" />}
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs uppercase text-muted"><tr><th className="px-3 py-2"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? displayedItems.map((x) => x.id) : [])} /></th><th className="px-3 py-2">Item</th><th className="px-3 py-2">On Hand</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2">Available</th><th className="px-3 py-2">ROP</th>{visibleCols.safety_stock && <th className="px-3 py-2">Safety</th>}{visibleCols.lead_time_days && <th className="px-3 py-2">Lead Time</th>}{visibleCols.avg_daily_usage && <th className="px-3 py-2">Avg Usage</th>}<th className="px-3 py-2">DOS</th><th className="px-3 py-2">ROQ</th><th className="px-3 py-2">Supplier</th>{visibleCols.last_receipt && <th className="px-3 py-2">Last Receipt</th>}{visibleCols.last_issue && <th className="px-3 py-2">Last Issue</th>}<th className="px-3 py-2">Total Value</th><th className="px-3 py-2">Actions</th></tr></thead>
              <tbody>
                {displayedItems.map((row) => (
                  <tr key={row.id} ref={(node) => { rowRefs.current[row.id] = node; }} className={`cursor-pointer border-t border-muted/20 ${compact ? "text-xs" : ""} ${highlightedItemId === row.id ? "bg-primary/10" : ""}`} onClick={() => { setHighlightedItemId(row.id); void openDetail(row.id); }}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))} /></td>
                    <td className="px-3 py-2"><button className="font-medium hover:underline" onClick={(e) => { e.stopPropagation(); void openDetail(row.id); }}>{row.item}</button><p className="text-xs text-muted">{row.sku ?? "—"}</p></td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.on_hand)}</td>
                    <td className="px-3 py-2 tabular-nums"><button className="text-primary underline" onClick={(e) => { e.stopPropagation(); void openReservations(row.id, e); }}>{formatNumber(row.reserved)}</button></td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.available)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{formatNumber(row.reorder_point)}</td>
                    {visibleCols.safety_stock && <td className="px-3 py-2 tabular-nums">{formatNumber(row.safety_stock)}</td>}
                    {visibleCols.lead_time_days && <td className="px-3 py-2">{row.lead_time_days}d</td>}
                    {visibleCols.avg_daily_usage && <td className="px-3 py-2 tabular-nums">{formatNumber(row.avg_daily_usage)}</td>}
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.days_of_supply)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{formatNumber(row.suggested_reorder_qty)}</td>
                    <td className="px-3 py-2">{row.preferred_supplier ?? "Unassigned"}</td>
                    {visibleCols.last_receipt && <td className="px-3 py-2">{row.last_receipt ? new Date(row.last_receipt).toLocaleDateString() : "—"}</td>}
                    {visibleCols.last_issue && <td className="px-3 py-2">{row.last_issue ? new Date(row.last_issue).toLocaleDateString() : "—"}</td>}
                    <td className="px-3 py-2 tabular-nums">{formatCurrency(row.total_value)}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><div className="flex gap-1"><button className="app-button-ghost" onClick={() => void openDetail(row.id)}>View</button><button className="app-button-ghost" onClick={() => setQueue(queueFlagMap[row.health_flag] ?? queue)}>Adjust</button><button className="app-button-ghost" onClick={() => navigate("/purchasing/purchase-orders/new", { state: { prefillLines: [{ item_id: row.id, quantity: Number(row.suggested_reorder_qty.toFixed(2)) }] } })}>Create PO</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!displayedItems.length && <div className="rounded-2xl border border-dashed border-border py-16 text-center"><p className="text-lg font-semibold">No items in this view</p><p className="text-sm text-muted">Try another queue or clear the active composition filters.</p></div>}
          </div>
        </div>
      </div>

      {popover && (
        <div className="fixed z-40 w-72 rounded-xl border bg-surface p-3 shadow-xl" style={{ left: popover.x, top: popover.y }}>
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Reservations</p><button className="text-xs text-muted" onClick={() => setPopover(null)}>Close</button></div>
          <div className="max-h-56 overflow-auto">{reservations.map((reservation, idx) => <div key={idx} className="flex items-center justify-between border-t py-2 text-sm"><span>{reservation.source_label}</span><span className="tabular-nums">{formatNumber(reservation.qty_reserved)}</span></div>)}</div>
          <button className="mt-2 text-xs text-primary hover:underline" onClick={() => navigate(`/sales-requests?item_id=${popover.itemId}`)}>View all</button>
        </div>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onClick={() => setDetailOpen(false)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-surface p-5" onClick={(event) => event.stopPropagation()}>
            {detailLoading && <div className="space-y-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-secondary" />)}</div>}
            {!detailLoading && detailError && <div className="app-card border-danger/30 bg-danger/5 p-3 text-sm text-danger">{detailError}</div>}
            {!detailLoading && detail && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">Item Detail</p>
                    <h2 className="text-2xl font-semibold">{detail.item.item}</h2>
                    <p className="text-sm text-muted">{detail.item.sku ?? "No SKU"}</p>
                  </div>
                  <div className="text-right">
                    <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${healthPillMap[detail.item.health_flag] ?? healthPillMap.healthy}`}>{detail.item.health_flag.replace("_", " ")}</p>
                    <button className="mt-2 block text-xs text-muted hover:text-foreground" onClick={() => setDetailOpen(false)}>Close</button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2"><button className="app-button" onClick={() => navigate("/purchasing/purchase-orders/new")}>Create PO</button><button className="app-button-secondary" onClick={() => navigate("/purchasing/purchase-orders")}>Receive</button><button className="app-button-ghost" onClick={() => navigate("/items")}>Adjust</button><button className="app-button-ghost" onClick={() => setEditingPlanning((v) => !v)}>{editingPlanning ? "Cancel planning edit" : "Edit planning"}</button></div>

                <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Reorder point (ROP)</p>
                  <p className="text-3xl font-semibold tabular-nums">{formatNumber(detail.item.reorder_point)}</p>
                  <p className="mt-2 text-xs text-muted">ROP = (Avg Daily Usage × Lead Time) + Safety Stock</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="app-card p-3"><p className="text-xs text-muted">Safety Stock</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.safety_stock)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Lead Time (days)</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.lead_time_days)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Avg Daily Usage ({usageDays}d)</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.avg_daily_usage)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Days of Supply</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.days_of_supply)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Projected Available</p><p className="font-semibold tabular-nums">{formatNumber(detail.projected_available)}</p><p className="mt-1 text-xs text-muted">Projected Available = On Hand − Reserved + Inbound</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Suggested Reorder Qty</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.suggested_reorder_qty)}</p><p className="mt-1 text-xs text-muted">Suggested Order Qty = max(0, Target Stock − Projected Available)</p></div>
                </div>

                {editingPlanning && (
                  <div className="mt-4 app-card p-4">
                    <p className="font-semibold">Edit planning fields</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm">ROP<input className="app-input mt-1" type="number" min={0} value={planningForm.reorder_point_qty} onChange={(event) => setPlanningForm((prev) => ({ ...prev, reorder_point_qty: Number(event.target.value) }))} /></label>
                      <label className="text-sm">Safety Stock<input className="app-input mt-1" type="number" min={0} value={planningForm.safety_stock_qty} onChange={(event) => setPlanningForm((prev) => ({ ...prev, safety_stock_qty: Number(event.target.value) }))} /></label>
                      <label className="text-sm">Lead Time (days)<input className="app-input mt-1" type="number" min={1} value={planningForm.lead_time_days} onChange={(event) => setPlanningForm((prev) => ({ ...prev, lead_time_days: Number(event.target.value) }))} /></label>
                      <label className="text-sm">Target Days Supply<input className="app-input mt-1" type="number" min={1} value={planningForm.target_days_supply} onChange={(event) => setPlanningForm((prev) => ({ ...prev, target_days_supply: Number(event.target.value) }))} /></label>
                    </div>
                    <button className="app-button mt-3" onClick={() => void savePlanning()} disabled={planningSaving}>{planningSaving ? "Saving…" : "Save planning"}</button>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="app-card p-3"><p className="text-xs text-muted">On hand</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.on_hand)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Available</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.available)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Reserved</p><button className="font-semibold tabular-nums text-primary underline" onClick={(event) => void openReservations(detail.item.id, event)}>{formatNumber(detail.item.reserved)}</button></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Inbound</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.inbound_qty)}</p></div>
                </div>
                <p className="mt-2 text-xs text-muted">Last updated: {detail.last_updated ? new Date(detail.last_updated).toLocaleString() : "No recent activity"}</p>

                <div className="mt-4 app-card p-3 text-sm"><p className="font-semibold">Reorder recommendation</p><p className="mt-1 text-muted">{detail.reorder_explanation}</p></div>
                <div className="mt-4 app-card p-3"><p className="font-semibold">Consumption trend (90 days)</p><div className="mt-2 h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={detail.consumption_trend}><CartesianGrid {...GRID_STYLE} /><XAxis dataKey="date" {...AXIS_STYLE} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} /><YAxis {...AXIS_STYLE} /><Tooltip formatter={(v: number) => formatNumber(v)} labelFormatter={(v) => new Date(v).toLocaleDateString()} /><Line type="monotone" dataKey="consumption" stroke={CHART_COLORS[0]} dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

