export type ProcurementKpiCard = {
  key: string;
  label: string;
  value: number;
  display_value: string;
  helper: string;
  unit: string;
};

export type ProcurementSpendTrendPoint = {
  month: string;
  actual_spend: number;
};

export type ProcurementVendorSpendPoint = {
  supplier_id: number;
  supplier_name: string;
  total_spend: number;
};

export type ProcurementCycleMetric = {
  key: string;
  stage: string;
  avg_days: number;
  sample_size: number;
};

export type ProcurementComplianceRule = {
  id: string;
  rule: string;
  passed: number;
  failed: number;
  total: number;
  rate_percent: number;
};

export type ProcurementRiskItem = {
  id: string;
  label: string;
  probability: number;
  impact: number;
  exposure: number;
  category: string;
  level: string;
};

export type ProcurementInsight = {
  id: string;
  title: string;
  description: string;
  recommendation: string;
  category: string;
};

export type ProcurementHubAnalytics = {
  cards: ProcurementKpiCard[];
  spend_trend: ProcurementSpendTrendPoint[];
  vendor_spend: ProcurementVendorSpendPoint[];
  cycle_metrics: ProcurementCycleMetric[];
  compliance_rules: ProcurementComplianceRule[];
  risk_items: ProcurementRiskItem[];
  insights: ProcurementInsight[];
};
