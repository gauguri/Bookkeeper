import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type CustomerInsightInvoice = {
  id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: number;
  amount_due: number;
};

type CustomerInsights = {
  customer_id: number;
  customer_name: string;
  ytd_revenue: number;
  ltm_revenue: number;
  gross_margin_percent: number | null;
  outstanding_ar: number;
  average_days_to_pay: number | null;
  last_invoices: CustomerInsightInvoice[];
};

type Props = {
  customerId: number | null;
  mode?: "compact" | "full";
  className?: string;
};

const metricClassByRisk = (value: number, threshold: number) => {
  if (value <= threshold) {
    return "text-success";
  }
  return "text-warning";
};

export default function CustomerInsightsPanel({ customerId, mode = "compact", className = "" }: Props) {
  const [insights, setInsights] = useState<CustomerInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId) {
      setInsights(null);
      setError("");
      return;
    }

    const loadInsights = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<CustomerInsights>(`/customers/${customerId}/insights`);
        setInsights(data);
      } catch (err) {
        setInsights(null);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void loadInsights();
  }, [customerId]);

  const avgDaysLabel = useMemo(() => {
    if (insights?.average_days_to_pay == null) {
      return "—";
    }
    return `${insights.average_days_to_pay.toFixed(1)} days`;
  }, [insights?.average_days_to_pay]);

  if (!customerId) {
    return (
      <aside className={`app-card p-5 ${className}`}>
        <h3 className="text-base font-semibold">Customer intelligence</h3>
        <p className="mt-2 text-sm text-muted">Select a customer to see credit, margin, and collections history.</p>
      </aside>
    );
  }

  return (
    <aside className={`app-card space-y-4 p-5 ${className}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Customer intelligence</p>
        <h3 className="text-lg font-semibold">{insights?.customer_name ?? "Loading customer..."}</h3>
      </div>

      {loading ? <p className="text-sm text-muted">Loading insights…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {insights ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">YTD revenue</p>
              <p className="text-sm font-semibold">{currency(insights.ytd_revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">LTM revenue</p>
              <p className="text-sm font-semibold">{currency(insights.ltm_revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Gross margin %</p>
              <p className="text-sm font-semibold">
                {insights.gross_margin_percent == null ? "—" : `${insights.gross_margin_percent.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Outstanding A/R</p>
              <p className={`text-sm font-semibold ${metricClassByRisk(insights.outstanding_ar, 0)}`}>
                {currency(insights.outstanding_ar)}
              </p>
            </div>
            <div className={mode === "full" ? "sm:col-span-2" : ""}>
              <p className="text-xs text-muted">Average days-to-pay (LTM)</p>
              <p className="text-sm font-semibold">{avgDaysLabel}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Last 5 invoices</p>
            {insights.last_invoices.length === 0 ? (
              <p className="text-sm text-muted">No invoices yet.</p>
            ) : (
              <ul className="space-y-2">
                {insights.last_invoices.map((invoice) => (
                  <li key={invoice.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link className="font-medium text-primary hover:underline" to={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                      <span className="text-xs text-muted">{invoice.status.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      <span>Issued {invoice.issue_date}</span>
                      <span>{currency(invoice.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </aside>
  );
}
