/**
 * React Query hooks for the Sales Orders (Sales Requests) module.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

// ── Types ────────────────────────────────────────────────

export type SalesRequestStatus =
  | "NEW"
  | "QUOTED"
  | "CONFIRMED"
  | "INVOICED"
  | "SHIPPED"
  | "CLOSED"
  | "LOST"
  | "CANCELLED";

export type SalesRequestsSummary = {
  total_orders: number;
  pipeline_value: number;
  conversion_rate: number | null;
  avg_deal_size: number | null;
  overdue_orders: number;
  avg_cycle_time_days: number | null;
  orders_by_status: Record<string, number>;
};

export type SalesRequestListEnriched = {
  id: number;
  request_number: string;
  customer_id: number | null;
  customer_name: string | null;
  status: SalesRequestStatus;
  created_at: string;
  updated_at: string;
  requested_fulfillment_date: string | null;
  total_amount: number;
  line_count: number;
  days_open: number;
  created_by_user_id: number | null;
  created_by_name: string | null;
  has_linked_invoice: boolean;
  fulfillment_urgency: "overdue" | "due_soon" | "normal" | "none";
  estimated_margin_percent: number | null;
  notes: string | null;
};

export type SupplierOption = {
  supplier_id: number;
  supplier_name: string;
  supplier_cost: number;
  freight_cost: number;
  tariff_cost: number;
  landed_cost: number;
  is_preferred: boolean;
  lead_time_days: number | null;
};

export type SalesRequestLineDetail = {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  mwb_unit_price: number | null;
  mwb_confidence: string | null;
  mwb_confidence_score: number | null;
  mwb_explanation: string | null;
  mwb_computed_at: string | null;
  invoice_unit_price: number | null;
  invoice_line_total: number | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  supplier_options: SupplierOption[];
};

export type TimelineEntry = {
  status: SalesRequestStatus;
  label: string;
  occurred_at: string | null;
  completed: boolean;
  current: boolean;
};

export type SalesRequestKpis = {
  total_amount: number;
  line_count: number;
  avg_line_value: number | null;
  estimated_margin_percent: number | null;
  estimated_margin_amount: number | null;
  days_open: number;
  fulfillment_days_remaining: number | null;
};

export type CustomerRecentOrder = {
  id: number;
  request_number: string;
  status: SalesRequestStatus;
  total_amount: number;
  created_at: string;
};

export type SalesRequestDetail = {
  id: number;
  request_number: string;
  customer_id: number | null;
  customer_name: string | null;
  status: SalesRequestStatus;
  created_at: string;
  updated_at: string;
  created_by_user_id: number | null;
  notes: string | null;
  requested_fulfillment_date: string | null;
  total_amount: number;
  lines: SalesRequestLineDetail[];
  linked_invoice_id: number | null;
  linked_invoice_number: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  linked_invoice_status: string | null;
  linked_invoice_shipped_at: string | null;
  allowed_transitions: SalesRequestStatus[];
  timeline: TimelineEntry[];
};

export type SalesRequest360Data = SalesRequestDetail & {
  kpis: SalesRequestKpis;
  customer_recent_orders: CustomerRecentOrder[];
};

export type PaginatedSalesRequestList = {
  items: SalesRequestListEnriched[];
  total_count: number;
  limit: number;
  offset: number;
};

export type SalesRequestFilters = {
  search?: string;
  item_id?: number;
  status?: string[];
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  needs_attention?: boolean;
  limit?: number;
  offset?: number;
};

// ── Hooks ────────────────────────────────────────────────

function buildQuery(params: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return parts ? `?${parts}` : "";
}

export function useSalesRequestsSummary() {
  return useQuery({
    queryKey: ["sales-requests", "summary"],
    queryFn: () => apiFetch<SalesRequestsSummary>("/sales-requests/summary"),
    staleTime: 30_000,
  });
}

export function useSalesRequestsEnriched(filters: SalesRequestFilters = {}) {
  const qs = buildQuery({
    search: filters.search,
    item_id: filters.item_id != null ? String(filters.item_id) : undefined,
    status: filters.status?.join(","),
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
    date_from: filters.date_from,
    date_to: filters.date_to,
    needs_attention: filters.needs_attention ? "true" : undefined,
    limit: filters.limit != null ? String(filters.limit) : "25",
    offset: filters.offset != null ? String(filters.offset) : "0",
  });
  return useQuery({
    queryKey: ["sales-requests", "enriched", filters],
    queryFn: () =>
      apiFetch<PaginatedSalesRequestList>(`/sales-requests/enriched${qs}`),
    staleTime: 30_000,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ViewSummary = Record<string, any>;

export function useSalesRequestsViewSummary(view: string) {
  return useQuery({
    queryKey: ["sales-requests", "summary", view],
    queryFn: () =>
      apiFetch<ViewSummary>(`/sales-requests/summary/${view}`),
    staleTime: 30_000,
  });
}

export function useSalesRequest360(id: number | undefined) {
  return useQuery({
    queryKey: ["sales-requests", "360", id],
    queryFn: () => apiFetch<SalesRequest360Data>(`/sales-requests/${id}/360`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateSalesRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/sales-requests", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-requests"] });
    },
  });
}

export function useUpdateSalesRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch<SalesRequestDetail>(`/sales-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ workflow_status: status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-requests"] });
    },
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Record<string, unknown>;
    }) =>
      apiFetch(`/sales-requests/${id}/generate-invoice`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-requests"] });
    },
  });
}

export function useApplyMwb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      salesRequestId,
      lineId,
      qty,
    }: {
      salesRequestId: number;
      lineId: number;
      qty?: number;
    }) =>
      apiFetch(
        `/sales-requests/${salesRequestId}/line-items/${lineId}/apply-mwb`,
        {
          method: "POST",
          body: JSON.stringify({ qty: qty ?? null }),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-requests"] });
    },
  });
}
