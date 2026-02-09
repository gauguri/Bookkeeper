import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { apiFetch } from "../api";

const cards = [
  { title: "Customers", description: "Manage customer profiles and contacts.", to: "/sales/customers" },
  { title: "Items", description: "Maintain your sales catalog.", to: "/sales/items" },
  { title: "Invoices", description: "Create and manage customer invoices.", to: "/sales/invoices" },
  { title: "Payments", description: "Apply customer payments to invoices.", to: "/sales/payments" },
  { title: "Reports", description: "Monitor revenue and receivables.", to: "/sales/reports" }
];

type RevenueTrendPoint = {
  month: string;
  value: number;
};

type RevenueDashboardResponse = {
  total_revenue_ytd: number;
  outstanding_ar: number;
  paid_this_month: number;
  open_invoices_count: number;
  revenue_trend: RevenueTrendPoint[];
};

const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

const formatNumberCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 0
  }).format(value);

const formatMonthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", { month: "short" });
};

export default function SalesLanding() {
  const [metrics, setMetrics] = useState<RevenueDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadMetrics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<RevenueDashboardResponse>("/dashboard/revenue");
        if (!isActive) {
          return;
        }
        setMetrics(data);
      } catch (err) {
        console.error(err);
        if (!isActive) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load dashboard metrics.");
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
    () => [
      {
        label: "Total Revenue",
        value: formatCurrencyCompact(metrics?.total_revenue_ytd ?? 0),
        helper: "Year to date"
      },
      {
        label: "Outstanding AR",
        value: formatCurrencyCompact(metrics?.outstanding_ar ?? 0),
        helper: "Open receivables"
      },
      {
        label: "Paid This Month",
        value: formatCurrencyCompact(metrics?.paid_this_month ?? 0),
        helper: "Cash received"
      },
      {
        label: "Open Invoices",
        value: formatNumberCompact(metrics?.open_invoices_count ?? 0),
        helper: "Unpaid invoices"
      }
    ],
    [metrics]
  );

  const revenueData = useMemo(
    () =>
      (metrics?.revenue_trend ?? []).map((point) => ({
        month: formatMonthLabel(point.month),
        value: point.value
      })),
    [metrics]
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Sales</p>
          <h1 className="text-3xl font-semibold">Revenue command center</h1>
          <p className="text-muted">Track performance, keep cash flowing, and move faster.</p>
        </div>
        <button className="app-button">Create invoice</button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error} Please try again.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`app-card p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-glow ${
              index === 0 ? "bg-gradient-to-br from-indigo-500/10 to-transparent" : ""
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{stat.label}</p>
            <div className="mt-3 flex items-end justify-between">
              {isLoading ? (
                <div className="h-7 w-24 animate-pulse rounded bg-slate-200" />
              ) : (
                <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{stat.helper}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="app-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Revenue trend</p>
              <p className="text-xs text-muted">Updated moments ago</p>
            </div>
            <button className="app-button-secondary text-xs">View report</button>
          </div>
          <div className="mt-6 h-56">
            {isLoading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99, 102, 241, 0.08)" }} />
                  <Area type="monotone" dataKey="value" stroke="#6366F1" fill="url(#revenueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="app-card p-6">
            <p className="text-sm font-semibold">Collections health</p>
            <p className="mt-2 text-3xl font-semibold">94%</p>
            <p className="mt-1 text-sm text-muted">Invoices paid within terms</p>
            <button className="app-button-ghost mt-4 text-xs">
              View aging report <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="app-card p-6">
            <p className="text-sm font-semibold">Next actions</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>Follow up with Horizon Labs (Invoice #1024)</li>
              <li>Send monthly statements to 12 customers</li>
              <li>Review late fees for 8 overdue invoices</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="app-card group p-6 transition hover:-translate-y-1 hover:shadow-glow"
          >
            <h2 className="text-xl font-semibold mb-2">{card.title}</h2>
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
