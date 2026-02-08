import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type SalesSummary = {
  status: string;
  invoice_count: number;
  total_amount: number;
};

type ARAging = {
  bucket: string;
  amount: number;
};

type CustomerRevenue = {
  customer_id: number;
  customer_name: string;
  total_revenue: number;
};

const tabs = [
  { id: "summary", label: "Revenue" },
  { id: "aging", label: "A/R aging" },
  { id: "customers", label: "Top customers" }
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function ReportsPage() {
  const [range, setRange] = useState({ start_date: "", end_date: "" });
  const [asOf, setAsOf] = useState("");
  const [summary, setSummary] = useState<SalesSummary[]>([]);
  const [aging, setAging] = useState<ARAging[]>([]);
  const [revenue, setRevenue] = useState<CustomerRevenue[]>([]);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const loadReports = async () => {
    if (!range.start_date || !range.end_date || !asOf) {
      setError("Please select a date range and as-of date.");
      return;
    }
    setError("");
    try {
      const [summaryData, agingData, revenueData] = await Promise.all([
        apiFetch<SalesSummary[]>(`/reports/sales-summary?start_date=${range.start_date}&end_date=${range.end_date}`),
        apiFetch<ARAging[]>(`/reports/ar-aging?as_of=${asOf}`),
        apiFetch<CustomerRevenue[]>(
          `/reports/customer-revenue?start_date=${range.start_date}&end_date=${range.end_date}`
        )
      ]);
      setSummary(summaryData);
      setAging(agingData);
      setRevenue(revenueData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const summaryChart = useMemo(
    () => summary.map((row) => ({ name: row.status, value: row.total_amount })),
    [summary]
  );

  const agingChart = useMemo(
    () => aging.map((row) => ({ name: `${row.bucket}d`, value: row.amount })),
    [aging]
  );

  const revenueChart = useMemo(
    () => revenue.map((row) => ({ name: row.customer_name, value: row.total_revenue })),
    [revenue]
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Reports</p>
          <h1 className="text-3xl font-semibold">Sales analytics</h1>
          <p className="text-muted">Monitor revenue, collections, and cash flow health.</p>
        </div>
        <button className="app-button-secondary">Export PDF</button>
      </div>

      <div className="app-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Filters</h2>
          <button className="app-button" onClick={loadReports}>
            Run reports
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="app-input"
            type="date"
            value={range.start_date}
            onChange={(event) => setRange({ ...range, start_date: event.target.value })}
          />
          <input
            className="app-input"
            type="date"
            value={range.end_date}
            onChange={(event) => setRange({ ...range, end_date: event.target.value })}
          />
          <input
            className="app-input"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="app-card p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "border bg-surface text-muted"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button className="app-button-ghost text-xs">Export CSV</button>
        </div>

        {activeTab === "summary" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-lg font-semibold">Invoices summary</h2>
              <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="py-2">Status</th>
                    <th>Count</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.status} className="border-t">
                      <td className="py-2 font-medium">{row.status}</td>
                      <td className="text-muted">{row.invoice_count}</td>
                      <td className="text-right tabular-nums">{currency(row.total_amount)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted">
                        No summary available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summaryChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99, 102, 241, 0.08)" }} />
                  <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "aging" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-lg font-semibold">A/R aging</h2>
              <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="py-2">Bucket</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.map((row) => (
                    <tr key={row.bucket} className="border-t">
                      <td className="py-2 font-medium">{row.bucket} days</td>
                      <td className="text-right tabular-nums">{currency(row.amount)}</td>
                    </tr>
                  ))}
                  {aging.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-muted">
                        No aging data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99, 102, 241, 0.08)" }} />
                  <Bar dataKey="value" fill="#6366F1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "customers" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-lg font-semibold">Customer revenue</h2>
              <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="py-2">Customer</th>
                    <th className="text-right">Total revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.map((row) => (
                    <tr key={row.customer_id} className="border-t">
                      <td className="py-2 font-medium">{row.customer_name}</td>
                      <td className="text-right tabular-nums">{currency(row.total_revenue)}</td>
                    </tr>
                  ))}
                  {revenue.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-muted">
                        No revenue data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={100} />
                  <Tooltip cursor={{ fill: "rgba(99, 102, 241, 0.08)" }} />
                  <Bar dataKey="value" fill="#6366F1" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
