import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../api";
import CreateObjectPageShell from "../../../components/sales/CreateObjectPageShell";
import { ItemLookup, ListResponse, QuoteLine, SalesOpportunity, SalesQuote } from "../../../components/sales/types";
import { formatCurrency } from "../../../utils/formatters";

const card = "rounded-2xl border border-[var(--bedrock-border)] bg-surface p-4 shadow-sm sm:p-6";

export default function QuoteCreatePage() {
  const navigate = useNavigate();
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([{ item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }]);
  const [form, setForm] = useState({ opportunity_id: "", valid_until: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<ListResponse<SalesOpportunity>>(`/sales/opportunities?page=0&page_size=100`).then((r) => setOpps(r.items)); apiFetch<ItemLookup[]>(`/items-enriched`).then(setItems); }, []);

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
      else navigate(`/sales/quotes/${created.id}`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <CreateObjectPageShell title="Create Quote" description="Build a quote with line-item precision, totals, and approval cues." dirty={Boolean(form.opportunity_id || lines.length > 1)} error={error} validationErrors={!form.opportunity_id ? [{ id: "quote-opportunity", label: "Opportunity is required" }] : []} creating={saving} onClose={() => navigate(-1)} onCancel={() => navigate(-1)} onSaveDraft={() => localStorage.setItem("draft:create-quote", JSON.stringify({ form, lines }))} onSaveNew={() => create(true)} onCreate={() => create(false)} insights={<><section className={card}><h3 className="text-base font-semibold">Margin Preview</h3><p className="mt-2 text-sm">Gross margin estimate</p><p className="text-xl font-semibold">{totals.grand > 0 ? `${Math.round(((totals.grand - totals.subtotal * 0.7) / totals.grand) * 100)}%` : "0%"}</p></section><section className={card}><h3 className="text-base font-semibold">Discount Approval</h3><p className={`mt-2 rounded-lg border px-3 py-2 text-sm ${approvalRequired ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>{approvalRequired ? "Approval required: discount exceeds threshold." : "No approval required."}</p></section></>}>
    <section className={card}><h2 className="text-lg font-semibold">Basics</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium" htmlFor="quote-opportunity">Opportunity *<select id="quote-opportunity" data-autofocus="true" className="app-select w-full" value={form.opportunity_id} onChange={(e) => setForm((p) => ({ ...p, opportunity_id: e.target.value }))}><option value="">Select opportunity</option>{opps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label className="space-y-1 text-sm font-medium">Valid until<input type="date" className="app-input w-full" value={form.valid_until} onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))} /></label></div></section>
    <section className={card}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Line Items</h2><button className="app-button-secondary" type="button" onClick={() => setLines((l) => [...l, { item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }])}><Plus className="h-4 w-4" />Add line</button></div><div className="space-y-3">{lines.map((line, idx) => <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"><select className="app-select" value={line.item_id || ""} onChange={(e) => { const item = items.find((it) => it.id === Number(e.target.value)); setLines((prev) => prev.map((x, i) => i === idx ? { ...x, item_id: Number(e.target.value), description: item?.name || "", unit_price: item?.unit_price || 0 } : x)); }}><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="app-input" type="number" min="1" value={line.qty} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value || 1) } : x))} /><input className="app-input" type="number" min="0" value={line.unit_price} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x))} /><input className="app-input" type="number" min="0" max="100" value={line.discount_pct} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, discount_pct: Number(e.target.value || 0) } : x))} /><button className="app-button-ghost" type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
    <section className={card}><h2 className="text-lg font-semibold">Totals</h2><div className="mt-3 space-y-1 text-sm"><p>Subtotal: {formatCurrency(totals.subtotal)}</p><p>Discount: {formatCurrency(totals.discount)}</p><p>Tax: {formatCurrency(totals.tax)}</p><p className="font-semibold">Grand total: {formatCurrency(totals.grand)}</p></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Terms</h2><textarea className="app-input min-h-24 w-full" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></section>
  </CreateObjectPageShell>;
}
