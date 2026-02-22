/**
 * React Query hooks for all analytics endpoints.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

export type KpiData = {
  kpi_key: string;
  label: string;
  category: string;
  current_value: number;
  previous_value: number;
  change_absolute: number;
  change_percent: number;
  direction: "up" | "down" | "flat";
  status: "good" | "warning" | "critical";
  target_value: number | null;
  sparkline: number[];
  period: string;
  comparison_period: string;
  unit: string;
  drill_down_url: string;
};

export type AgingData = {
  kpi_key: string;
  label: string;
  category: string;
  total: number;
  buckets: Record<string, number>;
  bucket_labels: string[];
  bucket_values: number[];
};

export type TimeSeriesPoint = {
  period: string;
  value: number;
};

export type WaterfallItem = {
  label: string;
  value: number;
  type: string;
};

export type PnlData = {
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  operating_expenses: number;
  operating_income: number;
  operating_margin: number;
  net_income: number;
  net_margin: number;
  waterfall: WaterfallItem[];
};

export type AnomalyItem = {
  id: string;
  type: string;
  entity_type: string;
  entity_id: number;
  reference: string;
  description: string;
  value: number;
  z_score: number;
  severity: string;
  reason: string;
  date: string;
  customer_name: string;
};

export type DashboardData = {
  kpis: KpiData[];
  revenue_trend: TimeSeriesPoint[];
  ar_aging: AgingData;
  ap_aging: AgingData;
  anomalies: AnomalyItem[];
  pnl_summary: PnlData;
  computed_at: string;
};

export type ReceivablesData = {
  ar_total: KpiData;
  dso: KpiData;
  overdue_receivables: KpiData;
  collection_effectiveness: KpiData;
  average_invoice_value: KpiData;
  aging: AgingData;
  top_customers: { customer_id: number; customer_name: string; outstanding: number }[];
};

export type PayablesData = {
  aging: AgingData;
  top_vendors: { vendor_id: number; vendor_name: string; total_spend: number }[];
};

export type RevenueData = {
  revenue_mtd: KpiData;
  revenue_ytd: KpiData;
  revenue_growth_mom: KpiData;
  revenue_growth_yoy: KpiData;
  avg_revenue_per_customer: KpiData;
  revenue_by_category: { category: string; value: number }[];
  revenue_trend: TimeSeriesPoint[];
  active_customer_count: number;
};

export type ExpenseData = {
  total_operating_expenses: KpiData;
  cogs_total: KpiData;
  expense_by_category: { category: string; value: number }[];
};

export type CashFlowData = {
  historical_inflows: number[];
  historical_outflows: number[];
  forecast_periods: {
    period: string;
    projected_inflows: number;
    projected_outflows: number;
    net_cash_flow: number;
    cumulative: number;
  }[];
  expected_collections: number;
  burn_rate_monthly: number;
  trend: { slope: number; direction: string; r_squared: number };
};

export type FinancialHealthData = {
  score: number;
  status: string;
  ratios: KpiData[];
};

export type BalanceSheetData = {
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  inventory_value: number;
  net_assets: number;
  sections: Record<string, { label: string; total: number; items: { label: string; value: number }[] }>;
};

export type ForecastData = {
  method: string;
  historical: number[];
  forecast: number[];
  trend: { slope: number; direction: string; r_squared: number };
};

function buildQuery(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return parts ? `?${parts}` : "";
}

export function useDashboard(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "dashboard", period],
    queryFn: () => apiFetch<DashboardData>(`/analytics/dashboard?period=${period}`),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useKpis(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "kpis", period],
    queryFn: () =>
      apiFetch<{ kpis: KpiData[]; computed_at: string }>(`/analytics/kpis?period=${period}`),
    staleTime: 60_000,
  });
}

export function useKpi(kpiId: string, period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "kpi", kpiId, period],
    queryFn: () => apiFetch<KpiData>(`/analytics/kpis/${kpiId}?period=${period}`),
    staleTime: 60_000,
  });
}

export function useFinancialHealth() {
  return useQuery({
    queryKey: ["analytics", "financial-health"],
    queryFn: () => apiFetch<FinancialHealthData>("/analytics/financial-health"),
    staleTime: 60_000,
  });
}

export function useCashFlow(periods = 3) {
  return useQuery({
    queryKey: ["analytics", "cash-flow", periods],
    queryFn: () => apiFetch<CashFlowData>(`/analytics/cash-flow?periods=${periods}`),
    staleTime: 60_000,
  });
}

export function useReceivables(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "receivables", period],
    queryFn: () => apiFetch<ReceivablesData>(`/analytics/receivables?period=${period}`),
    staleTime: 60_000,
  });
}

export function usePayables(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "payables", period],
    queryFn: () => apiFetch<PayablesData>(`/analytics/payables?period=${period}`),
    staleTime: 60_000,
  });
}

export function useRevenue(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "revenue", period],
    queryFn: () => apiFetch<RevenueData>(`/analytics/revenue?period=${period}`),
    staleTime: 60_000,
  });
}

export function useExpenses(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "expenses", period],
    queryFn: () => apiFetch<ExpenseData>(`/analytics/expenses?period=${period}`),
    staleTime: 60_000,
  });
}

export function usePnl(period = "ytd") {
  return useQuery({
    queryKey: ["analytics", "pnl", period],
    queryFn: () => apiFetch<PnlData>(`/analytics/pnl?period=${period}`),
    staleTime: 60_000,
  });
}

export function useBalanceSheet(asOf?: string) {
  return useQuery({
    queryKey: ["analytics", "balance-sheet", asOf],
    queryFn: () =>
      apiFetch<BalanceSheetData>(`/analytics/balance-sheet${asOf ? `?as_of=${asOf}` : ""}`),
    staleTime: 60_000,
  });
}

export function useAnomalies() {
  return useQuery({
    queryKey: ["analytics", "anomalies"],
    queryFn: () => apiFetch<{ anomalies: AnomalyItem[]; total_count: number }>("/analytics/anomalies"),
    staleTime: 120_000,
  });
}

export function useForecast(metric: string, method = "sma", periods = 3) {
  return useQuery({
    queryKey: ["analytics", "forecast", metric, method, periods],
    queryFn: () =>
      apiFetch<ForecastData>(
        `/analytics/forecast/${metric}?method=${method}&periods=${periods}`
      ),
    staleTime: 300_000,
  });
}
