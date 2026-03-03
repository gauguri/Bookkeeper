import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { OverviewItem } from "../components/inventory/InventoryOverviewCard";

export type InventoryQueueCount = { key: string; label: string; count: number };

type InventoryOverviewResponse = {
  totals: {
    total_on_hand_qty?: number | null;
    total_reserved_qty?: number | null;
    total_available_qty?: number | null;
    total_inventory_value?: number | null;
  };
  items: OverviewItem[];
  queues: InventoryQueueCount[];
  data_quality: {
    missing_landed_cost_count: number;
  };
};

const toNumber = (value: unknown, path: string): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    console.warn(`[InventoryOverview] Missing or invalid numeric field: ${path}`, { value });
    return 0;
  }
  return numeric;
};

const normalizeOverviewResponse = (payload: unknown): InventoryOverviewResponse => {
  const root = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};
  const totalsRaw = (root.totals && typeof root.totals === "object") ? root.totals as Record<string, unknown> : {};
  const itemsRaw = Array.isArray(root.items) ? root.items : [];
  const queues = Array.isArray(root.queues) ? root.queues as InventoryQueueCount[] : [];
  const dataQualityRaw = (root.data_quality && typeof root.data_quality === "object") ? root.data_quality as Record<string, unknown> : {};

  const totals = {
    total_on_hand_qty: toNumber(totalsRaw.total_on_hand_qty, "totals.total_on_hand_qty"),
    total_reserved_qty: toNumber(totalsRaw.total_reserved_qty, "totals.total_reserved_qty"),
    total_available_qty: toNumber(totalsRaw.total_available_qty, "totals.total_available_qty"),
    total_inventory_value: toNumber(totalsRaw.total_inventory_value, "totals.total_inventory_value"),
  };

  const items: OverviewItem[] = itemsRaw.map((entry, index) => {
    const row = (entry && typeof entry === "object") ? entry as Record<string, unknown> : {};
    return {
      item_id: toNumber(row.item_id, `items[${index}].item_id`),
      item_name: String(row.item_name ?? `Item #${index + 1}`),
      sku: row.sku == null ? null : String(row.sku),
      on_hand_qty: toNumber(row.on_hand_qty, `items[${index}].on_hand_qty`),
      reserved_qty: toNumber(row.reserved_qty, `items[${index}].reserved_qty`),
      available_qty: toNumber(row.available_qty, `items[${index}].available_qty`),
      landed_unit_cost: row.landed_unit_cost == null ? null : toNumber(row.landed_unit_cost, `items[${index}].landed_unit_cost`),
      available_value: toNumber(row.available_value, `items[${index}].available_value`),
      reserved_value: toNumber(row.reserved_value, `items[${index}].reserved_value`),
      total_value: toNumber(row.total_value, `items[${index}].total_value`),
    };
  });

  console.debug("[InventoryOverview] API response", payload);

  return {
    totals,
    items,
    queues,
    data_quality: {
      missing_landed_cost_count: toNumber(dataQualityRaw.missing_landed_cost_count, "data_quality.missing_landed_cost_count"),
    },
  };
};

export function useInventoryOverview(limit: number | "all") {
  const [data, setData] = useState<InventoryOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const queryLimit = limit === "all" ? 0 : limit;
        const response = await apiFetch<unknown>(`/inventory/analytics/overview?limit=${queryLimit}`);
        setData(normalizeOverviewResponse(response));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [limit]);

  return {
    totals: data?.totals ?? null,
    items: data?.items ?? [],
    queues: data?.queues ?? [],
    data_quality: data?.data_quality ?? { missing_landed_cost_count: 0 },
    loading,
    error,
  };
}
