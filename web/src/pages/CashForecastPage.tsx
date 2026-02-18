import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type CashForecastBucket = {
  week_start: string;
  week_end: string;
  expected_inflows: number;
  expected_outflows: number;
  net: number;
  cumulative: number;
};

type CashForecastResponse = {
  generated_at: string;
  default_days_to_pay: number;
  default_po_lead_days: number;
  includes_scheduled_expenses: boolean;
  buckets: CashForecastBucket[];
};

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function CashForecastPage() {
  const [forecast, setForecast] = useState<CashForecastResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<CashForecastResponse>("/ar/cash-forecast?weeks=8");
        setForecast(data);
        setError("");
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, []);

  const totals = useMemo(() => {
    if (!forecast) return null;
    return forecast.buckets.reduce(
      (acc, bucket) => {
        acc.inflows += Number(bucket.expected_inflows);
        acc.outflows += Number(bucket.expected_outflows);
        return acc;
      },
      { inflows: 0, outflows: 0 }
    );
  }, [forecast]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Finance</p>
        <h1 className="text-3xl font-semibold">Cash Forecast</h1>
        <p className="text-muted">8-week projected cash view from unpaid invoices, open POs, and scheduled expenses.</p>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      {forecast ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="app-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted">Expected inflows</p>
              <p className="mt-2 text-2xl font-semibold">{currency(totals?.inflows ?? 0)}</p>
            </div>
            <div className="app-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted">Expected outflows</p>
              <p className="mt-2 text-2xl font-semibold">{currency(totals?.outflows ?? 0)}</p>
            </div>
            <div className="app-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted">8-week net</p>
              <p className={`mt-2 text-2xl font-semibold ${(totals?.inflows ?? 0) - (totals?.outflows ?? 0) < 0 ? "text-danger" : "text-emerald-600"}`}>
                {currency((totals?.inflows ?? 0) - (totals?.outflows ?? 0))}
              </p>
            </div>
          </div>

          <div className="app-card overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Week</th>
                  <th className="px-4 py-3 text-right">Expected Inflows</th>
                  <th className="px-4 py-3 text-right">Expected Outflows</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-right">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {forecast.buckets.map((bucket) => (
                  <tr key={bucket.week_start} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{dateLabel(bucket.week_start)} - {dateLabel(bucket.week_end)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(bucket.expected_inflows)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{currency(bucket.expected_outflows)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${bucket.net < 0 ? "text-danger" : "text-emerald-600"}`}>{currency(bucket.net)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${bucket.cumulative < 0 ? "text-danger" : ""}`}>{currency(bucket.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="app-card p-5 text-sm text-muted">
            <p>
              Assumptions: historical customer days-to-pay are used when available; otherwise invoice due date is used, falling back to Net {forecast.default_days_to_pay} from invoice issue date. Open PO outflows default to {forecast.default_po_lead_days} days after order date when no expected date exists.
            </p>
            <p className="mt-2">Scheduled expenses included: {forecast.includes_scheduled_expenses ? "Yes" : "No"}.</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
