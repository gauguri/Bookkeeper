import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

/* ── Types ──────────────────────────────────────────────── */

export type PaymentListEnriched = {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  amount: string | number;
  applied_amount: string | number;
  payment_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type PaginatedPaymentList = {
  items: PaymentListEnriched[];
  total_count: number;
  limit: number;
  offset: number;
};

export type PaymentFilters = {
  search?: string;
  method?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  min_amount?: string;
  max_amount?: string;
  recent_days?: number;
  large_only?: boolean;
  limit?: number;
  offset?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ViewSummary = Record<string, any>;

/* ── Helpers ────────────────────────────────────────────── */

function buildQuery(
  params: Record<string, string | boolean | undefined>,
): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return parts ? `?${parts}` : "";
}

/* ── Hooks ──────────────────────────────────────────────── */

export function usePaymentsEnriched(filters: PaymentFilters = {}) {
  const qs = buildQuery({
    search: filters.search,
    method: filters.method,
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
    date_from: filters.date_from,
    date_to: filters.date_to,
    min_amount: filters.min_amount,
    max_amount: filters.max_amount,
    recent_days:
      filters.recent_days != null ? String(filters.recent_days) : undefined,
    large_only: filters.large_only ? "true" : undefined,
    limit: filters.limit != null ? String(filters.limit) : "25",
    offset: filters.offset != null ? String(filters.offset) : "0",
  });
  return useQuery({
    queryKey: ["payments", "enriched", filters],
    queryFn: () =>
      apiFetch<PaginatedPaymentList>(`/payments/enriched${qs}`),
    staleTime: 30_000,
  });
}

export function usePaymentsViewSummary(view: string) {
  return useQuery({
    queryKey: ["payments", "summary", view],
    queryFn: () => apiFetch<ViewSummary>(`/payments/summary/${view}`),
    staleTime: 30_000,
  });
}
