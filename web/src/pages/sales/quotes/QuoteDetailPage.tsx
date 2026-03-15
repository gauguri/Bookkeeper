import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiRequestError, apiFetch } from "../../../api";
import { DealDeskEvaluation } from "../../../components/sales/types";


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

const fmtPct = (value?: number | null) => {
  const numeric = Number(value || 0);
  const display = numeric <= 1 ? numeric * 100 : numeric;
  return `${display.toFixed(2)}%`;
};

function StatusBadge({ label, tone = "default" }: { label?: string | null; tone?: "default" | "good" | "warning" }) {
  const classes = tone === "good" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : tone === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-[var(--bedrock-border)]";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${classes}`}>{label || "Unknown"}</span>;
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [evaluation, setEvaluation] = useState<DealDeskEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Quote id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<QuoteDetail>(`/sales/quotes/${id}`),
      apiFetch<DealDeskEvaluation>(`/sales/quotes/${id}/deal-desk`),
    ])
      .then(([quoteData, evaluationData]) => {
        setQuote(quoteData);
        setEvaluation(evaluationData);
      })
      .catch((err: ApiRequestError) => {
        if (err.status === 404) setError("Quote not found.");
        else setError(err.message || "Failed to load quote.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const lines = useMemo(() => quote?.lines ?? [], [quote?.lines]);

  const refresh = async () => {
    if (!id) return;
    const [quoteData, evaluationData] = await Promise.all([
      apiFetch<QuoteDetail>(`/sales/quotes/${id}`),
      apiFetch<DealDeskEvaluation>(`/sales/quotes/${id}/deal-desk`),
    ]);
    setQuote(quoteData);
    setEvaluation(evaluationData);
  };

  const approve = async () => {
    if (!id) return;
    setWorking(true);
    setError("");
    try {
      await apiFetch(`/sales/quotes/${id}/approve`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError((err as Error).message || "Unable to approve quote.");
    } finally {
      setWorking(false);
    }
  };

  const convertToOrder = async () => {
    if (!id) return;
    setWorking(true);
    setError("");
    try {
      const order = await apiFetch<{ id: number }>(`/sales/quotes/${id}/convert-to-order`, { method: "POST" });
      navigate(`/sales/orders/${order.id}`);
    } catch (err) {
      setError((err as Error).message || "Unable to convert quote.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{quote?.quote_number || "Quote"}</h2>
          <p className="text-sm text-muted">Governed deal review with pricing, margin, approval, and expansion guidance.</p>
        </div>
        <div className="flex gap-2">
          <Link className="app-button-secondary" to="/sales/command-center/quotes">Back to quotes</Link>
          <button className="app-button-secondary" type="button" onClick={approve} disabled={working || quote?.approval_status !== "REQUESTED"}><ShieldCheck className="h-4 w-4" /> Approve</button>
          <button className="app-button" type="button" onClick={convertToOrder} disabled={working || quote?.approval_status === "REQUESTED"}><ArrowRight className="h-4 w-4" /> Convert to order</button>
        </div>
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

      {!loading && !error && quote && evaluation && (
        <>
          <section className="grid gap-4 xl:grid-cols-4">
            <div className="app-card space-y-4 p-6 xl:col-span-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge label={quote.status} />
                <StatusBadge label={quote.approval_status} tone={quote.approval_status === "APPROVED" ? "good" : quote.approval_status === "REQUESTED" ? "warning" : "default"} />
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted">Opportunity</dt><dd>{quote.opportunity?.name || `#${quote.opportunity_id || "-"}`}</dd></div>
                <div><dt className="text-muted">Account</dt><dd>{quote.opportunity?.account_name || "-"}</dd></div>
                <div><dt className="text-muted">Valid until</dt><dd>{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : "-"}</dd></div>
                <div><dt className="text-muted">Total</dt><dd className="font-semibold">{fmtMoney(quote.total)}</dd></div>
              </dl>
              {evaluation.summary.approval_required ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div className="space-y-1">
                      <p className="font-semibold">Approval required</p>
                      {evaluation.summary.approval_reasons.map((reason) => <p key={reason}>{reason}</p>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">This quote clears pricing policy and can move straight to order conversion.</div>
              )}
            </div>

            <div className="app-card p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Deal score</p>
              <p className="mt-3 text-4xl font-semibold">{evaluation.summary.deal_score}</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted">Gross margin</span><span>{evaluation.summary.gross_margin_percent != null ? `${Number(evaluation.summary.gross_margin_percent).toFixed(1)}%` : "-"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted">Revenue uplift</span><span>{fmtMoney(evaluation.summary.recommended_revenue_uplift)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted">Avg confidence</span><span>{(evaluation.summary.average_confidence_score * 100).toFixed(0)}%</span></div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="app-card p-6">
              <h3 className="text-base font-semibold">Customer context</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted">Tier</span><span>{evaluation.customer.tier}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted">YTD revenue</span><span>{fmtMoney(evaluation.customer.ytd_revenue)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted">Outstanding A/R</span><span>{fmtMoney(evaluation.customer.outstanding_ar)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted">Payment score</span><span className="capitalize">{evaluation.customer.payment_score}</span></div>
              </div>
            </div>
            <div className="app-card p-6">
              <h3 className="text-base font-semibold">Next best actions</h3>
              <div className="mt-4 space-y-2 text-sm">
                {evaluation.summary.next_best_actions.map((action) => (
                  <div key={action} className="rounded-xl border border-[var(--bedrock-border)] px-3 py-2">{action}</div>
                ))}
              </div>
            </div>
            <div className="app-card p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Upsell signals</h3>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {evaluation.upsell_suggestions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--bedrock-border)] p-3 text-muted">No cross-sell recommendations found.</div>
                ) : evaluation.upsell_suggestions.map((item) => (
                  <div key={item.item_id} className="rounded-xl border border-[var(--bedrock-border)] p-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted">{item.reason}</p>
                    <p className="mt-2 text-xs text-muted">Recommended price {fmtMoney(item.recommended_price ?? item.unit_price ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="app-card p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Line review</h3>
              {quote.approval_status === "APPROVED" ? <StatusBadge label="Approved" tone="good" /> : null}
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--bedrock-border)] text-left text-muted">
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">Unit Price</th>
                    <th className="py-2 pr-3">Discount</th>
                    <th className="py-2 pr-3">Net</th>
                    <th className="py-2 pr-3">Recommended</th>
                    <th className="py-2 pr-3">Floor</th>
                    <th className="py-2 pr-3">Margin</th>
                    <th className="py-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.lines.map((line) => (
                    <tr key={`${line.line_number}-${line.item_id ?? "manual"}`} className="border-b border-[var(--bedrock-border)]/60 align-top">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{line.description || (line.item_id ? `Item #${line.item_id}` : "-")}</p>
                        {line.sku ? <p className="text-xs text-muted">SKU {line.sku}</p> : null}
                      </td>
                      <td className="py-3 pr-3">{Number(line.qty || 0)}</td>
                      <td className="py-3 pr-3">{fmtMoney(line.entered_unit_price)}</td>
                      <td className="py-3 pr-3">{fmtPct(line.discount_percent)}</td>
                      <td className="py-3 pr-3">{fmtMoney(line.entered_net_unit_price)}</td>
                      <td className="py-3 pr-3">{fmtMoney(line.recommended_unit_price)}</td>
                      <td className="py-3 pr-3">{fmtMoney(line.floor_unit_price)}</td>
                      <td className="py-3 pr-3">{line.margin_percent != null ? `${Number(line.margin_percent).toFixed(1)}%` : "-"}</td>
                      <td className="py-3">
                        <div className="space-y-1">
                          {line.approval_reasons.length === 0 ? <p className="text-emerald-400">Clear</p> : line.approval_reasons.map((reason) => <p key={reason} className="text-xs text-amber-300">{reason}</p>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-card p-6">
            <h3 className="text-base font-semibold">Commercial notes</h3>
            <p className="mt-3 text-sm text-muted">{quote.notes || "-"}</p>
          </section>
        </>
      )}
    </div>
  );
}
