import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Boxes, Download, Loader2, RefreshCcw, ShoppingCart, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { formatCurrency, formatDays } from "../utils/formatters";

type ReplenishmentRecommendationItem = {
  item_id: number;
  item: string;
  sku?: string | null;
  supplier_id?: number | null;
  supplier?: string | null;
  available: number;
  inbound_qty: number;
  reorder_point: number;
  safety_stock: number;
  avg_daily_usage: number;
  days_of_supply: number;
  target_days_supply: number;
  suggested_order_qty: number;
  recommended_order_qty: number;
  lead_time_days: number;
  min_order_qty: number;
  unit_cost?: number | null;
  landed_unit_cost?: number | null;
  estimated_order_value: number;
  health_flag: string;
  urgency: "critical" | "high" | "medium" | "low";
  stockout_date?: string | null;
  alternative_supplier_count: number;
  has_supplier_mapping: boolean;
  reason: string;
};

type ReplenishmentSupplierGroup = {
  supplier_id?: number | null;
  supplier: string;
  actionable: boolean;
  lead_time_days?: number | null;
  recommendation_count: number;
  total_estimated_order_value: number;
  items: ReplenishmentRecommendationItem[];
};

type ReplenishmentWorkbenchResponse = {
  generated_at: string;
  usage_days: number;
  summary: {
    total_recommendations: number;
    supplier_groups: number;
    unmapped_items: number;
    critical_items: number;
    total_estimated_order_value: number;
    recommended_units: number;
  };
  groups: ReplenishmentSupplierGroup[];
};

type ReplenishmentCreateResponse = {
  created_purchase_orders: { id: number; po_number: string; supplier_id: number; supplier: string; line_count: number; total: number }[];
  message: string;
};

const urgencyStyles: Record<string, string> = {
  critical: "border-rose-300/50 bg-rose-500/10 text-rose-700",
  high: "border-amber-300/50 bg-amber-500/10 text-amber-700",
  medium: "border-blue-300/50 bg-blue-500/10 text-blue-700",
  low: "border-slate-300/50 bg-slate-500/10 text-slate-700",
};

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatQty(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : "0";
}

function recommendationKey(itemId: number, supplierId?: number | null) {
  return `${supplierId ?? "unmapped"}:${itemId}`;
}

export default function ReplenishmentWorkbenchPage() {
  const navigate = useNavigate();
  const [usageDays, setUsageDays] = useState(90);
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [data, setData] = useState<ReplenishmentWorkbenchResponse | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [createdOrders, setCreatedOrders] = useState<ReplenishmentCreateResponse["created_purchase_orders"]>([]);

  const loadWorkbench = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ReplenishmentWorkbenchResponse>(`/inventory/replenishment/workbench?usage_days=${usageDays}`);
      setData(response);
      setSelectedKeys({});
      setQuantities(
        response.groups.reduce<Record<string, string>>((acc, group) => {
          group.items.forEach((item) => {
            acc[recommendationKey(item.item_id, group.supplier_id)] = String(item.recommended_order_qty);
          });
          return acc;
        }, {})
      );
    } catch (err) {
      setError((err as Error).message || "Unable to load replenishment recommendations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [usageDays]);

  const filteredGroups = useMemo(() => {
    if (!data) return [];
    return data.groups
      .map((group) => {
        const items = group.items.filter((item) => {
          if (urgencyFilter !== "all" && item.urgency !== urgencyFilter) return false;
          if (mappingFilter === "mapped" && !item.has_supplier_mapping) return false;
          if (mappingFilter === "unmapped" && item.has_supplier_mapping) return false;
          return true;
        });
        return { ...group, items, recommendation_count: items.length, total_estimated_order_value: items.reduce((sum, item) => sum + item.estimated_order_value, 0) };
      })
      .filter((group) => group.items.length > 0);
  }, [data, urgencyFilter, mappingFilter]);

  const selectedPayload = useMemo(() => {
    const payload: { item_id: number; supplier_id: number; quantity: number }[] = [];
    filteredGroups.forEach((group) => {
      const supplierId = group.supplier_id;
      if (!group.actionable || supplierId == null) return;
      group.items.forEach((item) => {
        const key = recommendationKey(item.item_id, supplierId);
        if (!selectedKeys[key]) return;
        const quantity = Number(quantities[key] ?? item.recommended_order_qty);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        payload.push({ item_id: item.item_id, supplier_id: supplierId, quantity });
      });
    });
    return payload;
  }, [filteredGroups, quantities, selectedKeys]);

  const selectedCount = selectedPayload.length;
  const selectedValue = selectedPayload.reduce((sum, line) => {
    const group = filteredGroups.find((entry) => entry.supplier_id === line.supplier_id);
    const item = group?.items.find((entry) => entry.item_id === line.item_id);
    const unitValue = Number(item?.landed_unit_cost ?? item?.unit_cost ?? 0);
    return sum + line.quantity * unitValue;
  }, 0);

  const toggleGroup = (group: ReplenishmentSupplierGroup, checked: boolean) => {
    if (!group.actionable || group.supplier_id == null) return;
    setSelectedKeys((prev) => {
      const next = { ...prev };
      group.items.forEach((item) => {
        next[recommendationKey(item.item_id, group.supplier_id)] = checked;
      });
      return next;
    });
  };

  const createDraftPurchaseOrders = async () => {
    if (!selectedPayload.length) {
      setError("Select at least one mapped replenishment recommendation before creating a replenishment draft purchase order.");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    const uniqueSupplierIds = Array.from(new Set(selectedPayload.map((line) => line.supplier_id)));
    navigate("/purchasing/purchase-orders/new", {
      state: {
        replenishmentLines: selectedPayload,
        allowedSupplierIds: uniqueSupplierIds,
        supplierId: uniqueSupplierIds[0] ?? null,
      },
    });

    setCreating(false);
  };

  const exportCsv = () => {
    const header = ["supplier", "item", "sku", "urgency", "available", "inbound", "days_of_supply", "recommended_order_qty", "lead_time_days", "estimated_order_value"];
    const lines = filteredGroups.flatMap((group) =>
      group.items.map((item) => [
        group.supplier,
        item.item,
        item.sku ?? "",
        item.urgency,
        item.available,
        item.inbound_qty,
        item.days_of_supply,
        quantities[recommendationKey(item.item_id, group.supplier_id)] ?? item.recommended_order_qty,
        item.lead_time_days,
        item.estimated_order_value,
      ])
    );
    const csv = [header.join(","), ...lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "replenishment-workbench.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <section className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="app-card h-28 animate-pulse" />)}</div>
        <div className="app-card h-96 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" onClick={() => navigate("/inventory")} type="button">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory Command Center
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Inventory Replenishment</p>
          <h1 className="text-3xl font-semibold">Demand-Driven Replenishment Workbench</h1>
          <p className="max-w-5xl text-muted">
            Convert stockout risk, supplier lead times, and demand velocity into controlled replenishment proposals. Review urgency, adjust buy quantities, and create grouped draft purchase orders without leaving the planning flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={exportCsv} type="button" disabled={!filteredGroups.length}>
            <Download className="h-4 w-4" /> Export recommendations
          </button>
          <button className="app-button-secondary" onClick={() => void loadWorkbench()} type="button" disabled={loading}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
          <button className="app-button" onClick={() => void createDraftPurchaseOrders()} type="button" disabled={creating || selectedCount === 0}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {creating ? "Creating draft PO(s)..." : `Create ${selectedCount || ""} Draft PO${selectedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Recommendations</p>
          <p className="mt-1 text-2xl font-semibold">{data?.summary.total_recommendations ?? 0}</p>
          <p className="text-xs text-muted">Actionable replenishment lines</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Critical items</p>
          <p className="mt-1 text-2xl font-semibold">{data?.summary.critical_items ?? 0}</p>
          <p className="text-xs text-muted">Immediate stockout or missing-source risk</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Supplier groups</p>
          <p className="mt-1 text-2xl font-semibold">{data?.summary.supplier_groups ?? 0}</p>
          <p className="text-xs text-muted">Draft POs that can be generated now</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Recommended units</p>
          <p className="mt-1 text-2xl font-semibold">{formatQty(data?.summary.recommended_units ?? 0)}</p>
          <p className="text-xs text-muted">Across the current recommendation set</p>
        </div>
        <div className="app-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Estimated order value</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(data?.summary.total_estimated_order_value ?? 0)}</p>
          <p className="text-xs text-muted">Based on mapped landed cost</p>
        </div>
      </div>

      <div className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className="app-select h-10" value={usageDays} onChange={(event) => setUsageDays(Number(event.target.value))}>
            <option value={30}>Demand 30D</option>
            <option value={60}>Demand 60D</option>
            <option value={90}>Demand 90D</option>
            <option value={120}>Demand 120D</option>
          </select>
          <select className="app-select h-10" value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)}>
            <option value="all">All urgencies</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="app-select h-10" value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value as "all" | "mapped" | "unmapped")}>
            <option value="all">Mapped + unmapped</option>
            <option value="mapped">Mapped only</option>
            <option value="unmapped">Needs supplier mapping</option>
          </select>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          <p className="font-medium text-foreground">Selected replenishment run</p>
          <p className="mt-1">{selectedCount} lines selected • {formatCurrency(selectedValue)} estimated spend</p>
        </div>
      </div>

      {!filteredGroups.length ? (
        <section className="app-card border-dashed p-12 text-center">
          <Boxes className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-4 text-lg font-semibold">No replenishment recommendations in this view</p>
          <p className="mt-2 text-sm text-muted">Change the urgency or mapping filters, or refresh after new demand/supplier updates land.</p>
        </section>
      ) : null}

      <div className="space-y-5">
        {filteredGroups.map((group) => {
          const actionableSelected = group.actionable && group.supplier_id != null
            ? group.items.every((item) => selectedKeys[recommendationKey(item.item_id, group.supplier_id)])
            : false;
          return (
            <section key={`${group.supplier}-${group.supplier_id ?? "unmapped"}`} className="app-card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{group.supplier}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${group.actionable ? "border-emerald-300/50 bg-emerald-500/10 text-emerald-700" : "border-amber-300/50 bg-amber-500/10 text-amber-700"}`}>
                      {group.actionable ? "Ready for PO" : "Mapping required"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {group.recommendation_count} line{group.recommendation_count === 1 ? "" : "s"} • {group.lead_time_days ? `${group.lead_time_days}d lead time` : "Lead time not set"} • {formatCurrency(group.total_estimated_order_value)} estimated order value
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {group.actionable ? (
                    <button className="app-button-secondary" onClick={() => toggleGroup(group, !actionableSelected)} type="button">
                      {actionableSelected ? "Clear supplier" : "Select supplier"}
                    </button>
                  ) : (
                    <button className="app-button-secondary" onClick={() => navigate("/procurement/suppliers")} type="button">
                      <Truck className="h-4 w-4" /> Map supplier items
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 text-left">Select</th>
                      <th className="px-3 py-3 text-left">Item</th>
                      <th className="px-3 py-3 text-left">Urgency</th>
                      <th className="px-3 py-3 text-right">Available</th>
                      <th className="px-3 py-3 text-right">Inbound</th>
                      <th className="px-3 py-3 text-right">DOS</th>
                      <th className="px-3 py-3 text-right">Lead Time</th>
                      <th className="px-3 py-3 text-right">Recommended Qty</th>
                      <th className="px-3 py-3 text-right">Unit Cost</th>
                      <th className="px-3 py-3 text-right">Order Value</th>
                      <th className="px-3 py-3 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {group.items.map((item) => {
                      const key = recommendationKey(item.item_id, group.supplier_id);
                      const quantityValue = quantities[key] ?? String(item.recommended_order_qty);
                      return (
                        <tr key={key} className="align-top">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              disabled={!group.actionable}
                              checked={Boolean(selectedKeys[key])}
                              onChange={(event) => setSelectedKeys((prev) => ({ ...prev, [key]: event.target.checked }))}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-foreground">{item.item}</div>
                            <div className="text-xs text-muted">{item.sku || "No SKU"}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${urgencyStyles[item.urgency] ?? urgencyStyles.low}`}>{item.urgency}</span>
                            <div className="mt-2 text-xs text-muted">{item.stockout_date ? `Stockout ${new Date(item.stockout_date).toLocaleDateString()}` : "No projected stockout"}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatQty(item.available)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatQty(item.inbound_qty)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatDays(item.days_of_supply, 1)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{item.lead_time_days}d</td>
                          <td className="px-3 py-3 text-right">
                            <input
                              className="app-input ml-auto h-10 w-28 text-right tabular-nums"
                              type="number"
                              min={0}
                              step="0.01"
                              value={quantityValue}
                              onChange={(event) => setQuantities((prev) => ({ ...prev, [key]: event.target.value }))}
                              disabled={!group.actionable}
                            />
                            <div className="mt-1 text-xs text-muted">MOQ {formatQty(item.min_order_qty)}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.landed_unit_cost ?? item.unit_cost ?? 0, true)}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatCurrency(item.estimated_order_value)}</td>
                          <td className="px-3 py-3 text-xs text-muted">
                            <p>{item.reason}</p>
                            {item.alternative_supplier_count > 0 ? <p className="mt-1">{item.alternative_supplier_count} alternate supplier option(s) available.</p> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {createdOrders.length ? (
        <section className="app-card space-y-3 p-5">
          <h2 className="text-lg font-semibold">Draft purchase orders created</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {createdOrders.map((order) => (
              <button key={order.id} className="rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-primary/40 hover:shadow-sm" onClick={() => navigate(`/purchasing/purchase-orders?edit=${order.id}`)} type="button">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{order.po_number}</p>
                <p className="mt-2 text-lg font-semibold">{order.supplier}</p>
                <p className="mt-1 text-sm text-muted">{order.line_count} line{order.line_count === 1 ? "" : "s"}</p>
                <p className="mt-3 text-base font-semibold">{formatCurrency(order.total)}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}




