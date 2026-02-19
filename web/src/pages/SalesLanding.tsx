import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { apiFetch } from "../api";

const cards = [
  { title: "Invoices", description: "Ship and collect faster.", to: "/sales/invoices" },
  { title: "Backlog", description: "Resolve shortages and unblock demand.", to: "/operations/backlog" },
  { title: "A/R Aging", description: "Prioritize collections this week.", to: "/finance/ar-aging" },
  { title: "Cash Forecast", description: "Inspect inflows and outflows.", to: "/finance/cash-forecast" }
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
  gross_margin_pct: number;
  inventory_value: number;
  ar_total: number;
  ar_90_plus: number;
  cash_forecast_30d: number;
  backlog_value: number;
  top_shortages: CockpitShortage[];
};

const warnedFields = new Set<string>();
const isDev = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

const coerceNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return Number(String(value));
  }
  return Number.NaN;
};

const warnBadValue = (fieldName: string, value: unknown) => {
  if (isDev && !warnedFields.has(fieldName)) {
    warnedFields.add(fieldName);
    console.warn("[SalesLanding] bad percent value", value, { fieldName });
  }
};

const formatCurrency = (value: unknown, fieldName = "currency") => {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) {
    warnBadValue(fieldName, value);
    return "—";
  }

  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
};

const formatPercent = (value: unknown, decimals = 1, fieldName = "percent") => {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) {
    warnBadValue(fieldName, value);
    return "—";
  }

  // owner-cockpit returns `*_pct` fields in percentage points (e.g. 12.3 => 12.3%), not ratio values.
  return `${num.toFixed(decimals)}%`;
};

const formatQty = (value: unknown, fieldName = "quantity") => {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) {
    warnBadValue(fieldName, value);
    return "—";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
};

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
        if (isActive) {
          setMetrics(data);
        }
      } catch (err) {
        console.error(err);
        if (isActive) {
          setError(err instanceof Error ? err.message : "Unable to load owner cockpit.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };
    loadMetrics();
    return () => {
      isActive = false;
    };
  }, []);

  const stats = useMemo(
    () => {
      const revenueMtd = Number(metrics?.revenue_mtd ?? 0);
      const revenueYtd = Number(metrics?.revenue_ytd ?? 0);
      const grossMargin = Number(metrics?.gross_margin_pct ?? 0);
      const inventoryValue = Number(metrics?.inventory_value ?? 0);
      const arTotal = Number(metrics?.ar_total ?? 0);
      const ar90Plus = Number(metrics?.ar_90_plus ?? 0);
      const cashForecast30d = Number(metrics?.cash_forecast_30d ?? 0);
      const backlogValue = Number(metrics?.backlog_value ?? 0);

      return [
      { label: "Revenue MTD", value: formatCurrency(revenueMtd, "revenue_mtd"), helper: "Month to date" },
      { label: "Revenue YTD", value: formatCurrency(revenueYtd, "revenue_ytd"), helper: "Year to date" },
      { label: "Gross Margin", value: formatPercent(grossMargin, 1, "gross_margin_pct"), helper: "From invoice snapshots" },
      { label: "Inventory Value", value: formatCurrency(inventoryValue, "inventory_value"), helper: "On-hand × landed cost" },
      { label: "A/R Total", value: formatCurrency(arTotal, "ar_total"), helper: "Open receivables" },
      { label: "A/R 90+", value: formatCurrency(ar90Plus, "ar_90_plus"), helper: "Severely overdue" },
      {
        label: "Cash Forecast 30d",
        value: formatCurrency(cashForecast30d, "cash_forecast_30d"),
        helper: "Net inflow / outflow"
      },
      { label: "Backlog Value", value: formatCurrency(backlogValue, "backlog_value"), helper: "Active commitments" }
    ];
    },
    [metrics]
  );

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Owner cockpit</p>
        <h1 className="text-3xl font-semibold">Operator dashboard</h1>
        <p className="text-muted">One place to run revenue, margin, cash, and fulfillment risk.</p>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="app-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{stat.label}</p>
            <div className="mt-2">
              {isLoading ? <div className="h-7 w-24 animate-pulse rounded bg-slate-200" /> : <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>}
            </div>
            <p className="mt-1 text-xs text-muted">{stat.helper}</p>
          </div>
        ))}
      </div>

      <div className="app-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top 5 shortages</h2>
          <Link className="app-button-secondary text-xs" to="/operations/backlog">
            Open backlog
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4 text-right">Shortage Qty</th>
                <th className="pb-2 pr-4 text-right">Backlog Qty</th>
                <th className="pb-2 text-right">Next Inbound</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.top_shortages ?? []).map((row) => (
                <tr key={row.item_id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{row.item_name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatQty(row.shortage_qty, "shortage_qty")}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatQty(row.backlog_qty, "backlog_qty")}</td>
                  <td className="py-2 text-right">{row.next_inbound_eta ?? "TBD"}</td>
                </tr>
              ))}
              {!isLoading && (metrics?.top_shortages.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-muted">
                    No active shortages.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="app-card group p-6 transition hover:-translate-y-1 hover:shadow-glow">
            <h2 className="mb-2 text-xl font-semibold">{card.title}</h2>
            <p className="text-muted">{card.description}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Open module <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
