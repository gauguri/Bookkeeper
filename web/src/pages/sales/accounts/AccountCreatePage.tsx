import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../api";
import CreateObjectPageShell from "../../../components/sales/CreateObjectPageShell";
import { ListResponse, SalesAccount } from "../../../components/sales/types";

const INDUSTRIES = ["Technology", "Healthcare", "Manufacturing", "Retail", "Financial Services", "Education"];

const card = "rounded-2xl border border-[var(--bedrock-border)] bg-surface p-4 shadow-sm sm:p-6";

export default function AccountCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dupes, setDupes] = useState<SalesAccount[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [form, setForm] = useState({ name: "", industry: "", website: "", phone: "", billing_address: "", shipping_address: "", tags: "", notes: "" });

  useEffect(() => { if (sameAsBilling) setForm((p) => ({ ...p, shipping_address: p.billing_address })); }, [sameAsBilling, form.billing_address]);
  useEffect(() => {
    const search = `${form.name} ${form.website} ${form.phone}`.trim();
    if (!search) return void setDupes([]);
    setCheckingDupes(true);
    const t = setTimeout(async () => {
      try {
        const resp = await apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?search=${encodeURIComponent(search)}&page=0&page_size=3`);
        setDupes(resp.items);
      } finally { setCheckingDupes(false); }
    }, 450);
    return () => { clearTimeout(t); setCheckingDupes(false); };
  }, [form.name, form.phone, form.website]);

  const validation = useMemo(() => {
    const errs: { id: string; label: string }[] = [];
    if (!form.name.trim()) errs.push({ id: "account-name", label: "Account name is required" });
    if (form.website && !/^https?:\/\//.test(form.website)) errs.push({ id: "account-website", label: "Website must include http:// or https://" });
    if (form.phone && form.phone.replace(/\D/g, "").length < 7) errs.push({ id: "account-phone", label: "Phone number appears invalid" });
    return errs;
  }, [form.name, form.website, form.phone]);

  const profileFields = [form.name, form.industry, form.website, form.phone, form.billing_address, form.shipping_address, form.tags];
  const completeness = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  const create = async (saveNew?: boolean) => {
    if (validation.length) return setError(validation[0].label);
    setSaving(true);
    setError("");
    try {
      const created = await apiFetch<SalesAccount>("/sales/accounts", { method: "POST", body: JSON.stringify({ name: form.name, industry: form.industry || null, website: form.website || null, phone: form.phone || null, billing_address: form.billing_address || null, shipping_address: form.shipping_address || null, tags: form.tags || null }) });
      if (saveNew) setForm({ name: "", industry: "", website: "", phone: "", billing_address: "", shipping_address: "", tags: "", notes: "" });
      else navigate(`/sales/accounts/${created.id}`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <CreateObjectPageShell title="Create Account" description="Create a governed customer account with complete profile and duplicate safeguards." dirty={Boolean(form.name || form.website || form.phone || form.billing_address || form.tags)} error={error} validationErrors={validation} creating={saving} onClose={() => navigate(-1)} onCancel={() => navigate(-1)} onSaveDraft={() => localStorage.setItem("draft:create-account", JSON.stringify(form))} onSaveNew={() => create(true)} onCreate={() => create(false)}
    insights={<>
      <section className={card}><h3 className="text-base font-semibold">Duplicate Risk</h3><p className="mt-1 text-xs text-muted">Similarity check across name, website, and phone.</p>{checkingDupes ? <div className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Checking similar accounts…</div> : dupes.length ? <div className="mt-3 space-y-2">{dupes.map((d, idx) => <div key={d.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><div className="flex items-center justify-between"><p className="font-medium">{d.name}</p><span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">{92 - idx * 9}% match</span></div><p className="mt-1 text-xs text-muted">{d.phone || d.website || "Limited profile"}</p><button className="mt-2 text-xs font-medium text-primary underline" onClick={() => navigate(`/sales/accounts/${d.id}`)}>Open existing</button></div>)}</div> : <p className="mt-3 rounded-xl border border-[var(--bedrock-border)] bg-[var(--bedrock-bg)] px-3 py-2 text-sm text-muted">No similar accounts found.</p>}</section>
      <section className={card}><h3 className="text-base font-semibold">Completeness</h3><p className="mt-2 text-sm font-medium">Profile completeness {completeness}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bedrock-border)]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completeness}%` }} /></div><ul className="mt-3 space-y-1 text-xs text-muted">{!form.phone && <li>• Add phone</li>}{!form.billing_address && <li>• Add billing address</li>}{!form.industry && <li>• Select industry</li>}{form.phone && form.billing_address && form.industry && <li>• Account profile is well-formed</li>}</ul></section>
    </>}>
    {dupes.length > 0 && <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300"><AlertTriangle className="h-4 w-4" />Possible duplicate accounts detected.</div>}
    <section className={card}><h2 className="text-lg font-semibold">Basic Information</h2><p className="mb-4 text-sm text-muted">Core account profile and contact channels.</p><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium" htmlFor="account-name">Account name *<input id="account-name" data-autofocus="true" className="app-input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Industry<select className="app-select w-full" value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}><option value="">Select industry</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</select></label><label className="space-y-1 text-sm font-medium" htmlFor="account-website">Website<input id="account-website" className="app-input w-full" placeholder="https://example.com" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium" htmlFor="account-phone">Phone<input id="account-phone" className="app-input w-full" placeholder="+1 (555) 000-0000" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Addresses</h2><p className="mb-4 text-sm text-muted">Billing and shipping details used across quote and order flows.</p><div className="space-y-4"><label className="space-y-1 text-sm font-medium">Billing address<textarea className="app-input min-h-24 w-full" value={form.billing_address} onChange={(e) => setForm((p) => ({ ...p, billing_address: e.target.value }))} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameAsBilling} onChange={(e) => setSameAsBilling(e.target.checked)} />Shipping same as billing</label><label className="space-y-1 text-sm font-medium">Shipping address<textarea className="app-input min-h-24 w-full" disabled={sameAsBilling} value={form.shipping_address} onChange={(e) => setForm((p) => ({ ...p, shipping_address: e.target.value }))} /></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Classification</h2><p className="mb-4 text-sm text-muted">Segmenting tags and internal notes for handoff.</p><div className="grid gap-4"><label className="space-y-1 text-sm font-medium">Tags<input className="app-input w-full" placeholder="Strategic, EMEA, Tier-1" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Notes<textarea className="app-input min-h-28 w-full" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label></div></section>
  </CreateObjectPageShell>;
}
