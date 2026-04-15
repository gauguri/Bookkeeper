/**
 * React Query hooks for the Item module.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

// ── Types ────────────────────────────────────────────────

export type ItemListEnriched = {
  id: number;
  name: string;
  sku?: string | null;
  unit_price: number;
  is_active: boolean;
  created_at: string;
  on_hand_qty: number;
  available_qty: number;
  inventory_value: number;
  total_revenue_ytd: number;
  units_sold_ytd: number;
  gross_margin_percent: number | null;
  preferred_supplier_name: string | null;
  preferred_landed_cost: number | null;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "overstocked";
  unique_customers: number;
};

export type ItemListPage = {
  items: ItemListEnriched[];
  total_count: number;
  page: number;
  page_size: number;
};

export type ItemsSummary = {
  total_items: number;
  active_items: number;
  total_inventory_value: number;
  total_revenue_ytd: number;
  low_stock_items: number;
  out_of_stock_items: number;
};

export type ItemCatalogSpotlight = {
  item_id: number;
  item_code?: string | null;
  item_name: string;
  revenue: number;
  units: number;
  change_percent: number | null;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "overstocked";
  on_hand_qty: number;
  inventory_value: number;
};

export type ItemCatalogTrendPoint = {
  period: string;
  item_id: number;
  item_code?: string | null;
  item_name: string;
  revenue: number;
  units: number;
};

export type ItemCatalogIntelligence = {
  period: "mtd" | "qtd" | "ytd" | "ltm";
  dead_stock_count: number;
  low_stock_high_demand_count: number;
  top_sellers: ItemCatalogSpotlight[];
  top_sellers_ytd: ItemCatalogSpotlight[];
  rising_items: ItemCatalogSpotlight[];
  declining_items: ItemCatalogSpotlight[];
  dead_stock: ItemCatalogSpotlight[];
  low_stock_high_demand: ItemCatalogSpotlight[];
  trend: ItemCatalogTrendPoint[];
};

export type ItemKpis = {
  total_revenue: number;
  ytd_revenue: number;
  units_sold_ytd: number;
  units_sold_total: number;
  avg_selling_price: number | null;
  gross_margin_percent: number | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  inventory_value: number;
  unique_customers: number;
  total_invoices: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "overstocked";
};

export type ItemSalesTrendPoint = {
  period: string;
  revenue: number;
  units: number;
};

export type ItemTopCustomer = {
  customer_id: number;
  customer_name: string;
  units: number;
  revenue: number;
};

export type ItemSupplierInfo = {
  supplier_id: number;
  supplier_name: string;
  supplier_cost: number;
  freight_cost: number;
  tariff_cost: number;
  landed_cost: number;
  is_preferred: boolean;
  lead_time_days: number | null;
  min_order_qty: number | null;
};

export type ItemMovement = {
  id: number;
  date: string;
  reason: string;
  qty_delta: number;
  ref_type: string | null;
  ref_id: number | null;
};

export type ItemDetail = {
  id: number;
  item_code?: string | null;
  sku?: string | null;
  name: string;
  color?: string | null;
  monument_type?: string | null;
  lr_feet?: number | null;
  lr_inches?: number | null;
  fb_feet?: number | null;
  fb_inches?: number | null;
  tb_feet?: number | null;
  tb_inches?: number | null;
  shape?: string | null;
  finish?: string | null;
  category?: string | null;
  description?: string | null;
  sales_description?: string | null;
  purchase_description?: string | null;
  unit_price: number;
  cost_price?: number | null;
  weight_lbs?: number | null;
  location?: string | null;
  peach_id?: string | null;
  new_code?: string | null;
  exclude_from_price_list?: boolean;
  upload_to_peach?: boolean;
  item_type?: string | null;
  inventory_check?: boolean;
  income_account_id?: number | null;
  is_active: boolean;
  created_at: string;
  preferred_supplier_id: number | null;
  preferred_supplier_name: string | null;
  preferred_landed_cost: number | null;
  on_hand_qty: number;
  reserved_qty: number;
  reorder_point: number | null;
};

export type Item360Data = {
  item: ItemDetail;
  kpis: ItemKpis;
  sales_trend: ItemSalesTrendPoint[];
  top_customers: ItemTopCustomer[];
  suppliers: ItemSupplierInfo[];
  recent_movements: ItemMovement[];
};

export type ItemFilters = {
  search?: string;
  is_active?: boolean;
  stock_status?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
};

// ── Hooks ────────────────────────────────────────────────

function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return parts ? `?${parts}` : "";
}

export function useItemsSummary() {
  return useQuery({
    queryKey: ["items", "summary"],
    queryFn: () => apiFetch<ItemsSummary>("/items-summary"),
    staleTime: 30_000,
  });
}

export function useItemsCatalogIntelligence(period: "mtd" | "qtd" | "ytd" | "ltm" = "ytd", topN = 5) {
  return useQuery({
    queryKey: ["items", "catalog-intelligence", period, topN],
    queryFn: () => apiFetch<ItemCatalogIntelligence>(`/items-catalog-intelligence?period=${period}&top_n=${topN}`),
    staleTime: 30_000,
  });
}

export function useItemsEnriched(filters: ItemFilters = {}) {
  const qs = buildQuery({
    search: filters.search,
    is_active: filters.is_active !== undefined ? String(filters.is_active) : undefined,
    stock_status: filters.stock_status,
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
    page: filters.page !== undefined ? String(filters.page) : undefined,
    page_size: filters.page_size !== undefined ? String(filters.page_size) : undefined,
  });
  return useQuery({
    queryKey: ["items", "enriched", filters],
    queryFn: () => apiFetch<ItemListPage>(`/items-enriched${qs}`),
    staleTime: 30_000,
  });
}

export function useItem360(itemId: number | string | undefined) {
  return useQuery({
    queryKey: ["items", "360", itemId],
    queryFn: () => apiFetch<Item360Data>(`/items/${itemId}/360`),
    enabled: itemId !== undefined && itemId !== null && String(itemId).trim().length > 0,
    staleTime: 30_000,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<ItemDetail>("/items", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      apiFetch<ItemDetail>(`/items/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useArchiveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<ItemDetail>(`/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
