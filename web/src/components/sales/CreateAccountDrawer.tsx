import { Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api";
import EntityCreateDrawer from "./EntityCreateDrawer";
import { ListResponse, SalesAccount } from "./types";

type Props = { open: boolean; onClose: () => void; onCreated: (id: number, saveNew?: boolean) => void; mode?: "overlay" | "inline" };
const INDUSTRIES = ["Technology", "Healthcare", "Manufacturing", "Retail", "Financial Services", "Education"];

export default function CreateAccountDrawer({ open, onClose, onCreated, mode = "overlay" }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dupes, setDupes] = useState<SalesAccount[]>([]);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [form, setForm] = useState({ name: "", industry: "", website: "", phone: "", billing_address: "", shipping_address: "", tags: "", notes: "" });

  useEffect(() => { if (!open) return; const t = setTimeout(async () => { if (!form.name && !form.website && !form.phone) return; const resp = await apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?search=${encodeURIComponent(`${form.name} ${form.website} ${form.phone}`)}&page=0&page_size=5`); setDupes(resp.items); }, 350); return () => clearTimeout(t); }, [form.name, form.phone, form.website, open]);
  useEffect(() => { if (sameAsBilling) setForm((p) => ({ ...p, shipping_address: p.billing_address })); }, [sameAsBilling, form.billing_address]);

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Account name is required.");
    if (form.website && !/^https?:\/\//.test(form.website)) errs.push("Website must include http:// or https://");
    if (form.phone && form.phone.replace(/\D/g, "").length < 7) errs.push("Phone number appears invalid.");
    return errs;
  }, [form]);

  const persistDraft = () => localStorage.setItem("draft:create-account", JSON.stringify(form));
  const create = async (saveNew?: boolean) => {
    if (validation.length) return setError(validation[0]);
    setSaving(true); setError("");
    try {
      const created = await apiFetch<SalesAccount>("/sales/accounts", { method: "POST", body: JSON.stringify({ name: form.name, industry: form.industry || null, website: form.website || null, phone: form.phone || null, billing_address: form.billing_address || null, shipping_address: form.shipping_address || null, tags: form.tags || null }) });
      if (saveNew) setForm({ name: "", industry: "", website: "", phone: "", billing_address: "", shipping_address: "", tags: "", notes: "" });
      onCreated(created.id, saveNew);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <EntityCreateDrawer open={open} title="New Account" description="Create a governed customer account record." icon={<Building2 className="h-5 w-5" />} steps={["Overview", "Details", "Review"]} step={step} onStepChange={setStep} dirty={Boolean(form.name || form.website || form.phone)} error={error} onClose={onClose} onSaveDraft={persistDraft} onSaveNew={() => create(true)} onCreate={() => create(false)} creating={saving} disableCreate={validation.length > 0} mode={mode}
    insights={<div className="space-y-4"><h4 className="font-semibold">Insights / Duplicate Risk</h4><p className="text-xs text-muted">Possible duplicates update as you type name, phone, or website.</p><div className="space-y-2">{dupes.length ? dupes.map((d) => <div key={d.id} className="rounded-lg border border-[var(--bedrock-border)] p-2 text-xs"><p className="font-medium">{d.name}</p><p className="text-muted">{d.phone || d.website || "No phone/website"}</p></div>) : <p className="text-xs text-muted">No similar accounts found.</p>}</div></div>}>
      <div className="grid gap-3 md:grid-cols-2">
        <input data-autofocus="true" className="app-input" placeholder="Account name*" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input className="app-input" list="industry-options" placeholder="Industry" value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))} />
        <datalist id="industry-options">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
        <input className="app-input" placeholder="Website" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
        <input className="app-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <textarea className="app-input md:col-span-2" placeholder="Billing address" value={form.billing_address} onChange={(e) => setForm((p) => ({ ...p, billing_address: e.target.value }))} />
        <label className="text-xs"><input type="checkbox" checked={sameAsBilling} onChange={(e) => setSameAsBilling(e.target.checked)} /> Same as billing</label>
        <textarea className="app-input md:col-span-2" placeholder="Shipping address" value={form.shipping_address} disabled={sameAsBilling} onChange={(e) => setForm((p) => ({ ...p, shipping_address: e.target.value }))} />
        <input className="app-input" placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
        <textarea className="app-input" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
      </div>
      {step === 2 && <div className="mt-4 rounded-xl border border-[var(--bedrock-border)] p-4 text-sm"><p className="font-semibold">Review</p><p>{form.name} • {form.industry || "No industry"}</p><p>{form.website || "No website"}</p></div>}
    </EntityCreateDrawer>;
}
