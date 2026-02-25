import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../api";
import DashboardFilter from "../components/analytics/DashboardFilter";
import { CHART_COLORS } from "../utils/colorScales";
import { formatCompact, formatCurrency } from "../utils/formatters";

type Summary = {
  inventory_value: number;
  low_stock_items: number;
  stockouts: number;
  at_risk_items: number;
  excess_dead_stock: number;
  reserved_pressure_items: number;
};

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

type Reservation = { source_type: string; source_id: number; source_label: string; qty_reserved: number };
type Detail = { item: ItemRow; movements: { id: number; reason: string; qty_delta: number; created_at: string }[]; reservations: Reservation[]; reorder_explanation: string };

const queueFlagMap: Record<string, string> = { low_stock: "low_stock", stockout: "stockouts", at_risk: "at_risk", excess: "excess", reserved_pressure: "reserved_pressure" };

const formatNumber = (value: number) => Number.isFinite(value) ? formatCompact(value) : "0";

export default function InventoryPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("ytd");
  const [queue, setQueue] = useState("needs_attention");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("total_value:desc");
  const [usageDays, setUsageDays] = useState(90);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [itemsData, setItemsData] = useState<InventoryItemsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
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

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, itemsRes, analyticsRes] = await Promise.all([
        apiFetch<Summary>(`/inventory/summary?usage_days=${usageDays}`),
        apiFetch<InventoryItemsResponse>(`/inventory/items?queue=${queue}&search=${encodeURIComponent(search)}&sort=${sort}&page=1&page_size=50&usage_days=${usageDays}`),
        apiFetch<AnalyticsResponse>("/inventory/analytics"),
      ]);
      setSummary(summaryRes);
      setItemsData(itemsRes);
      setAnalytics(analyticsRes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queue, sort, usageDays]);

  const kpis = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Inventory Value", value: formatCurrency(summary.inventory_value), queue: "all" },
      { label: "Low Stock Items", value: formatNumber(summary.low_stock_items), queue: "low_stock" },
      { label: "Stockouts", value: formatNumber(summary.stockouts), queue: "stockouts" },
      { label: "At Risk", value: formatNumber(summary.at_risk_items), queue: "at_risk" },
      { label: "Excess / Dead Stock", value: formatNumber(summary.excess_dead_stock), queue: "excess" },
      { label: "Backordered / Reserved Pressure", value: formatNumber(summary.reserved_pressure_items), queue: "reserved_pressure" },
    ];
  }, [summary]);

  const openDetail = async (itemId: number) => {
    const payload = await apiFetch<Detail>(`/inventory/items/${itemId}/detail`);
    setDetail(payload);
  };

  const openReservations = async (itemId: number, event: MouseEvent<HTMLButtonElement>) => {
    setPopover({ itemId, x: event.clientX + 8, y: event.clientY + 8 });
    const payload = await apiFetch<Reservation[]>(`/inventory/reservations/${itemId}`);
    setReservations(payload);
  };

  const createPOForSelection = async () => {
    const selected = (itemsData?.items ?? []).filter((row) => selectedIds.includes(row.id) && row.preferred_supplier_id && row.suggested_reorder_qty > 0);
    const grouped = new Map<number, ItemRow[]>();
    selected.forEach((row) => {
      const key = row.preferred_supplier_id as number;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    });
    for (const [supplierId, rows] of grouped.entries()) {
      await apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: supplierId,
          order_date: new Date().toISOString().slice(0, 10),
          lines: rows.map((row) => ({ item_id: row.id, quantity: Number(row.suggested_reorder_qty.toFixed(2)) })),
        }),
      });
    }
    await load();
    navigate("/purchase-orders");
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="app-card h-24 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="app-card h-24 animate-pulse" />)}</div>
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
          <button className="app-button" onClick={() => navigate("/purchase-orders")}><PackagePlus className="h-4 w-4" /> + Receive Inventory</button>
          <button className="app-button-secondary" onClick={createPOForSelection}><ShoppingCart className="h-4 w-4" /> + Create Purchase Order</button>
          <button className="app-button-ghost" onClick={() => navigate("/items")}><ArrowDownUp className="h-4 w-4" /> Adjust Stock</button>
          <button className="app-button-ghost"><Download className="h-4 w-4" /> Export</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 app-card p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search item or SKU" className="app-input h-9 w-64" />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-4"><p className="mb-2 font-semibold">Inventory Value Trend (12 Months)</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics?.value_trend}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Stock Health Breakdown</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analytics?.health_breakdown ?? []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>{(analytics?.health_breakdown ?? []).map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Top Items by Consumption</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics?.top_consumption}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" /><XAxis dataKey="item" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatNumber(v)} /><Bar dataKey="value" fill={CHART_COLORS[2]} /></BarChart></ResponsiveContainer></div></div>
        <div className="app-card p-4"><p className="mb-2 font-semibold">Demand vs Supply / Net Flow</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics?.net_flow}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="receipts" stackId="a" fill={CHART_COLORS[1]} /><Bar dataKey="issues" stackId="a" fill={CHART_COLORS[3]} /><Bar dataKey="reserved" stackId="a" fill={CHART_COLORS[4]} /></BarChart></ResponsiveContainer></div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="app-card p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          <div className="space-y-1">
            {(itemsData?.queue_counts ?? []).map((entry) => (
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
              <button className="app-button-ghost" onClick={() => setCompact((v) => !v)}><Boxes className="h-4 w-4" /> {compact ? "Comfort" : "Compact"}</button>
              <details className="relative"><summary className="app-button-ghost list-none"><Settings2 className="h-4 w-4" /> Columns</summary><div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border bg-surface p-2 shadow-xl">{Object.keys(visibleCols).map((key) => <label key={key} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={visibleCols[key]} onChange={(e) => setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }))} />{key.replace(/_/g, " ")}</label>)}</div></details>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs uppercase text-muted"><tr><th className="px-3 py-2"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? (itemsData?.items ?? []).map((x) => x.id) : [])} /></th><th className="px-3 py-2">Item</th><th className="px-3 py-2">On Hand</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2">Available</th><th className="px-3 py-2">ROP</th>{visibleCols.safety_stock && <th className="px-3 py-2">Safety</th>}{visibleCols.lead_time_days && <th className="px-3 py-2">Lead Time</th>}{visibleCols.avg_daily_usage && <th className="px-3 py-2">Avg Usage</th>}<th className="px-3 py-2">DOS</th><th className="px-3 py-2">ROQ</th><th className="px-3 py-2">Supplier</th>{visibleCols.last_receipt && <th className="px-3 py-2">Last Receipt</th>}{visibleCols.last_issue && <th className="px-3 py-2">Last Issue</th>}<th className="px-3 py-2">Total Value</th><th className="px-3 py-2">Actions</th></tr></thead>
              <tbody>
                {(itemsData?.items ?? []).map((row) => (
                  <tr key={row.id} className={`border-t border-muted/20 ${compact ? "text-xs" : ""}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))} /></td>
                    <td className="px-3 py-2"><button className="font-medium hover:underline" onClick={() => openDetail(row.id)}>{row.item}</button><p className="text-xs text-muted">{row.sku ?? "—"}</p></td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.on_hand)}</td>
                    <td className="px-3 py-2 tabular-nums"><button className="text-primary underline" onClick={(e) => openReservations(row.id, e)}>{formatNumber(row.reserved)}</button></td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.available)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.reorder_point)}</td>
                    {visibleCols.safety_stock && <td className="px-3 py-2 tabular-nums">{formatNumber(row.safety_stock)}</td>}
                    {visibleCols.lead_time_days && <td className="px-3 py-2">{row.lead_time_days}d</td>}
                    {visibleCols.avg_daily_usage && <td className="px-3 py-2 tabular-nums">{formatNumber(row.avg_daily_usage)}</td>}
                    <td className="px-3 py-2 tabular-nums">{formatNumber(row.days_of_supply)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{formatNumber(row.suggested_reorder_qty)}</td>
                    <td className="px-3 py-2">{row.preferred_supplier ?? "Unassigned"}</td>
                    {visibleCols.last_receipt && <td className="px-3 py-2">{row.last_receipt ? new Date(row.last_receipt).toLocaleDateString() : "—"}</td>}
                    {visibleCols.last_issue && <td className="px-3 py-2">{row.last_issue ? new Date(row.last_issue).toLocaleDateString() : "—"}</td>}
                    <td className="px-3 py-2 tabular-nums">{formatCurrency(row.total_value)}</td>
                    <td className="px-3 py-2"><div className="flex gap-1"><button className="app-button-ghost" onClick={() => openDetail(row.id)}>View</button><button className="app-button-ghost" onClick={() => setQueue(queueFlagMap[row.health_flag] ?? queue)}>Adjust</button><button className="app-button-ghost" onClick={() => { setSelectedIds([row.id]); createPOForSelection(); }}>Create PO</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(itemsData?.items?.length) && <div className="rounded-2xl border border-dashed border-border py-16 text-center"><p className="text-lg font-semibold">No items in this queue</p><p className="text-sm text-muted">Try another queue or adjust filters.</p></div>}
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

      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-5">
            <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wide text-muted">Item Detail</p><h2 className="text-xl font-semibold">{detail.item.item}</h2></div><button className="app-button-ghost" onClick={() => setDetail(null)}>Close</button></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="app-card p-3"><p className="text-xs text-muted">On hand</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.on_hand)}</p></div>
              <div className="app-card p-3"><p className="text-xs text-muted">Available</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.available)}</p></div>
              <div className="app-card p-3"><p className="text-xs text-muted">Reserved</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.reserved)}</p></div>
              <div className="app-card p-3"><p className="text-xs text-muted">Days of supply</p><p className="font-semibold tabular-nums">{formatNumber(detail.item.days_of_supply)}</p></div>
            </div>
            <div className="mt-4 app-card p-3 text-sm"><p className="font-semibold">Reorder recommendation</p><p className="mt-1 text-muted">{detail.reorder_explanation}</p></div>
            <div className="mt-4 app-card p-3"><p className="font-semibold">Recent movements</p><div className="mt-2 space-y-2">{detail.movements.map((movement) => <div key={movement.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm"><span>{movement.reason}</span><span className="tabular-nums">{formatNumber(movement.qty_delta)}</span></div>)}</div></div>
            <div className="mt-4 flex flex-wrap gap-2"><button className="app-button" onClick={() => navigate("/purchase-orders")}>Create PO</button><button className="app-button-secondary" onClick={() => navigate("/purchase-orders")}>Receive</button><button className="app-button-ghost" onClick={() => navigate("/items")}>Adjust</button><button className="app-button-ghost" onClick={() => navigate("/inventory")}>Transfer</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
