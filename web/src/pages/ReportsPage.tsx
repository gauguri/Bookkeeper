import { useState } from "react";
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

export default function ReportsPage() {
  const [range, setRange] = useState({ start_date: "", end_date: "" });
  const [asOf, setAsOf] = useState("");
  const [summary, setSummary] = useState<SalesSummary[]>([]);
  const [aging, setAging] = useState<ARAging[]>([]);
  const [revenue, setRevenue] = useState<CustomerRevenue[]>([]);
  const [error, setError] = useState("");

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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Sales reports</h1>
        <p className="text-slate-600">Track performance and receivables.</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Filters</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={range.start_date}
            onChange={(event) => setRange({ ...range, start_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={range.end_date}
            onChange={(event) => setRange({ ...range, end_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button className="bg-slate-900 text-white rounded px-4 py-2 text-sm" onClick={loadReports}>
            Run reports
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Invoices summary</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Status</th>
                <th>Count</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.status} className="border-t border-slate-100">
                  <td className="py-2">{row.status}</td>
                  <td>{row.invoice_count}</td>
                  <td className="text-right">{currency(row.total_amount)}</td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No summary available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">A/R aging</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Bucket</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((row) => (
                <tr key={row.bucket} className="border-t border-slate-100">
                  <td className="py-2">{row.bucket} days</td>
                  <td className="text-right">{currency(row.amount)}</td>
                </tr>
              ))}
              {aging.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-slate-500">
                    No aging data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Customer revenue</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Customer</th>
              <th className="text-right">Total revenue</th>
            </tr>
          </thead>
          <tbody>
            {revenue.map((row) => (
              <tr key={row.customer_id} className="border-t border-slate-100">
                <td className="py-2">{row.customer_name}</td>
                <td className="text-right">{currency(row.total_revenue)}</td>
              </tr>
            ))}
            {revenue.length === 0 && (
              <tr>
                <td colSpan={2} className="py-4 text-center text-slate-500">
                  No revenue data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
