import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../api";
import CreateObjectPageShell from "../../../components/sales/CreateObjectPageShell";
import { ListResponse, SalesAccount, SalesOpportunity } from "../../../components/sales/types";
import { formatCurrency } from "../../../utils/formatters";

const STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const STAGE_PROB: Record<string, number> = { Prospecting: 10, Qualification: 25, Proposal: 50, Negotiation: 75, "Closed Won": 100, "Closed Lost": 0 };
const card = "rounded-2xl border border-[var(--bedrock-border)] bg-surface p-4 shadow-sm sm:p-6";

export default function OpportunityCreatePage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [pipeline, setPipeline] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ account_id: "", name: "", stage: "Qualification", expected_close_date: "", amount_estimate: "0", probability: "25", source: "", next_step: "", notes: "" });

  useEffect(() => { apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then(setPipeline); apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?page=0&page_size=100`).then((r) => setAccounts(r.items)); }, []);
  useEffect(() => setForm((p) => ({ ...p, probability: String(STAGE_PROB[p.stage] ?? 25) })), [form.stage]);

  const validation = useMemo(() => {
    const errs: { id: string; label: string }[] = [];
    if (!form.account_id) errs.push({ id: "opp-account", label: "Account is required" });
    if (!form.name.trim()) errs.push({ id: "opp-name", label: "Opportunity name is required" });
    if (!form.expected_close_date) errs.push({ id: "opp-close", label: "Expected close date is required" });
    return errs;
  }, [form.account_id, form.name, form.expected_close_date]);

  const create = async (saveNew?: boolean) => {
    if (validation.length) return setError(validation[0].label);
    setSaving(true); setError("");
    try {
      const created = await apiFetch<SalesOpportunity>("/sales/opportunities", { method: "POST", body: JSON.stringify({ account_id: Number(form.account_id), name: form.name, stage: form.stage, expected_close_date: form.expected_close_date, amount_estimate: Number(form.amount_estimate || 0), probability: Number(form.probability || 0), source: form.source || null, next_step: form.next_step || null }) });
      if (saveNew) setForm({ account_id: "", name: "", stage: "Qualification", expected_close_date: "", amount_estimate: "0", probability: "25", source: "", next_step: "", notes: "" });
      else navigate(`/sales/opportunities/${created.id}`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const pipelineTotal = pipeline.items.reduce((sum, item) => sum + item.amount_estimate, 0);

  return <CreateObjectPageShell title="Create Opportunity" description="Capture a high-fidelity pipeline record with forecasting guidance." dirty={Boolean(form.account_id || form.name)} error={error} validationErrors={validation} creating={saving} onClose={() => navigate(-1)} onCancel={() => navigate(-1)} onSaveDraft={() => localStorage.setItem("draft:create-opportunity", JSON.stringify(form))} onSaveNew={() => create(true)} onCreate={() => create(false)} insights={<><section className={card}><h3 className="text-base font-semibold">Pipeline Context</h3><p className="mt-2 text-xs text-muted">Open pipeline value</p><p className="text-xl font-semibold">{formatCurrency(pipelineTotal)}</p><p className="mt-2 text-xs text-muted">{pipeline.items.length} open opportunities loaded.</p></section><section className={card}><h3 className="text-base font-semibold">Stage Probability Guidance</h3><div className="mt-3 space-y-2 text-sm">{Object.entries(STAGE_PROB).map(([stage, prob]) => <div key={stage} className="flex items-center justify-between rounded-lg border border-[var(--bedrock-border)] px-3 py-2"><span>{stage}</span><span className="font-medium">{prob}%</span></div>)}</div></section></>}>
    <section className={card}><h2 className="text-lg font-semibold">Basics</h2><p className="mb-4 text-sm text-muted">Attach opportunity to account and define stage.</p><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium" htmlFor="opp-account">Account *<select id="opp-account" data-autofocus="true" className="app-select w-full" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="space-y-1 text-sm font-medium" htmlFor="opp-name">Opportunity name *<input id="opp-name" className="app-input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Stage<select className="app-select w-full" value={form.stage} onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label><label className="space-y-1 text-sm font-medium" htmlFor="opp-close">Expected close date *<input id="opp-close" type="date" className="app-input w-full" value={form.expected_close_date} onChange={(e) => setForm((p) => ({ ...p, expected_close_date: e.target.value }))} /></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Forecast</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium">Amount estimate<input type="number" min="0" className="app-input w-full" value={form.amount_estimate} onChange={(e) => setForm((p) => ({ ...p, amount_estimate: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Probability (%)<input type="number" min="0" max="100" className="app-input w-full" value={form.probability} onChange={(e) => setForm((p) => ({ ...p, probability: e.target.value }))} /></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Ownership</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium">Source<input className="app-input w-full" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Next step<input className="app-input w-full" value={form.next_step} onChange={(e) => setForm((p) => ({ ...p, next_step: e.target.value }))} /></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Notes</h2><textarea className="app-input min-h-28 w-full" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></section>
  </CreateObjectPageShell>;
}
