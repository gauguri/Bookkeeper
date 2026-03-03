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
        const response = await apiFetch<InventoryOverviewResponse>(`/inventory/analytics/overview?limit=${queryLimit}`);
        setData(response);
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
