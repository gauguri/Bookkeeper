import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

/* ── Types ──────────────────────────────────────────────── */

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "SHIPPED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "VOID";

export type InvoiceListEnriched = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  total: string | number;
  amount_due: string | number;
  subtotal: string | number;
  tax_total: string | number;
  line_count: number;
  payment_count: number;
  days_until_due: number | null;
  days_overdue: number | null;
  aging_bucket: string | null;
  sales_request_id: number | null;
  sales_request_number: string | null;
  created_at: string;
  updated_at: string;
};

export type PaginatedInvoiceList = {
  items: InvoiceListEnriched[];
  total_count: number;
  limit: number;
  offset: number;
};

export type InvoiceFilters = {
  search?: string;
  status?: string[];
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  min_total?: string;
  max_total?: string;
  overdue_only?: boolean;
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

export function useInvoicesEnriched(filters: InvoiceFilters = {}) {
  const qs = buildQuery({
    search: filters.search,
    status: filters.status?.join(","),
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
    date_from: filters.date_from,
    date_to: filters.date_to,
    min_total: filters.min_total,
    max_total: filters.max_total,
    overdue_only: filters.overdue_only ? "true" : undefined,
    limit: filters.limit != null ? String(filters.limit) : "25",
    offset: filters.offset != null ? String(filters.offset) : "0",
  });
  return useQuery({
    queryKey: ["invoices", "enriched", filters],
    queryFn: () =>
      apiFetch<PaginatedInvoiceList>(`/invoices/enriched${qs}`),
    staleTime: 30_000,
  });
}

export function useInvoicesViewSummary(view: string) {
  return useQuery({
    queryKey: ["invoices", "summary", view],
    queryFn: () => apiFetch<ViewSummary>(`/invoices/summary/${view}`),
    staleTime: 30_000,
  });
}
