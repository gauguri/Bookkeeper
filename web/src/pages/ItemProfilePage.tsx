import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, Package, Tag, DollarSign, BarChart3,
  Truck, Activity, AlertTriangle, Edit3, ChevronDown, ChevronUp, ArrowDownUp, PackagePlus, ShoppingCart,
} from "lucide-react";
import { apiFetch } from "../api";
import { useItem360 } from "../hooks/useItems";
import { formatCurrency, formatPercent } from "../utils/formatters";
import StockStatusBadge from "../components/items/StockStatusBadge";
import ItemKpiRow from "../components/items/ItemKpiRow";
import ItemSalesChart from "../components/items/ItemSalesChart";
import InventoryGauge from "../components/items/InventoryGauge";
import ItemTopCustomersTable from "../components/items/ItemTopCustomersTable";
import ItemSupplierTable from "../components/items/ItemSupplierTable";
import ItemMovementTimeline from "../components/items/ItemMovementTimeline";
import MonumentPreviewCard from "../components/items/MonumentPreviewCard";

type Tab = "overview" | "sales" | "inventory" | "suppliers";

type InventoryReservation = {
  source_type: string;
  source_id: number;
  source_label: string;
  qty_reserved: number;
};

type InventoryDetail = {
  item: {
    id: number;
    on_hand: number;
    reserved: number;
    available: number;
    reorder_point: number;
    safety_stock: number;
    lead_time_days: number;
    avg_daily_usage: number;
    days_of_supply: number;
    suggested_reorder_qty: number;
    total_value: number;
    inbound_qty: number;
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

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview",   label: "Overview",   icon: Activity },
  { key: "sales",      label: "Sales",      icon: BarChart3 },
  { key: "inventory",  label: "Inventory",  icon: Package },
  { key: "suppliers",  label: "Suppliers",  icon: Truck },
];

export default function ItemProfilePage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { backTo?: string; backLabel?: string } | null) ?? null;
  const itemRef = itemId?.trim() || undefined;
  const numericItemId = itemRef && /^\d+$/.test(itemRef) ? parseInt(itemRef, 10) : undefined;
  const { data, isLoading, error } = useItem360(itemRef);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showDetails, setShowDetails] = useState(true);
  const [inventoryDetail, setInventoryDetail] = useState<InventoryDetail | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [editingPlanning, setEditingPlanning] = useState(false);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningForm, setPlanningForm] = useState<PlanningPayload>({
    reorder_point_qty: 0,
    safety_stock_qty: 0,
    lead_time_days: 14,
    target_days_supply: 30,
  });
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentQty, setAdjustmentQty] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState("");

  const inventoryContext = locationState?.backTo === "/inventory";

  useEffect(() => {
    if (!numericItemId || !inventoryContext) return;
    let cancelled = false;
    const loadInventoryDetail = async () => {
      setInventoryLoading(true);
      setInventoryError("");
      try {
        const payload = await apiFetch<InventoryDetail>(`/inventory/items/${numericItemId}/detail`);
        if (cancelled) return;
        const normalized: InventoryDetail = {
          ...payload,
          item: {
            ...payload.item,
            on_hand: toNumber(payload.item.on_hand),
            reserved: toNumber(payload.item.reserved),
            available: toNumber(payload.item.available),
            reorder_point: toNumber(payload.item.reorder_point),
            safety_stock: toNumber(payload.item.safety_stock),
            lead_time_days: toNumber(payload.item.lead_time_days),
            avg_daily_usage: toNumber(payload.item.avg_daily_usage),
            days_of_supply: toNumber(payload.item.days_of_supply),
            suggested_reorder_qty: toNumber(payload.item.suggested_reorder_qty),
            total_value: toNumber(payload.item.total_value),
            inbound_qty: toNumber(payload.item.inbound_qty),
          },
          projected_available: toNumber(payload.projected_available),
          target_stock: toNumber(payload.target_stock),
          reservations: (payload.reservations ?? []).map((reservation) => ({
            ...reservation,
            qty_reserved: toNumber(reservation.qty_reserved),
          })),
          movements: (payload.movements ?? []).map((movement) => ({
            ...movement,
            qty_delta: toNumber(movement.qty_delta),
          })),
          consumption_trend: (payload.consumption_trend ?? []).map((point) => ({
            ...point,
            consumption: toNumber(point.consumption),
          })),
        };
        setInventoryDetail(normalized);
        setPlanningForm({
          reorder_point_qty: normalized.item.reorder_point,
          safety_stock_qty: normalized.item.safety_stock,
          lead_time_days: normalized.item.lead_time_days || 14,
          target_days_supply: 30,
        });
      } catch (err) {
        if (!cancelled) {
          setInventoryError((err as Error).message);
          setInventoryDetail(null);
        }
      } finally {
        if (!cancelled) {
          setInventoryLoading(false);
        }
      }
    };
    void loadInventoryDetail();
    return () => {
      cancelled = true;
    };
  }, [numericItemId, inventoryContext]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card h-20 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load item data.</p>
        <button className="app-button mt-4" onClick={() => navigate(locationState?.backTo || "/sales/items")}>
          {locationState?.backLabel || "Back to Items"}
        </button>
      </div>
    );
  }

  const { item, kpis, sales_trend, top_customers, suppliers, recent_movements } = data;
  const backTo = locationState?.backTo || "/sales/items";
  const backLabel = locationState?.backLabel || "Back to Items";
  const handleCreatePo = () => {
    navigate("/purchasing/purchase-orders/new", {
      state: {
        prefillLines: [{
          item_id: item.id,
          quantity: Number(inventoryDetail?.item.suggested_reorder_qty ?? 0),
        }],
      },
    });
  };
  const handleReceive = () => navigate("/purchasing/purchase-orders");
  const refreshInventoryDetail = async () => {
    if (!numericItemId || !inventoryContext) return;
    const payload = await apiFetch<InventoryDetail>(`/inventory/items/${numericItemId}/detail`);
    const normalized: InventoryDetail = {
      ...payload,
      item: {
        ...payload.item,
        on_hand: toNumber(payload.item.on_hand),
        reserved: toNumber(payload.item.reserved),
        available: toNumber(payload.item.available),
        reorder_point: toNumber(payload.item.reorder_point),
        safety_stock: toNumber(payload.item.safety_stock),
        lead_time_days: toNumber(payload.item.lead_time_days),
        avg_daily_usage: toNumber(payload.item.avg_daily_usage),
        days_of_supply: toNumber(payload.item.days_of_supply),
        suggested_reorder_qty: toNumber(payload.item.suggested_reorder_qty),
        total_value: toNumber(payload.item.total_value),
        inbound_qty: toNumber(payload.item.inbound_qty),
      },
      projected_available: toNumber(payload.projected_available),
      target_stock: toNumber(payload.target_stock),
      reservations: (payload.reservations ?? []).map((reservation) => ({
        ...reservation,
        qty_reserved: toNumber(reservation.qty_reserved),
      })),
      movements: (payload.movements ?? []).map((movement) => ({
        ...movement,
        qty_delta: toNumber(movement.qty_delta),
      })),
      consumption_trend: (payload.consumption_trend ?? []).map((point) => ({
        ...point,
        consumption: toNumber(point.consumption),
      })),
    };
    setInventoryDetail(normalized);
  };
  const handleSavePlanning = async () => {
    if (!numericItemId) return;
    setPlanningSaving(true);
    setInventoryError("");
    try {
      await apiFetch(`/inventory/items/${numericItemId}/planning`, {
        method: "PUT",
        body: JSON.stringify(planningForm),
      });
      await refreshInventoryDetail();
      setEditingPlanning(false);
    } catch (err) {
      setInventoryError((err as Error).message);
    } finally {
      setPlanningSaving(false);
    }
  };
  const handleSaveAdjustment = async () => {
    if (!numericItemId) return;
    const qtyDelta = Number(adjustmentQty);
    if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
      setAdjustmentError("Enter a positive or negative quantity.");
      return;
    }
    setAdjustmentSaving(true);
    setAdjustmentError("");
    try {
      await apiFetch("/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          item_id: numericItemId,
          qty_delta: qtyDelta,
          reason: adjustmentReason.trim() || null,
        }),
      });
      await refreshInventoryDetail();
      setAdjustmentOpen(false);
      setAdjustmentQty("");
      setAdjustmentReason("");
    } catch (err) {
      setAdjustmentError((err as Error).message);
    } finally {
      setAdjustmentSaving(false);
    }
  };
  const monumentAttributes = [
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

  return (
    <div className="space-y-6">
      {/* ── Back button ── */}
      <button
        onClick={() => navigate(backTo)}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      {/* ── Header Card ── */}
      <div className="app-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: Name & badges */}
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-glow">
              <Package className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{item.name}</h1>
                <StockStatusBadge status={kpis.stock_status} size="md" />
                {!item.is_active && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    Archived
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                {item.sku && (
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> SKU: {item.sku}
                  </span>
                )}
                {item.item_code && item.item_code !== item.sku && (
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Code: {item.item_code}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> List: {formatCurrency(Number(item.unit_price), true)}
                </span>
                {item.preferred_supplier_name && (
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" /> {item.preferred_supplier_name}
                    {item.preferred_landed_cost != null && ` (${formatCurrency(Number(item.preferred_landed_cost), true)})`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="app-button-ghost flex items-center gap-1.5 text-xs"
              onClick={() => setShowDetails((p) => !p)}
            >
              <Edit3 className="h-3.5 w-3.5" /> Details
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <MonumentPreviewCard item={item} />

        {inventoryContext && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button className="app-button" onClick={handleCreatePo}>
                <ShoppingCart className="h-4 w-4" /> Create PO
              </button>
              <button className="app-button-secondary" onClick={handleReceive}>
                <PackagePlus className="h-4 w-4" /> Receive
              </button>
              <button
                className="app-button-ghost"
                onClick={() => {
                  setAdjustmentError("");
                  setAdjustmentQty("");
                  setAdjustmentReason("");
                  setAdjustmentOpen(true);
                }}
              >
                <ArrowDownUp className="h-4 w-4" /> Adjust
              </button>
              <button className="app-button-ghost" onClick={() => setEditingPlanning((value) => !value)}>
                {editingPlanning ? "Cancel planning edit" : "Edit planning"}
              </button>
            </div>

            {inventoryError && (
              <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {inventoryError}
              </div>
            )}

            {inventoryLoading ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary" />
                ))}
              </div>
            ) : inventoryDetail ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Reorder Point</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums">{inventoryDetail.item.reorder_point.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4">
                    <p className="text-xs text-muted">On Hand</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{inventoryDetail.item.on_hand.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4">
                    <p className="text-xs text-muted">Available</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{inventoryDetail.item.available.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4">
                    <p className="text-xs text-muted">Reserved</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{inventoryDetail.item.reserved.toLocaleString()}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Safety Stock</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.safety_stock.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Lead Time (days)</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.lead_time_days.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Avg Daily Usage</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.avg_daily_usage.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Days of Supply</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.days_of_supply.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Projected Available</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.projected_available.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Suggested Reorder Qty</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.suggested_reorder_qty.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Inbound</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.item.inbound_qty.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Target Stock</span>
                    <p className="mt-1 font-medium tabular-nums">{inventoryDetail.target_stock.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                    <span className="text-xs text-muted">Inventory Value</span>
                    <p className="mt-1 font-medium tabular-nums">{formatCurrency(inventoryDetail.item.total_value, true)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background px-4 py-4 text-sm">
                  <p className="font-semibold">Reorder Recommendation</p>
                  <p className="mt-2 text-muted">{inventoryDetail.reorder_explanation || "No recommendation available."}</p>
                  <p className="mt-3 text-xs text-muted">
                    Last updated: {inventoryDetail.last_updated ? new Date(inventoryDetail.last_updated).toLocaleString() : "No recent activity"}
                  </p>
                </div>

                {editingPlanning && (
                  <div className="rounded-xl border border-border/60 bg-background px-4 py-4">
                    <p className="font-semibold">Edit Planning</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm">
                        ROP
                        <input className="app-input mt-1" type="number" min={0} value={planningForm.reorder_point_qty} onChange={(event) => setPlanningForm((prev) => ({ ...prev, reorder_point_qty: Number(event.target.value) }))} />
                      </label>
                      <label className="text-sm">
                        Safety Stock
                        <input className="app-input mt-1" type="number" min={0} value={planningForm.safety_stock_qty} onChange={(event) => setPlanningForm((prev) => ({ ...prev, safety_stock_qty: Number(event.target.value) }))} />
                      </label>
                      <label className="text-sm">
                        Lead Time (days)
                        <input className="app-input mt-1" type="number" min={1} value={planningForm.lead_time_days} onChange={(event) => setPlanningForm((prev) => ({ ...prev, lead_time_days: Number(event.target.value) }))} />
                      </label>
                      <label className="text-sm">
                        Target Days Supply
                        <input className="app-input mt-1" type="number" min={1} value={planningForm.target_days_supply} onChange={(event) => setPlanningForm((prev) => ({ ...prev, target_days_supply: Number(event.target.value) }))} />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className="app-button" onClick={() => void handleSavePlanning()} disabled={planningSaving}>
                        {planningSaving ? "Saving..." : "Save planning"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Expandable details */}
        {showDetails && (
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
                <p className={`mt-1 font-medium ${
                  kpis.gross_margin_percent != null && kpis.gross_margin_percent < 20
                    ? "text-red-600" : "text-emerald-600"
                }`}>
                  {kpis.gross_margin_percent != null ? formatPercent(kpis.gross_margin_percent) : "N/A"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Row ── */}
      <ItemKpiRow kpis={kpis} />

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ItemSalesChart data={sales_trend} />
            <InventoryGauge kpis={kpis} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ItemTopCustomersTable customers={top_customers} />
            <ItemMovementTimeline movements={recent_movements} maxItems={8} />
          </div>
        </div>
      )}

      {activeTab === "sales" && (
        <div className="space-y-6">
          <ItemSalesChart data={sales_trend} />
          <ItemTopCustomersTable customers={top_customers} />
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InventoryGauge kpis={kpis} />
            <div className="app-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Inventory Summary</h3>
              <div className="space-y-3">
                {[
                  { label: "On Hand Quantity", value: Number(kpis.on_hand_qty).toLocaleString() },
                  { label: "Reserved Quantity", value: Number(kpis.reserved_qty).toLocaleString() },
                  { label: "Available Quantity", value: Number(kpis.available_qty).toLocaleString() },
                  { label: "Inventory Value", value: formatCurrency(Number(kpis.inventory_value), true) },
                  { label: "Avg Selling Price", value: kpis.avg_selling_price != null ? formatCurrency(Number(kpis.avg_selling_price), true) : "—" },
                  { label: "Reorder Point", value: item.reorder_point != null ? Number(item.reorder_point).toLocaleString() : "Not set" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <span className="text-sm text-muted">{row.label}</span>
                    <span className="text-sm font-semibold tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ItemMovementTimeline movements={recent_movements} maxItems={20} />
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="space-y-6">
          <ItemSupplierTable suppliers={suppliers} />
        </div>
      )}

      {adjustmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" onClick={() => !adjustmentSaving && setAdjustmentOpen(false)}>
          <div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Inventory</p>
                <h2 className="text-2xl font-semibold">Adjust Stock</h2>
                <p className="mt-1 text-sm text-muted">Post a manual stock adjustment without leaving the item page.</p>
              </div>
              <button className="app-button-ghost" onClick={() => setAdjustmentOpen(false)} disabled={adjustmentSaving}>Close</button>
            </div>

            <div className="mt-5 grid gap-4">
              {adjustmentError && <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{adjustmentError}</div>}

              <div className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Current on hand</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {Number(inventoryDetail?.item.on_hand ?? kpis.on_hand_qty).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Available: {Number(inventoryDetail?.item.available ?? kpis.available_qty).toLocaleString()}
                </p>
              </div>

              <label className="text-sm font-medium">
                Quantity change
                <input
                  className="app-input mt-1 w-full"
                  type="number"
                  step="0.01"
                  placeholder="Use -5 or +10"
                  value={adjustmentQty}
                  onChange={(event) => setAdjustmentQty(event.target.value)}
                />
              </label>

              <label className="text-sm font-medium">
                Reason
                <textarea
                  className="app-input mt-1 min-h-24 w-full"
                  placeholder="Cycle count variance, damage, opening balance, manual correction..."
                  value={adjustmentReason}
                  onChange={(event) => setAdjustmentReason(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button className="app-button-ghost" onClick={() => setAdjustmentOpen(false)} disabled={adjustmentSaving}>Cancel</button>
              <button className="app-button" onClick={() => void handleSaveAdjustment()} disabled={adjustmentSaving}>
                {adjustmentSaving ? "Saving..." : "Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
