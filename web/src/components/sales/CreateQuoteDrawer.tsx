import { FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api";
import { formatCurrency } from "../../utils/formatters";
import EntityCreateDrawer from "./EntityCreateDrawer";
import { ItemLookup, ListResponse, QuoteLine, SalesOpportunity, SalesQuote } from "./types";

type Props = { open: boolean; onClose: () => void; onCreated: (id: number, saveNew?: boolean) => void; mode?: "overlay" | "inline" };

export default function CreateQuoteDrawer({ open, onClose, onCreated, mode = "overlay" }: Props) {
  const [step, setStep] = useState(0);
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([{ item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }]);
  const [form, setForm] = useState({ opportunity_id: "", valid_until: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!open) return; apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then((r) => setOpps(r.items)); apiFetch<ItemLookup[]>(`/items-enriched`).then(setItems); }, [open]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
    const discount = lines.reduce((a, l) => a + (l.qty * l.unit_price * l.discount_pct) / 100, 0);
    const tax = (subtotal - discount) * 0.1;
    return { subtotal, discount, tax, grand: subtotal - discount + tax };
  }, [lines]);

  const approvalRequired = lines.some((line) => line.discount_pct > 20);

  const create = async (saveNew?: boolean) => {
    if (!form.opportunity_id) return setError("Opportunity is required.");
    setSaving(true); setError("");
    try {
      const created = await apiFetch<SalesQuote>("/sales/quotes", { method: "POST", body: JSON.stringify({ opportunity_id: Number(form.opportunity_id), valid_until: form.valid_until || null, notes: `${form.notes || ""}${approvalRequired ? "\n[approval-required]" : ""}`, lines }) });
      if (saveNew) { setForm({ opportunity_id: "", valid_until: "", notes: "" }); setLines([{ item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }]); }
      onCreated(created.id, saveNew);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <EntityCreateDrawer open={open} title="New Quote" description="CPQ-lite quote creation with approvals and margin signals." icon={<FileText className="h-5 w-5" />} steps={["Overview", "Line Items", "Review"]} step={step} onStepChange={setStep} dirty={Boolean(form.opportunity_id || lines.length)} error={error} onClose={onClose} onSaveDraft={() => localStorage.setItem("draft:create-quote", JSON.stringify({ form, lines }))} onSaveNew={() => create(true)} onCreate={() => create(false)} creating={saving} mode={mode} insights={<div className="space-y-3 text-sm"><h4 className="font-semibold">Quote Insights</h4><p>Pricing source: <span className="text-muted">Default pricebook + manual overrides</span></p>{approvalRequired && <p className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-amber-300">Approval required: discount over threshold.</p>}<p>Margin preview: {totals.grand > 0 ? `${Math.round(((totals.grand - totals.subtotal * 0.7) / totals.grand) * 100)}%` : "0%"}</p><button className="app-button-secondary w-full" disabled title="Coming soon">Generate PDF (coming soon)</button></div>}>
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2"><select data-autofocus="true" className="app-select" value={form.opportunity_id} onChange={(e) => setForm((p) => ({ ...p, opportunity_id: e.target.value }))}><option value="">Select opportunity*</option>{opps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select><input className="app-input" type="date" value={form.valid_until} onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))} /></div>
      <div className="rounded-xl border border-[var(--bedrock-border)] p-3">
        <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">Line items</h4><button className="app-button-secondary" type="button" onClick={() => setLines((l) => [...l, { item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }])}><Plus className="h-4 w-4" /> Add line</button></div>
        <div className="space-y-2">{lines.map((line, idx) => <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"><select className="app-select" value={line.item_id || ""} onChange={(e) => { const item = items.find((it) => it.id === Number(e.target.value)); setLines((prev) => prev.map((x, i) => i === idx ? { ...x, item_id: Number(e.target.value), description: item?.name || "", unit_price: item?.unit_price || 0 } : x)); }}><option value="">Search item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select><input className="app-input" type="number" min="1" value={line.qty} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value || 1) } : x))} /><input className="app-input" type="number" min="0" value={line.unit_price} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x))} /><input className="app-input" type="number" min="0" max="100" value={line.discount_pct} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, discount_pct: Number(e.target.value || 0) } : x))} /><button className="app-button-ghost" type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></div>)}</div>
      </div>
      <textarea className="app-input w-full" placeholder="Notes and terms" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
      <div className="rounded-xl border border-[var(--bedrock-border)] p-3 text-sm"><p>Subtotal: {formatCurrency(totals.subtotal)}</p><p>Discount total: {formatCurrency(totals.discount)}</p><p>Tax: {formatCurrency(totals.tax)}</p><p className="font-semibold">Grand total: {formatCurrency(totals.grand)}</p></div>
    </div>
  </EntityCreateDrawer>;
}
