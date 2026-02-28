// ── PO Hub Mock Data ──

export type KpiItem = {
  label: string;
  value: string;
  change: number;
  sparkline: number[];
  prefix?: string;
  suffix?: string;
};

export const PO_KPIS: KpiItem[] = [
  { label: "Total Spend", value: "$1.24M", change: 12.3, sparkline: [40, 45, 38, 52, 48, 60, 55, 65, 62, 70, 68, 78], prefix: "$" },
  { label: "Open POs", value: "47", change: -5.2, sparkline: [52, 50, 48, 55, 51, 49, 47, 50, 46, 48, 45, 47] },
  { label: "Avg Cycle Time", value: "8.2d", change: -18.4, sparkline: [14, 12, 11, 10, 9.5, 9, 8.8, 8.5, 8.4, 8.3, 8.2, 8.2], suffix: "d" },
  { label: "Savings Rate", value: "6.8%", change: 2.1, sparkline: [4.2, 4.5, 4.8, 5.0, 5.3, 5.5, 5.8, 6.0, 6.2, 6.4, 6.6, 6.8], suffix: "%" },
  { label: "On-Time Delivery", value: "94.2%", change: 3.7, sparkline: [85, 87, 88, 89, 90, 91, 91.5, 92, 93, 93.5, 94, 94.2], suffix: "%" },
  { label: "Pending Approvals", value: "12", change: -8.0, sparkline: [18, 16, 15, 17, 14, 13, 15, 14, 13, 12, 13, 12] },
];

export type SpendMonth = {
  month: string;
  actual: number;
  budget: number;
  forecast: number;
};

export const SPEND_ANALYSIS: SpendMonth[] = [
  { month: "Jan", actual: 85000, budget: 90000, forecast: 87000 },
  { month: "Feb", actual: 92000, budget: 90000, forecast: 91000 },
  { month: "Mar", actual: 78000, budget: 85000, forecast: 80000 },
  { month: "Apr", actual: 105000, budget: 95000, forecast: 100000 },
  { month: "May", actual: 98000, budget: 95000, forecast: 97000 },
  { month: "Jun", actual: 112000, budget: 100000, forecast: 108000 },
  { month: "Jul", actual: 95000, budget: 100000, forecast: 96000 },
  { month: "Aug", actual: 108000, budget: 105000, forecast: 106000 },
  { month: "Sep", actual: 118000, budget: 110000, forecast: 115000 },
  { month: "Oct", actual: 125000, budget: 115000, forecast: 120000 },
  { month: "Nov", actual: 110000, budget: 110000, forecast: 112000 },
  { month: "Dec", actual: 115000, budget: 120000, forecast: 118000 },
];

// Vendor performance radar now fetches real suppliers from API

export type P2PStage = {
  stage: string;
  avgDays: number;
  targetDays: number;
  bottleneck: boolean;
};

export const P2P_STAGES: P2PStage[] = [
  { stage: "Requisition", avgDays: 1.2, targetDays: 1.0, bottleneck: false },
  { stage: "Approval", avgDays: 3.5, targetDays: 2.0, bottleneck: true },
  { stage: "PO Creation", avgDays: 0.8, targetDays: 1.0, bottleneck: false },
  { stage: "Delivery", avgDays: 7.2, targetDays: 5.0, bottleneck: true },
  { stage: "Invoice Match", avgDays: 2.1, targetDays: 2.0, bottleneck: false },
  { stage: "Payment", avgDays: 1.5, targetDays: 1.5, bottleneck: false },
];

export type ComplianceRule = {
  id: string;
  rule: string;
  category: string;
  passed: number;
  failed: number;
  total: number;
};

export const COMPLIANCE_RULES: ComplianceRule[] = [
  { id: "R01", rule: "Three-way match completed", category: "Invoice", passed: 245, failed: 12, total: 257 },
  { id: "R02", rule: "Approval within authority limit", category: "Approval", passed: 198, failed: 3, total: 201 },
  { id: "R03", rule: "Vendor pre-qualified", category: "Vendor", passed: 150, failed: 8, total: 158 },
  { id: "R04", rule: "Contract terms validated", category: "Contract", passed: 120, failed: 15, total: 135 },
  { id: "R05", rule: "Budget availability confirmed", category: "Budget", passed: 280, failed: 5, total: 285 },
  { id: "R06", rule: "Segregation of duties enforced", category: "Control", passed: 310, failed: 2, total: 312 },
  { id: "R07", rule: "Duplicate invoice check passed", category: "Invoice", passed: 255, failed: 7, total: 262 },
  { id: "R08", rule: "Delivery receipt confirmed", category: "Receiving", passed: 188, failed: 22, total: 210 },
  { id: "R09", rule: "Tax compliance verified", category: "Tax", passed: 275, failed: 4, total: 279 },
  { id: "R10", rule: "Preferred supplier used", category: "Sourcing", passed: 165, failed: 35, total: 200 },
];

export type RiskItem = {
  id: string;
  label: string;
  probability: number;
  impact: number;
  exposure: number;
  category: string;
  level: "low" | "medium" | "high" | "critical";
};

export const RISK_DATA: RiskItem[] = [
  { id: "RK01", label: "Single-source dependency", probability: 0.7, impact: 0.9, exposure: 630000, category: "Supply", level: "critical" },
  { id: "RK02", label: "Currency fluctuation", probability: 0.6, impact: 0.5, exposure: 180000, category: "Financial", level: "medium" },
  { id: "RK03", label: "Lead time variability", probability: 0.8, impact: 0.6, exposure: 280000, category: "Delivery", level: "high" },
  { id: "RK04", label: "Quality non-conformance", probability: 0.3, impact: 0.8, exposure: 150000, category: "Quality", level: "medium" },
  { id: "RK05", label: "Regulatory change", probability: 0.2, impact: 0.9, exposure: 200000, category: "Compliance", level: "medium" },
  { id: "RK06", label: "Supplier bankruptcy", probability: 0.1, impact: 1.0, exposure: 500000, category: "Supply", level: "high" },
  { id: "RK07", label: "Logistics disruption", probability: 0.5, impact: 0.7, exposure: 320000, category: "Delivery", level: "high" },
  { id: "RK08", label: "Price escalation", probability: 0.6, impact: 0.4, exposure: 120000, category: "Financial", level: "medium" },
  { id: "RK09", label: "Cybersecurity breach", probability: 0.15, impact: 0.95, exposure: 450000, category: "IT", level: "high" },
  { id: "RK10", label: "Demand forecast error", probability: 0.5, impact: 0.5, exposure: 175000, category: "Planning", level: "medium" },
  { id: "RK11", label: "Contract non-compliance", probability: 0.3, impact: 0.6, exposure: 100000, category: "Legal", level: "low" },
  { id: "RK12", label: "Warehouse capacity", probability: 0.4, impact: 0.3, exposure: 80000, category: "Operations", level: "low" },
  { id: "RK13", label: "Sustainability violation", probability: 0.25, impact: 0.7, exposure: 210000, category: "ESG", level: "medium" },
  { id: "RK14", label: "Invoice fraud", probability: 0.1, impact: 0.85, exposure: 350000, category: "Financial", level: "high" },
  { id: "RK15", label: "Geopolitical instability", probability: 0.35, impact: 0.8, exposure: 400000, category: "Supply", level: "high" },
];

export type AIInsight = {
  id: string;
  title: string;
  description: string;
  confidence: number;
  trend: "up" | "down" | "stable";
  recommendation: string;
  category: string;
};

export const AI_INSIGHTS: AIInsight[] = [
  {
    id: "AI01",
    title: "Steel Price Surge Expected",
    description: "Commodity models predict 12-18% steel price increase in Q2 based on futures data and supply chain indicators.",
    confidence: 87,
    trend: "up",
    recommendation: "Consider locking in forward contracts for steel-heavy POs within the next 30 days.",
    category: "Price Prediction",
  },
  {
    id: "AI02",
    title: "Supplier Risk Alert Detected",
    description: "Payment pattern anomalies and delayed shipments suggest financial stress at a key supplier.",
    confidence: 74,
    trend: "down",
    recommendation: "Diversify 40% of at-risk supplier volume to qualified backup suppliers.",
    category: "Supplier Risk",
  },
  {
    id: "AI03",
    title: "Approval Bottleneck Detected",
    description: "Finance team approval step averages 3.5 days, 75% above target. Pattern indicates Thursday-Friday submissions queue longest.",
    confidence: 92,
    trend: "stable",
    recommendation: "Submit high-value POs Monday-Wednesday. Consider delegated approval for orders under $5,000.",
    category: "Process",
  },
  {
    id: "AI04",
    title: "Consolidation Opportunity",
    description: "15 POs from 3 suppliers in the last month share overlapping items. Consolidation could yield 8-12% volume discount.",
    confidence: 81,
    trend: "up",
    recommendation: "Merge monthly orders for top-volume suppliers into bi-weekly consolidated POs.",
    category: "Cost Savings",
  },
  {
    id: "AI05",
    title: "Seasonal Demand Shift",
    description: "Historical data shows Q3 packaging material demand increases 25%. Current inventory covers only 60% of projected need.",
    confidence: 89,
    trend: "up",
    recommendation: "Pre-order packaging materials by end of Q2 to avoid spot pricing and stockouts.",
    category: "Demand Planning",
  },
  {
    id: "AI06",
    title: "Payment Term Optimization",
    description: "Analysis shows 35% of early-pay discounts (2/10 net 30) are missed. Potential annual savings: $18,400.",
    confidence: 95,
    trend: "stable",
    recommendation: "Enable auto-payment for invoices with early-pay discounts below $2,000 threshold.",
    category: "Cost Savings",
  },
];

// MOCK_POS removed — PO table and detail slide-out now use real API data only

export const VENDOR_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];

export const RISK_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#dc2626",
};
