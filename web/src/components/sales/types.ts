export type ListResponse<T> = { items: T[]; total_count: number };

export type SalesAccount = {
  id: number;
  name: string;
  industry?: string;
  owner_user_id?: number;
  updated_at: string;
  shipping_address?: string;
  website?: string;
  phone?: string;
};

export type SalesOpportunity = {
  id: number;
  account_id: number;
  name: string;
  stage: string;
  amount_estimate: number;
  probability: number;
  expected_close_date?: string;
  source?: string | null;
  next_step?: string | null;
  updated_at?: string;
};

export type QuoteLine = {
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
};

export type SalesQuote = {
  id: number;
  opportunity_id: number;
  quote_number: string;
  status: string;
  approval_status: string;
  total: number;
  updated_at: string;
  lines?: QuoteLine[];
};

export type SalesOrder = {
  id: number;
  order_number: string;
  status: string;
  total: number;
  fulfillment_type: string;
  updated_at: string;
};

export type ItemLookup = {
  id: number;
  name: string;
  sku?: string | null;
  unit_price: number;
  available_qty?: number;
  preferred_landed_cost?: number | null;
};

export type DealDeskCustomerContext = {
  account_id?: number | null;
  account_name?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  tier: string;
  ytd_revenue: number;
  lifetime_revenue: number;
  outstanding_ar: number;
  avg_days_to_pay?: number | null;
  gross_margin_percent?: number | null;
  payment_score: string;
  overdue_amount: number;
  top_items: Array<{ item_name: string; quantity: number; revenue: number }>;
};

export type DealDeskSummary = {
  subtotal: number;
  discount_total: number;
  total: number;
  recommended_total: number;
  recommended_revenue_uplift: number;
  gross_margin_percent?: number | null;
  approval_required: boolean;
  approval_reasons: string[];
  risk_flags: string[];
  deal_score: number;
  average_confidence_score: number;
  discount_policy_limit_percent: number;
  margin_floor_percent: number;
  next_best_actions: string[];
};

export type DealDeskLineEvaluation = {
  line_number: number;
  item_id?: number | null;
  description?: string | null;
  sku?: string | null;
  qty: number;
  entered_unit_price: number;
  entered_net_unit_price: number;
  discount_percent: number;
  line_total: number;
  list_price?: number | null;
  recommended_unit_price?: number | null;
  recommended_net_unit_price?: number | null;
  recommended_line_total?: number | null;
  floor_unit_price?: number | null;
  preferred_landed_cost?: number | null;
  margin_percent?: number | null;
  confidence: string;
  confidence_score: number;
  source_level: string;
  available_qty: number;
  stock_risk: string;
  approval_reasons: string[];
  opportunity_uplift: number;
  warnings: string[];
};

export type DealDeskUpsellSuggestion = {
  item_id: number;
  name: string;
  sku?: string | null;
  reason: string;
  available_qty: number;
  unit_price?: number | null;
  recommended_price?: number | null;
  co_purchase_count: number;
  revenue?: number | null;
};

export type DealDeskEvaluation = {
  opportunity_id: number;
  opportunity_name: string;
  account_id?: number | null;
  account_name?: string | null;
  customer: DealDeskCustomerContext;
  summary: DealDeskSummary;
  lines: DealDeskLineEvaluation[];
  upsell_suggestions: DealDeskUpsellSuggestion[];
};

export type RevenueControlSummary = {
  quotes_reviewed: number;
  pending_approvals: number;
  low_margin_quotes: number;
  revenue_uplift: number;
  largest_opportunities: Array<{
    quote_id: number;
    quote_number: string;
    account_name?: string | null;
    uplift?: number | null;
  }>;
};
