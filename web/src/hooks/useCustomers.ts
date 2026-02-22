/**
 * React Query hooks for the Customer module.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

// ── Types ────────────────────────────────────────────────

export type CustomerListItem = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  tier: string;
  is_active: boolean;
  created_at: string;
  total_revenue: number;
  outstanding_ar: number;
  invoice_count: number;
  last_invoice_date: string | null;
  avg_days_to_pay: number | null;
  payment_score: "good" | "average" | "slow" | "at-risk";
};

export type CustomersSummary = {
  total_customers: number;
  active_customers: number;
  total_revenue_ytd: number;
  total_outstanding_ar: number;
  avg_days_to_pay: number | null;
  customers_at_risk: number;
};

export type CustomerKpis = {
  lifetime_revenue: number;
  ytd_revenue: number;
  outstanding_ar: number;
  avg_days_to_pay: number | null;
  gross_margin_percent: number | null;
  total_invoices: number;
  total_payments: number;
  overdue_amount: number;
  payment_score: "good" | "average" | "slow" | "at-risk";
};

export type CustomerAgingBuckets = {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
};

export type RevenueTrendPoint = {
  period: string;
  revenue: number;
  payments: number;
};

export type ActivityItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  amount: number | null;
  reference: string | null;
  date: string;
  icon: string;
};

export type TopItem = {
  item_name: string;
  quantity: number;
  revenue: number;
};

export type CustomerBasic = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  notes?: string;
  tier: string;
  is_active: boolean;
  created_at: string;
};

export type Customer360Data = {
  customer: CustomerBasic;
  kpis: CustomerKpis;
  aging: CustomerAgingBuckets;
  revenue_trend: RevenueTrendPoint[];
  recent_activity: ActivityItem[];
  top_items: TopItem[];
};

export type CustomerFilters = {
  search?: string;
  tier?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};

// ── Hooks ────────────────────────────────────────────────

function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return parts ? `?${parts}` : "";
}

export function useCustomersSummary() {
  return useQuery({
    queryKey: ["customers", "summary"],
    queryFn: () => apiFetch<CustomersSummary>("/customers-summary"),
    staleTime: 30_000,
  });
}

export function useCustomersEnriched(filters: CustomerFilters = {}) {
  const qs = buildQuery({
    search: filters.search,
    tier: filters.tier,
    is_active: filters.is_active !== undefined ? String(filters.is_active) : undefined,
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
  });
  return useQuery({
    queryKey: ["customers", "enriched", filters],
    queryFn: () => apiFetch<CustomerListItem[]>(`/customers-enriched${qs}`),
    staleTime: 30_000,
  });
}

export function useCustomer360(customerId: number | undefined) {
  return useQuery({
    queryKey: ["customers", "360", customerId],
    queryFn: () => apiFetch<Customer360Data>(`/customers/${customerId}/360`),
    enabled: !!customerId,
    staleTime: 30_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CustomerBasic>) =>
      apiFetch<CustomerBasic>("/customers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomerBasic> }) =>
      apiFetch<CustomerBasic>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useArchiveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<CustomerBasic>(`/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
