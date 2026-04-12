import { useMemo, useState, type MouseEvent } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Package, Tag, DollarSign, Truck, Edit3 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MonumentPreviewCard from "../items/MonumentPreviewCard";
import StockStatusBadge from "../items/StockStatusBadge";
import { useItem360 } from "../../hooks/useItems";
import { formatCompact, formatCurrency, formatPercent } from "../../utils/formatters";
import { AXIS_STYLE, GRID_STYLE } from "../../utils/chartHelpers";
import { CHART_COLORS } from "../../utils/colorScales";

type InventoryReservation = {
  source_type: string;
  source_id: number;
  source_label: string;
  qty_reserved: number;
};

type InventoryDetail = {
  item: {
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
    total_value: number;
    inbound_qty: number;
    health_flag: string;
  };
  movements: { id: number; reason: string; qty_delta: number; created_at: string }[];
  reservations: InventoryReservation[];
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

type Props = {
  isOpen: boolean;
  itemId: number | null;
  usageDays: number;
  detail: InventoryDetail | null;
  detailLoading: boolean;
  detailError: string;
  planningForm: PlanningPayload;
  editingPlanning: boolean;
  planningSaving: boolean;
  onClose: () => void;
  onOpenAdjustment: (itemId: number) => void;
  onCreatePO: (itemId: number, reorderQty: number) => void;
  onReceive: () => void;
  onTogglePlanning: () => void;
  onPlanningChange: (payload: PlanningPayload) => void;
  onSavePlanning: () => void;
  onOpenReservations: (itemId: number, event: MouseEvent) => void;
};

const formatNumber = (value: number) => (Number.isFinite(value) ? formatCompact(value) : "0");

export default function InventoryItemDetailModal({
  isOpen,
  itemId,
  usageDays,
  detail,
  detailLoading,
  detailError,
  planningForm,
  editingPlanning,
  planningSaving,
  onClose,
  onOpenAdjustment,
  onCreatePO,
  onReceive,
  onTogglePlanning,
  onPlanningChange,
  onSavePlanning,
  onOpenReservations,
}: Props) {
  const { data, isLoading, error } = useItem360(itemId ?? undefined);
  const [showDetails, setShowDetails] = useState(true);

  const monumentAttributes = useMemo(() => {
    if (!data) return [];
    const { item, kpis } = data;
    return [
      { label: "Item Code", value: item.item_code || item.sku || "-" },
      { label: "Color", value: item.color || "-" },
      { label: "Type", value: item.monument_type || "-" },
      { label: "LR (ft)", value: item.lr_feet != null ? Number(item.lr_feet).toLocaleString() : "-" },
      { label: "LR (in.)", value: item.lr_inches != null ? Number(item.lr_inches).toLocaleString() : "-" },
      { label: "FB (ft)", value: item.fb_feet != null ? Number(item.fb_feet).toLocaleString() : "-" },
      { label: "FB (in.)", value: item.fb_inches != null ? Number(item.fb_inches).toLocaleString() : "-" },
      { label: "TB (ft)", value: item.tb_feet != null ? Number(item.tb_feet).toLocaleString() : "-" },
      { label: "TB (in.)", value: item.tb_inches != null ? Number(item.tb_inches).toLocaleString() : "-" },
      { label: "Shape", value: item.shape || "-" },
      { label: "Finish", value: item.finish || "-" },
      { label: "Category", value: item.category || "-" },
      { label: "Quantity", value: Number(kpis.on_hand_qty).toLocaleString() },
      { label: "Sell Price", value: formatCurrency(Number(item.unit_price), true) },
      { label: "Item Description", value: item.description || "-" },
      { label: "Sales Description", value: item.sales_description || "-" },
      { label: "Purchase Description", value: item.purchase_description || "-" },
      { label: "Cost Price", value: item.cost_price != null ? formatCurrency(Number(item.cost_price), true) : "-" },
      { label: "Weight (lbs)", value: item.weight_lbs != null ? Number(item.weight_lbs).toLocaleString() : "-" },
      { label: "Location", value: item.location || "-" },
      { label: "PeachID", value: item.peach_id || "-" },
      { label: "NewCode", value: item.new_code || "-" },
      { label: "ReOrder Qty", value: item.reorder_point != null ? Number(item.reorder_point).toLocaleString() : "-" },
      { label: "Exclude From Price List", value: item.exclude_from_price_list ? "Yes" : "No" },
      { label: "UploadtoPeach", value: item.upload_to_peach ? "Yes" : "No" },
      { label: "ItemType", value: item.item_type || "-" },
      { label: "InventoryCheck", value: item.inventory_check ? "Yes" : "No" },
    ];
  }, [data]);

  if (!isOpen) return null;

  const itemError = error || !data;
  const inventoryItem = detail?.item ?? null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 py-6" onClick={onClose}>
      <div className="app-card h-full max-h-[92vh] w-full max-w-6xl overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}>
        {isLoading || detailLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-secondary" />)}
          </div>
        ) : itemError ? (
          <div className="app-card p-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-2 text-sm text-muted">{detailError || "Failed to load item detail."}</p>
            <button className="app-button mt-4" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-glow">
                  <Package className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold">{data.item.name}</h2>
                    <StockStatusBadge status={data.kpis.stock_status} size="md" />
                    {!data.item.is_active ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                    {data.item.sku ? (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" /> SKU: {data.item.sku}
                      </span>
                    ) : null}
                    {data.item.item_code && data.item.item_code !== data.item.sku ? (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Code: {data.item.item_code}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> List: {formatCurrency(Number(data.item.unit_price), true)}
                    </span>
                    {data.item.preferred_supplier_name ? (
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {data.item.preferred_supplier_name}
                        {data.item.preferred_landed_cost != null ? ` (${formatCurrency(Number(data.item.preferred_landed_cost), true)})` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="app-button-ghost flex items-center gap-1.5 text-xs" onClick={() => setShowDetails((prev) => !prev)}>
                  <Edit3 className="h-3.5 w-3.5" /> Details
                  {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <button className="app-button-ghost" onClick={onClose}>Close</button>
              </div>
            </div>

            <MonumentPreviewCard item={data.item} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="app-button" onClick={() => onCreatePO(data.item.id, Number(inventoryItem?.suggested_reorder_qty ?? 0))}>Create PO</button>
              <button className="app-button-secondary" onClick={onReceive}>Receive</button>
              <button className="app-button-ghost" onClick={() => onOpenAdjustment(data.item.id)}>Adjust</button>
              <button className="app-button-ghost" onClick={onTogglePlanning}>{editingPlanning ? "Cancel planning edit" : "Edit planning"}</button>
            </div>

            {showDetails ? (
              <div className="mt-4 rounded-xl border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Monument Attributes</p>
                  <p className="text-xs text-muted">Imported from the Glenrock inventory master file.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {monumentAttributes.map((attribute) => (
                    <div key={attribute.label} className="rounded-xl border border-border/60 bg-background px-3 py-3 text-sm">
                      <span className="text-xs text-muted">{attribute.label}</span>
                      <p className="mt-1 whitespace-pre-wrap break-words font-medium">{attribute.value}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-border/60 bg-background px-3 py-3 text-sm">
                    <span className="text-xs text-muted">Gross Margin</span>
                    <p className={`mt-1 font-medium ${data.kpis.gross_margin_percent != null && data.kpis.gross_margin_percent < 20 ? "text-red-600" : "text-emerald-600"}`}>
                      {data.kpis.gross_margin_percent != null ? formatPercent(data.kpis.gross_margin_percent) : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {inventoryItem ? (
              <>
                <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Reorder point (ROP)</p>
                  <p className="text-3xl font-semibold tabular-nums">{formatNumber(inventoryItem.reorder_point)}</p>
                  <p className="mt-2 text-xs text-muted">ROP = (Avg Daily Usage × Lead Time) + Safety Stock</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="app-card p-3"><p className="text-xs text-muted">Safety Stock</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.safety_stock)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Lead Time (days)</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.lead_time_days)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Avg Daily Usage ({usageDays}d)</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.avg_daily_usage)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Days of Supply</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.days_of_supply)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Projected Available</p><p className="font-semibold tabular-nums">{formatNumber(detail?.projected_available ?? 0)}</p><p className="mt-1 text-xs text-muted">Projected Available = On Hand − Reserved + Inbound</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Suggested Reorder Qty</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.suggested_reorder_qty)}</p><p className="mt-1 text-xs text-muted">Suggested Order Qty = max(0, Target Stock − Projected Available)</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">On hand</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.on_hand)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Available</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.available)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Reserved</p><button className="font-semibold tabular-nums text-primary underline" onClick={(event) => onOpenReservations(data.item.id, event)}>{formatNumber(inventoryItem.reserved)}</button></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Inbound</p><p className="font-semibold tabular-nums">{formatNumber(inventoryItem.inbound_qty)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Inventory Value</p><p className="font-semibold tabular-nums">{formatCurrency(inventoryItem.total_value, true)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Target Stock</p><p className="font-semibold tabular-nums">{formatNumber(detail?.target_stock ?? 0)}</p></div>
                </div>
                <p className="mt-2 text-xs text-muted">Last updated: {detail?.last_updated ? new Date(detail.last_updated).toLocaleString() : "No recent activity"}</p>

                {editingPlanning ? (
                  <div className="mt-4 app-card p-4">
                    <p className="font-semibold">Edit planning fields</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm">ROP<input className="app-input mt-1" type="number" min={0} value={planningForm.reorder_point_qty} onChange={(event) => onPlanningChange({ ...planningForm, reorder_point_qty: Number(event.target.value) })} /></label>
                      <label className="text-sm">Safety Stock<input className="app-input mt-1" type="number" min={0} value={planningForm.safety_stock_qty} onChange={(event) => onPlanningChange({ ...planningForm, safety_stock_qty: Number(event.target.value) })} /></label>
                      <label className="text-sm">Lead Time (days)<input className="app-input mt-1" type="number" min={1} value={planningForm.lead_time_days} onChange={(event) => onPlanningChange({ ...planningForm, lead_time_days: Number(event.target.value) })} /></label>
                      <label className="text-sm">Target Days Supply<input className="app-input mt-1" type="number" min={1} value={planningForm.target_days_supply} onChange={(event) => onPlanningChange({ ...planningForm, target_days_supply: Number(event.target.value) })} /></label>
                    </div>
                    <button className="app-button mt-3" onClick={onSavePlanning} disabled={planningSaving}>{planningSaving ? "Saving..." : "Save planning"}</button>
                  </div>
                ) : null}

                <div className="mt-4 app-card p-3 text-sm"><p className="font-semibold">Reorder recommendation</p><p className="mt-1 text-muted">{detail?.reorder_explanation || "No recommendation available."}</p></div>
                <div className="mt-4 app-card p-3">
                  <p className="font-semibold">Consumption trend (90 days)</p>
                  <div className="mt-2 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={detail?.consumption_trend ?? []}>
                        <CartesianGrid {...GRID_STYLE} />
                        <XAxis dataKey="date" {...AXIS_STYLE} tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
                        <YAxis {...AXIS_STYLE} />
                        <Tooltip formatter={(value: number) => formatNumber(value)} labelFormatter={(value) => new Date(value).toLocaleDateString()} />
                        <Line type="monotone" dataKey="consumption" stroke={CHART_COLORS[0]} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
