import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingUp, DollarSign, Package, AlertTriangle, Clock, FileText, BarChart3, Wallet } from "lucide-react";
import { apiFetch } from "../api";
import GrossMarginGauge from "../components/dashboard/GrossMarginGauge";
import InventoryValueGauge, { TARGET_DIO_DAYS } from "../components/dashboard/InventoryValueGauge";
import { normalizeGrossMargin } from "../utils/metrics";

const quickLinks = [
  { title: "Invoices", description: "Ship & collect faster", to: "/sales/invoices", icon: FileText },
  { title: "Backlog", description: "Resolve shortages", to: "/operations/backlog", icon: Package },
  { title: "A/R Aging", description: "Prioritize collections", to: "/finance/ar-aging", icon: BarChart3 },
  { title: "Cash Forecast", description: "Inflows & outflows", to: "/finance/cash-forecast", icon: Wallet }
];

type CockpitShortage = {
  item_id: number;
  item_name: string;
  shortage_qty: number;
  backlog_qty: number;
  next_inbound_eta: string | null;
};

type OwnerCockpitResponse = {
  revenue_mtd: number;
  revenue_ytd: number;
  revenue: number | string;
  gross_margin_pct: number | string | null;
  inventory_value: number | string;
  inventory_value_total: number | string;
  ar_total: number;
  ar_90_plus: number;
  cash_forecast_30d: number;
  backlog_value: number;
  top_shortages: CockpitShortage[];
};

const coerceNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) return Number(String(value));
  return Number.NaN;
};

const formatCurrency = (value: unknown) => {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
};

const formatQty = (value: unknown) => {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/* ---- Stat card with icon & optional accent color ---- */
type StatDef = {
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
  accent: string; // tailwind text color for the icon
  accentBg: string; // bg for icon container
};

function StatCard({ stat, isLoading }: { stat: StatDef; isLoading: boolean }) {
  const Icon = stat.icon;
  return (
    <div className="app-card p-5 group">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{stat.label}</p>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-8 w-28 animate-pulse rounded-lg bg-secondary" />
            ) : (
              <p className="text-2xl font-bold tabular-nums text-foreground tracking-tight">{stat.value}</p>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">{stat.helper}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.accentBg}`}>
          <Icon className={`h-5 w-5 ${stat.accent}`} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

export default function SalesLanding() {
  const [metrics, setMetrics] = useState<OwnerCockpitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadMetrics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<OwnerCockpitResponse>("/dashboard/owner-cockpit");
        if (isActive) setMetrics(data);
      } catch (err) {
        console.error(err);
        if (isActive) setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };
    loadMetrics();
    return () => { isActive = false; };
  }, []);

  const grossMargin = useMemo(() => {
    const rawMargin = metrics?.gross_margin_pct;
    if (rawMargin == null) return 0;
    if (typeof rawMargin === "string") return normalizeGrossMargin(Number.parseFloat(rawMargin));
    return normalizeGrossMargin(rawMargin);
  }, [metrics?.gross_margin_pct]);

  const inventoryGaugeMetrics = useMemo(() => {
    const revenueTopLine = toSafeNumber(metrics?.revenue ?? metrics?.revenue_ytd, 0);
    const grossMarginRatio = clamp(normalizeGrossMargin(metrics?.gross_margin_pct) / 100, 0, 1);
    const cogs = revenueTopLine * (1 - grossMarginRatio);
    const targetInventoryValue = cogs * (TARGET_DIO_DAYS / 365);
    const actualInventoryValue = toSafeNumber(metrics?.inventory_value_total ?? metrics?.inventory_value, 0);
    const inventoryHealthPctRaw = targetInventoryValue > 0 ? (actualInventoryValue / targetInventoryValue) * 100 : 0;

    return {
      actualInventoryValue,
      targetInventoryValue,
      inventoryHealthPctRaw,
      inventoryHealthPctDisplay: clamp(inventoryHealthPctRaw, 0, 200)
    };
  }, [metrics]);

  const stats: StatDef[] = useMemo(() => {
    const revenueMtd = Number(metrics?.revenue_mtd ?? 0);
    const revenueYtd = Number(metrics?.revenue_ytd ?? 0);
    const arTotal = Number(metrics?.ar_total ?? 0);
    const ar90Plus = Number(metrics?.ar_90_plus ?? 0);
    const cashForecast30d = Number(metrics?.cash_forecast_30d ?? 0);
    const backlogValue = Number(metrics?.backlog_value ?? 0);

    return [
      { label: "Revenue MTD", value: formatCurrency(revenueMtd), helper: "Month to date", icon: TrendingUp, accent: "text-emerald-400", accentBg: "bg-emerald-500/10" },
      { label: "Revenue YTD", value: formatCurrency(revenueYtd), helper: "Year to date", icon: DollarSign, accent: "text-blue-400", accentBg: "bg-blue-500/10" },
      { label: "A/R Total", value: formatCurrency(arTotal), helper: "Open receivables", icon: FileText, accent: "text-violet-400", accentBg: "bg-violet-500/10" },
      { label: "A/R 90+", value: formatCurrency(ar90Plus), helper: "Severely overdue", icon: AlertTriangle, accent: ar90Plus > 0 ? "text-red-400" : "text-slate-500", accentBg: ar90Plus > 0 ? "bg-red-500/10" : "bg-slate-500/10" },
      { label: "Cash Forecast 30d", value: formatCurrency(cashForecast30d), helper: "Net inflow / outflow", icon: Wallet, accent: "text-cyan-400", accentBg: "bg-cyan-500/10" },
      { label: "Backlog Value", value: formatCurrency(backlogValue), helper: "Active commitments", icon: Clock, accent: "text-amber-400", accentBg: "bg-amber-500/10" }
    ];
  }, [metrics]);

  return (
    <section className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Operator Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Revenue, margin, cash, and fulfillment at a glance.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/20 bg-danger/5 px-5 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} isLoading={isLoading} />
        ))}
      </div>

      {/* Gauges Row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {isLoading ? (
          <>
            <div className="app-card px-5 pt-5 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Gross Margin</p>
              <div className="mt-4 h-40 animate-pulse rounded-xl bg-secondary" />
            </div>
            <div className="app-card px-5 pt-5 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Inventory Value</p>
              <div className="mt-4 h-40 animate-pulse rounded-xl bg-secondary" />
            </div>
          </>
        ) : (
          <>
            <GrossMarginGauge value={grossMargin} />
            <InventoryValueGauge
              actualInventoryValue={inventoryGaugeMetrics.actualInventoryValue}
              targetInventoryValue={inventoryGaugeMetrics.targetInventoryValue}
              inventoryHealthPctRaw={inventoryGaugeMetrics.inventoryHealthPctRaw}
              inventoryHealthPctDisplay={inventoryGaugeMetrics.inventoryHealthPctDisplay}
              targetDioDays={TARGET_DIO_DAYS}
            />
          </>
        )}
      </div>

      {/* Shortages Table */}
      <div className="app-card">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.8} />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted">Top 5 Shortages</h2>
          </div>
          <Link className="app-button-ghost text-[11px] uppercase tracking-wider" to="/operations/backlog">
            Open backlog <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t text-left">
                <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted">Item</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted">Shortage</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted">Backlog</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted">Next ETA</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.top_shortages ?? []).map((row) => (
                <tr key={row.item_id} className="app-table-row border-t">
                  <td className="px-6 py-3 font-medium text-foreground">{row.item_name}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-danger font-medium">{formatQty(row.shortage_qty)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-muted">{formatQty(row.backlog_qty)}</td>
                  <td className="px-6 py-3 text-right text-muted">{row.next_inbound_eta ?? "TBD"}</td>
                </tr>
              ))}
              {!isLoading && (metrics?.top_shortages.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted">
                    No active shortages — looking good.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              className="app-card flex items-center justify-between px-4 py-3.5 transition hover:shadow-soft group"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted transition group-hover:text-primary" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-semibold text-foreground transition group-hover:text-primary">{link.title}</p>
                  <p className="text-[11px] text-muted">{link.description}</p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
