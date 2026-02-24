import { BriefcaseBusiness, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api";
import { formatCurrency } from "../../utils/formatters";
import EntityCreateDrawer from "./EntityCreateDrawer";
import { ListResponse, SalesAccount, SalesOpportunity } from "./types";

type Props = { open: boolean; onClose: () => void; onCreated: (id: number, saveNew?: boolean) => void };
const STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const STAGE_PROB: Record<string, number> = { Prospecting: 10, Qualification: 25, Proposal: 50, Negotiation: 75, "Closed Won": 100, "Closed Lost": 0 };

export default function CreateOpportunityDrawer({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [pipeline, setPipeline] = useState<ListResponse<SalesOpportunity>>({ items: [], total_count: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ account_id: "", name: "", stage: "Qualification", expected_close_date: "", amount_estimate: "0", probability: "25", source: "", next_step: "", notes: "" });

  useEffect(() => { if (!open) return; apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then(setPipeline); }, [open]);
  useEffect(() => { if (!open) return; const t = setTimeout(async () => { const r = await apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?search=&page=0&page_size=25`); setAccounts(r.items); }, 300); return () => clearTimeout(t); }, [open]);
  useEffect(() => setForm((p) => ({ ...p, probability: String(STAGE_PROB[p.stage] ?? 25) })), [form.stage]);

  const defaultName = useMemo(() => {
    const a = accounts.find((x) => String(x.id) === form.account_id)?.name;
    return a ? `${a} - ${new Date().toLocaleString("default", { month: "short" })}` : "";
  }, [accounts, form.account_id]);

  const warning = Math.abs(Number(form.probability) - (STAGE_PROB[form.stage] ?? 0)) > 15;
  const totals = pipeline.items.reduce((acc, i) => acc + i.amount_estimate, 0);

  const create = async (saveNew?: boolean) => {
    if (!form.account_id || !form.name.trim() || !form.expected_close_date) return setError("Account, opportunity name, and close date are required.");
    setSaving(true); setError("");
    try {
      const created = await apiFetch<SalesOpportunity>("/sales/opportunities", { method: "POST", body: JSON.stringify({ account_id: Number(form.account_id), name: form.name, stage: form.stage, expected_close_date: form.expected_close_date, amount_estimate: Number(form.amount_estimate || 0), probability: Number(form.probability || 0), source: form.source || null, next_step: form.next_step || null }) });
      if (saveNew) setForm({ account_id: "", name: "", stage: "Qualification", expected_close_date: "", amount_estimate: "0", probability: "25", source: "", next_step: "", notes: "" });
      onCreated(created.id, saveNew);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <EntityCreateDrawer open={open} title="New Opportunity" description="Create a pipeline record with guided defaults." icon={<BriefcaseBusiness className="h-5 w-5" />} steps={["Overview", "Details", "Review"]} step={step} onStepChange={setStep} dirty={Boolean(form.account_id || form.name)} error={error || (warning ? "Probability differs from stage baseline." : "")} onClose={onClose} onSaveDraft={() => localStorage.setItem("draft:create-opportunity", JSON.stringify(form))} onSaveNew={() => create(true)} onCreate={() => create(false)} creating={saving} insights={<div className="space-y-3"><h4 className="font-semibold">Pipeline snapshot</h4><p className="text-xs text-muted">My pipeline total</p><p className="text-xl font-semibold">{formatCurrency(totals)}</p><div className="space-y-1 text-xs">{Object.entries(STAGE_PROB).map(([s, p]) => <div key={s} className="flex justify-between"><span>{s}</span><span>{p}%</span></div>)}</div></div>}>
    <div className="grid gap-3 md:grid-cols-2">
      <select data-autofocus="true" className="app-select" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value, name: p.name || defaultName }))}><option value="">Select account*</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <input className="app-input" placeholder="Opportunity name*" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value || defaultName }))} />
      <select className="app-select" value={form.stage} onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <input className="app-input" type="date" value={form.expected_close_date} onChange={(e) => setForm((p) => ({ ...p, expected_close_date: e.target.value }))} />
      <input className="app-input" type="number" min="0" value={form.amount_estimate} onChange={(e) => setForm((p) => ({ ...p, amount_estimate: e.target.value }))} />
      <input className="app-input" type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((p) => ({ ...p, probability: e.target.value }))} />
      <input className="app-input" placeholder="Source" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} />
      <input className="app-input" placeholder="Next step" value={form.next_step} onChange={(e) => setForm((p) => ({ ...p, next_step: e.target.value }))} />
      <button type="button" className="app-button-secondary md:col-span-2"><TrendingUp className="h-4 w-4" /> Quick-create primary contact (TODO backend enrichment)</button>
    </div>
  </EntityCreateDrawer>;
}
