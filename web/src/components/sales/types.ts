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

export type QuoteLine = {
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
};
