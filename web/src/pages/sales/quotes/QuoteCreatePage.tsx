import { AlertTriangle, CheckCircle2, DollarSign, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../api";
import CreateObjectPageShell from "../../../components/sales/CreateObjectPageShell";
import { DealDeskEvaluation, ItemLookup, ListResponse, QuoteLine, SalesOpportunity, SalesQuote } from "../../../components/sales/types";
import { formatCurrency } from "../../../utils/formatters";

const card = "rounded-2xl border border-[var(--bedrock-border)] bg-surface p-4 shadow-sm sm:p-6";
const blankLine: QuoteLine = { item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 };

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function QuoteCreatePage() {
  const navigate = useNavigate();
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([{ ...blankLine }]);
  const [form, setForm] = useState({ opportunity_id: "", valid_until: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [evaluation, setEvaluation] = useState<DealDeskEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then((r) => setOpps(r.items));
    apiFetch<ItemLookup[]>(`/items-enriched`).then(setItems);
  }, []);

  const payload = useMemo(
    () => ({
      opportunity_id: form.opportunity_id ? Number(form.opportunity_id) : null,
      valid_until: form.valid_until || null,
      lines: lines.map((line) => ({
        item_id: line.item_id,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        discount_pct: line.discount_pct,
      })),
    }),
    [form.opportunity_id, form.valid_until, lines],
  );
  const deferredPayload = useDeferredValue(payload);

  useEffect(() => {
    if (!deferredPayload.opportunity_id) {
      setEvaluation(null);
      return;
    }
    if (!deferredPayload.lines.some((line) => line.item_id)) {
      setEvaluation(null);
      return;
    }

    let cancelled = false;
    setEvaluating(true);
    apiFetch<DealDeskEvaluation>("/sales/quotes/evaluate", {
      method: "POST",
      body: JSON.stringify({
        opportunity_id: deferredPayload.opportunity_id,
        valid_until: deferredPayload.valid_until,
        lines: deferredPayload.lines,
      }),
    })
      .then((data) => {
        if (!cancelled) {
          setEvaluation(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEvaluation(null);
          setError((err as Error).message || "Unable to evaluate quote.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEvaluating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredPayload]);

  const totals = useMemo(() => {
    if (evaluation) {
      return {
        subtotal: toNumber(evaluation.summary.subtotal),
        discount: toNumber(evaluation.summary.discount_total),
        total: toNumber(evaluation.summary.total),
        uplift: toNumber(evaluation.summary.recommended_revenue_uplift),
      };
    }
    const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unit_price, 0);
    const discount = lines.reduce((sum, line) => sum + line.qty * line.unit_price * (line.discount_pct / 100), 0);
    return { subtotal, discount, total: subtotal - discount, uplift: 0 };
  }, [evaluation, lines]);

  const lineMap = useMemo(() => new Map((evaluation?.lines ?? []).map((line) => [line.line_number - 1, line])), [evaluation?.lines]);

  const validationErrors = useMemo(() => {
    const messages: { id: string; label: string }[] = [];
    if (!form.opportunity_id) messages.push({ id: "quote-opportunity", label: "Opportunity is required" });
    if (!lines.some((line) => line.item_id)) messages.push({ id: "quote-lines", label: "Add at least one quoted item" });
    return messages;
  }, [form.opportunity_id, lines]);

  const applyRecommendedPrice = (lineIndex: number) => {
    const guidance = lineMap.get(lineIndex);
    if (!guidance?.recommended_unit_price) return;
    setLines((current) => current.map((line, index) => (index === lineIndex ? { ...line, unit_price: toNumber(guidance.recommended_unit_price) } : line)));
  };

  const applyAllRecommended = () => {
    setLines((current) => current.map((line, index) => {
      const guidance = lineMap.get(index);
      return guidance?.recommended_unit_price ? { ...line, unit_price: toNumber(guidance.recommended_unit_price) } : line;
    }));
  };

  const create = async (saveNew?: boolean) => {
    if (!form.opportunity_id) {
      setError("Opportunity is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<SalesQuote>("/sales/quotes", {
        method: "POST",
        body: JSON.stringify({
          opportunity_id: Number(form.opportunity_id),
          valid_until: form.valid_until || null,
          notes: form.notes || null,
          lines,
        }),
      });
      if (saveNew) {
        setForm({ opportunity_id: "", valid_until: "", notes: "" });
        setLines([{ ...blankLine }]);
        setEvaluation(null);
      } else {
        navigate(`/sales/quotes/${created.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const approvalRequired = Boolean(evaluation?.summary.approval_required);

  return (
    <CreateObjectPageShell
      title="Revenue Control Tower"
      description="Price, defend, and route deals with margin control, approval policy, and growth guidance built into the quote flow."
      dirty={Boolean(form.opportunity_id || form.valid_until || form.notes || lines.some((line) => line.item_id || line.unit_price || line.discount_pct))}
      error={error}
      validationErrors={validationErrors}
      creating={saving}
      onClose={() => navigate(-1)}
      onCancel={() => navigate(-1)}
      onSaveDraft={() => localStorage.setItem("draft:create-quote", JSON.stringify({ form, lines }))}
      onSaveNew={() => create(true)}
      onCreate={() => create(false)}
      insights={
        <>
          <section className={card}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Deal score</h3>
                <p className="mt-1 text-sm text-muted">Commercial health, risk, and execution readiness.</p>
              </div>
              <div className={`rounded-2xl px-4 py-3 text-right ${approvalRequired ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                <p className="text-xs uppercase tracking-[0.2em]">Score</p>
                <p className="text-2xl font-semibold">{evaluation?.summary.deal_score ?? 0}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--bedrock-border)] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Gross margin</p>
                <p className="mt-2 text-lg font-semibold">{evaluation?.summary.gross_margin_percent != null ? `${Number(evaluation.summary.gross_margin_percent).toFixed(1)}%` : "-"}</p>
              </div>
              <div className="rounded-xl border border-[var(--bedrock-border)] p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Revenue uplift</p>
                <p className="mt-2 text-lg font-semibold">{formatCurrency(totals.uplift)}</p>
              </div>
            </div>
            <div className={`mt-4 rounded-xl border px-3 py-3 text-sm ${approvalRequired ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
              {approvalRequired ? "Approval required before this quote should become an order." : "Deal clears pricing policy with no approval requirement."}
            </div>
          </section>

          <section className={card}>
            <h3 className="text-base font-semibold">Customer context</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted">Account</span><span>{evaluation?.customer.account_name || "-"}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Tier</span><span>{evaluation?.customer.tier || "STANDARD"}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">YTD revenue</span><span>{formatCurrency(toNumber(evaluation?.customer.ytd_revenue))}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Outstanding A/R</span><span>{formatCurrency(toNumber(evaluation?.customer.outstanding_ar))}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Payment score</span><span className="capitalize">{evaluation?.customer.payment_score || "unknown"}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">Avg days to pay</span><span>{evaluation?.customer.avg_days_to_pay ? `${evaluation.customer.avg_days_to_pay.toFixed(1)}d` : "-"}</span></div>
            </div>
          </section>

          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Next best actions</h3>
                <p className="mt-1 text-sm text-muted">What to do before issuing the deal.</p>
              </div>
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {(evaluation?.summary.next_best_actions ?? ["Select an opportunity and line items to generate live guidance."]).map((action) => (
                <div key={action} className="rounded-xl border border-[var(--bedrock-border)] px-3 py-2">{action}</div>
              ))}
            </div>
            {evaluation?.summary.risk_flags?.length ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {evaluation.summary.risk_flags.map((risk) => (
                  <p key={risk}>{risk}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Upsell signals</h3>
                <p className="mt-1 text-sm text-muted">Cross-sell ideas driven by past co-purchase patterns.</p>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {(evaluation?.upsell_suggestions ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--bedrock-border)] p-3 text-muted">No cross-sell signals yet.</div>
              ) : (
                evaluation?.upsell_suggestions.map((suggestion) => (
                  <div key={suggestion.item_id} className="rounded-xl border border-[var(--bedrock-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{suggestion.name}</p>
                        <p className="text-xs text-muted">{suggestion.reason}</p>
                      </div>
                      <span className="text-xs text-muted">{formatCurrency(toNumber(suggestion.recommended_price ?? suggestion.unit_price))}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted">Seen on {suggestion.co_purchase_count} related invoice(s).</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      }
    >
      <section className={card}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium" htmlFor="quote-opportunity">
            Opportunity *
            <select id="quote-opportunity" data-autofocus="true" className="app-select w-full" value={form.opportunity_id} onChange={(e) => setForm((current) => ({ ...current, opportunity_id: e.target.value }))}>
              <option value="">Select opportunity</option>
              {opps.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>{opportunity.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Valid until
            <input type="date" className="app-input w-full" value={form.valid_until} onChange={(e) => setForm((current) => ({ ...current, valid_until: e.target.value }))} />
          </label>
        </div>
      </section>

      <section className={card} id="quote-lines">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Line-level guidance</h2>
            <p className="text-sm text-muted">Recommended pricing, floor protection, margin, and stock signals on every line.</p>
          </div>
          <div className="flex gap-2">
            <button className="app-button-secondary" type="button" onClick={applyAllRecommended} disabled={!evaluation?.lines.length}>
              <CheckCircle2 className="h-4 w-4" /> Apply all recommended
            </button>
            <button className="app-button-secondary" type="button" onClick={() => setLines((current) => [...current, { ...blankLine }])}>
              <Plus className="h-4 w-4" /> Add line
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => {
            const guidance = lineMap.get(idx);
            return (
              <div key={idx} className="rounded-2xl border border-[var(--bedrock-border)] p-4">
                <div className="grid gap-3 xl:grid-cols-[2.2fr_0.8fr_0.9fr_0.8fr_auto]">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Item</label>
                    <select className="app-select mt-1 w-full" value={line.item_id || ""} onChange={(e) => {
                      const item = items.find((entry) => entry.id === Number(e.target.value));
                      setLines((current) => current.map((row, rowIndex) => rowIndex === idx ? { ...row, item_id: Number(e.target.value), description: item?.name || "", unit_price: toNumber(item?.unit_price) } : row));
                    }}>
                      <option value="">Select item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Qty</label>
                    <input className="app-input mt-1 w-full" type="number" min="1" value={line.qty} onChange={(e) => setLines((current) => current.map((row, rowIndex) => rowIndex === idx ? { ...row, qty: toNumber(e.target.value || 1) || 1 } : row))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Unit price</label>
                    <input className="app-input mt-1 w-full" type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => setLines((current) => current.map((row, rowIndex) => rowIndex === idx ? { ...row, unit_price: toNumber(e.target.value || 0) } : row))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Discount %</label>
                    <input className="app-input mt-1 w-full" type="number" min="0" max="100" step="0.01" value={line.discount_pct} onChange={(e) => setLines((current) => current.map((row, rowIndex) => rowIndex === idx ? { ...row, discount_pct: toNumber(e.target.value || 0) } : row))} />
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    <button className="app-button-secondary" type="button" onClick={() => applyRecommendedPrice(idx)} disabled={!guidance?.recommended_unit_price}>Use rec.</button>
                    <button className="app-button-ghost" type="button" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== idx))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Net sell</p><p className="mt-2 font-semibold">{formatCurrency(toNumber(guidance?.entered_net_unit_price ?? line.unit_price * (1 - line.discount_pct / 100)))}</p></div>
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Recommended</p><p className="mt-2 font-semibold">{formatCurrency(toNumber(guidance?.recommended_unit_price))}</p></div>
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Margin floor</p><p className="mt-2 font-semibold">{formatCurrency(toNumber(guidance?.floor_unit_price))}</p></div>
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Margin %</p><p className="mt-2 font-semibold">{guidance?.margin_percent != null ? `${Number(guidance.margin_percent).toFixed(1)}%` : "-"}</p></div>
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Stock risk</p><p className={`mt-2 font-semibold capitalize ${guidance?.stock_risk === "healthy" ? "text-emerald-400" : "text-amber-300"}`}>{guidance?.stock_risk || "unknown"}</p></div>
                  <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Opportunity</p><p className="mt-2 font-semibold">{formatCurrency(toNumber(guidance?.opportunity_uplift))}</p></div>
                </div>

                {guidance?.approval_reasons?.length ? (
                  <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
                    {guidance.approval_reasons.map((reason) => <p key={reason}>{reason}</p>)}
                  </div>
                ) : null}

                {guidance?.warnings?.length ? (
                  <div className="mt-3 rounded-xl border border-[var(--bedrock-border)] bg-secondary/40 p-3 text-xs text-muted">
                    {guidance.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Financial posture</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Subtotal</p><p className="mt-2 text-lg font-semibold">{formatCurrency(totals.subtotal)}</p></div>
          <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Discount</p><p className="mt-2 text-lg font-semibold">{formatCurrency(totals.discount)}</p></div>
          <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Quote total</p><p className="mt-2 text-lg font-semibold">{formatCurrency(totals.total)}</p></div>
          <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><p className="text-xs uppercase tracking-[0.2em] text-muted">Recommended total</p><p className="mt-2 text-lg font-semibold">{formatCurrency(toNumber(evaluation?.summary.recommended_total ?? totals.total))}</p></div>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Commercial notes</h2>
        <textarea className="app-input mt-3 min-h-28 w-full" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Commercial terms, customer context, and negotiation notes." />
      </section>

      {evaluating ? (
        <section className={card}>
          <div className="flex items-center gap-2 text-sm text-muted"><DollarSign className="h-4 w-4 animate-pulse" /> Evaluating pricing, margin, and risk…</div>
        </section>
      ) : null}

      {approvalRequired && evaluation?.summary.approval_reasons?.length ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <p className="font-semibold">Approval gate triggered</p>
              {evaluation.summary.approval_reasons.map((reason) => <p key={reason}>{reason}</p>)}
            </div>
          </div>
        </section>
      ) : null}
    </CreateObjectPageShell>
  );
}
