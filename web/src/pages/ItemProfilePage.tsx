import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Package, Tag, DollarSign, BarChart3,
  Truck, Activity, AlertTriangle, Edit3, ChevronDown, ChevronUp,
} from "lucide-react";
import { useItem360 } from "../hooks/useItems";
import { formatCurrency, formatPercent } from "../utils/formatters";
import StockStatusBadge from "../components/items/StockStatusBadge";
import ItemKpiRow from "../components/items/ItemKpiRow";
import ItemSalesChart from "../components/items/ItemSalesChart";
import InventoryGauge from "../components/items/InventoryGauge";
import ItemTopCustomersTable from "../components/items/ItemTopCustomersTable";
import ItemSupplierTable from "../components/items/ItemSupplierTable";
import ItemMovementTimeline from "../components/items/ItemMovementTimeline";

type Tab = "overview" | "sales" | "inventory" | "suppliers";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview",   label: "Overview",   icon: Activity },
  { key: "sales",      label: "Sales",      icon: BarChart3 },
  { key: "inventory",  label: "Inventory",  icon: Package },
  { key: "suppliers",  label: "Suppliers",  icon: Truck },
];

export default function ItemProfilePage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const id = itemId ? parseInt(itemId, 10) : undefined;
  const { data, isLoading, error } = useItem360(id);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showDetails, setShowDetails] = useState(true);

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
        <button className="app-button mt-4" onClick={() => navigate("/sales/items")}>
          Back to Items
        </button>
      </div>
    );
  }

  const { item, kpis, sales_trend, top_customers, suppliers, recent_movements } = data;
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
        onClick={() => navigate("/sales/items")}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Items
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
    </div>
  );
}
