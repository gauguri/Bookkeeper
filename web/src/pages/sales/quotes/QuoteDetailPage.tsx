import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useEffect } from "react";

import { ApiRequestError, apiFetch } from "../../../api";

type QuoteLineDetail = {
  id: number;
  item_id?: number | null;
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  discount_pct?: number | null;
  discount_amount?: number | null;
  line_total?: number | null;
};

type QuoteDetail = {
  id: number;
  quote_number?: string | null;
  status?: string | null;
  approval_status?: string | null;
  opportunity_id?: number | null;
  subtotal?: number | null;
  discount_total?: number | null;
  tax_total?: number | null;
  total?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  lines?: QuoteLineDetail[] | null;
  opportunity?: {
    id: number;
    name?: string | null;
    account_id?: number | null;
    account_name?: string | null;
  } | null;
};

const fmtMoney = (amount?: number | null) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(amount || 0));

function StatusBadge({ label }: { label?: string | null }) {
  return <span className="rounded-full border border-[var(--bedrock-border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide">{label || "Unknown"}</span>;
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "lines">("overview");

  useEffect(() => {
    if (!id) {
      setError("Quote id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    apiFetch<QuoteDetail>(`/sales/quotes/${id}`)
      .then((data) => setQuote(data))
      .catch((err: ApiRequestError) => {
        if (err.status === 404) setError("Quote not found.");
        else setError(err.message || "Failed to load quote.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const lines = useMemo(() => quote?.lines ?? [], [quote?.lines]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{quote?.quote_number || "Quote"}</h2>
          <p className="text-sm text-muted">Quote details and pricing line items.</p>
        </div>
        <Link className="app-button-secondary" to="/sales/command-center/quotes">Back to quotes</Link>
      </div>

      {loading && (
        <section className="app-card space-y-4 p-6" aria-busy="true">
          <div className="h-7 w-48 animate-pulse rounded bg-slate-500/20" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-16 animate-pulse rounded bg-slate-500/20" />)}
          </div>
          <div className="h-40 animate-pulse rounded bg-slate-500/20" />
        </section>
      )}

      {!loading && error && <section className="app-card border border-red-500/40 p-6 text-red-300">{error}</section>}

      {!loading && !error && quote && (
        <>
          <section className="app-card space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={quote.status} />
              <StatusBadge label={quote.approval_status} />
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-muted">Opportunity</dt><dd>{quote.opportunity?.name || `#${quote.opportunity_id || "—"}`}</dd></div>
              <div><dt className="text-muted">Account</dt><dd>{quote.opportunity?.account_name || "—"}</dd></div>
              <div><dt className="text-muted">Valid until</dt><dd>{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : "—"}</dd></div>
              <div><dt className="text-muted">Total</dt><dd className="font-semibold">{fmtMoney(quote.total)}</dd></div>
            </dl>
          </section>

          <section className="app-card p-6">
            <div className="mb-4 flex gap-2">
              <button type="button" className={`app-button-secondary ${tab === "overview" ? "ring-1 ring-primary" : ""}`} onClick={() => setTab("overview")}>Overview</button>
              <button type="button" className={`app-button-secondary ${tab === "lines" ? "ring-1 ring-primary" : ""}`} onClick={() => setTab("lines")}>Line Items ({lines.length})</button>
            </div>

            {tab === "overview" && (
              <div className="space-y-3 text-sm">
                <p><span className="text-muted">Subtotal:</span> {fmtMoney(quote.subtotal)}</p>
                <p><span className="text-muted">Discount:</span> {fmtMoney(quote.discount_total)}</p>
                <p><span className="text-muted">Tax:</span> {fmtMoney(quote.tax_total)}</p>
                <p><span className="text-muted">Notes:</span> {quote.notes || "—"}</p>
              </div>
            )}

            {tab === "lines" && (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--bedrock-border)] text-left text-muted">
                      <th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Qty</th><th className="py-2 pr-3">Unit Price</th><th className="py-2 pr-3">Discount</th><th className="py-2">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && <tr><td className="py-4 text-muted" colSpan={5}>No line items on this quote.</td></tr>}
                    {lines.map((line) => (
                      <tr key={line.id} className="border-b border-[var(--bedrock-border)]/60">
                        <td className="py-2 pr-3">{line.description || (line.item_id ? `Item #${line.item_id}` : "—")}</td>
                        <td className="py-2 pr-3">{Number(line.qty || 0)}</td>
                        <td className="py-2 pr-3">{fmtMoney(line.unit_price)}</td>
                        <td className="py-2 pr-3">{Number(line.discount_pct || 0)}%</td>
                        <td className="py-2">{fmtMoney(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
