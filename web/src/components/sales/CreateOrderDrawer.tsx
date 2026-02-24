import { PackageCheck, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api";
import { formatCurrency } from "../../utils/formatters";
import EntityCreateDrawer from "./EntityCreateDrawer";
import { ItemLookup, ListResponse, QuoteLine, SalesAccount, SalesOrder, SalesQuote } from "./types";

type Props = { open: boolean; onClose: () => void; onCreated: (id: number, saveNew?: boolean) => void; mode?: "overlay" | "inline" };
const FULFILLMENT_OPTIONS = ["SHIPPING", "PICKUP", "DELIVERY"];

export default function CreateOrderDrawer({ open, onClose, onCreated, mode = "overlay" }: Props) {
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([{ item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }]);
  const [form, setForm] = useState({ account_id: "", quote_id: "", opportunity_id: "", order_date: new Date().toISOString().slice(0, 10), requested_ship_date: "", fulfillment_type: "SHIPPING", shipping_address: "", status: "DRAFT" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!open) return; apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?page=0&page_size=100`).then((r) => setAccounts(r.items)); apiFetch<ListResponse<SalesQuote>>(`/sales/quotes?page=0&page_size=100`).then((r) => setQuotes(r.items)); apiFetch<ItemLookup[]>(`/items-enriched`).then(setItems); }, [open]);

  const totals = useMemo(() => lines.reduce((acc, l) => acc + l.qty * l.unit_price * (1 - l.discount_pct / 100), 0), [lines]);
  const lowStock = lines.some((line) => {
    const item = items.find((i) => i.id === line.item_id);
    return item && (item.available_qty ?? 0) < line.qty;
  });

  const create = async (saveNew?: boolean) => {
    if (!form.account_id) return setError("Account is required.");
    setSaving(true); setError("");
    try {
      const created = await apiFetch<SalesOrder>("/sales/orders", { method: "POST", body: JSON.stringify({ account_id: Number(form.account_id), quote_id: form.quote_id ? Number(form.quote_id) : null, opportunity_id: form.opportunity_id ? Number(form.opportunity_id) : null, order_date: form.order_date, requested_ship_date: form.requested_ship_date || null, fulfillment_type: form.fulfillment_type, shipping_address: form.shipping_address || null, lines }) });
      if (saveNew) setForm((p) => ({ ...p, account_id: "", quote_id: "", opportunity_id: "", shipping_address: "" }));
      onCreated(created.id, saveNew);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <EntityCreateDrawer open={open} title="New Order" description="Draft order with fulfillment and risk controls." icon={<PackageCheck className="h-5 w-5" />} steps={["Overview", "Fulfillment", "Review"]} step={step} onStepChange={setStep} dirty={Boolean(form.account_id || lines.length)} error={error} onClose={onClose} onSaveDraft={() => localStorage.setItem("draft:create-order", JSON.stringify({ form, lines }))} onSaveNew={() => create(true)} onCreate={() => create(false)} creating={saving} mode={mode} insights={<div className="space-y-3 text-sm"><h4 className="font-semibold">Order Summary</h4><p>Total: {formatCurrency(totals)}</p><p>Fulfillment: {form.fulfillment_type}</p><p>Availability: {lowStock ? <span className="text-amber-300">Low stock risk</span> : <span className="text-emerald-300">Looks healthy</span>}</p><p className="text-xs text-muted">Shipping cost estimate and ETA integration pending.</p>{totals > 20000 && <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">Large order flag</p>}</div>}>
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2"><select data-autofocus="true" className="app-select" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">Select account*</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select className="app-select" value={form.quote_id} onChange={(e) => setForm((p) => ({ ...p, quote_id: e.target.value }))}><option value="">Quote (optional)</option>{quotes.map((q) => <option key={q.id} value={q.id}>{q.quote_number}</option>)}</select><select className="app-select" value={form.fulfillment_type} onChange={(e) => setForm((p) => ({ ...p, fulfillment_type: e.target.value }))}>{FULFILLMENT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select><input className="app-input" type="date" value={form.requested_ship_date} onChange={(e) => setForm((p) => ({ ...p, requested_ship_date: e.target.value }))} /></div>
      {(form.fulfillment_type === "SHIPPING" || form.fulfillment_type === "DELIVERY") && <textarea className="app-input w-full" placeholder="Shipping address" value={form.shipping_address} onChange={(e) => setForm((p) => ({ ...p, shipping_address: e.target.value }))} />}
      <div className="rounded-xl border border-[var(--bedrock-border)] p-3"><div className="mb-2 flex justify-between"><h4 className="font-semibold">Line items</h4><button className="app-button-secondary" type="button" onClick={() => setLines((l) => [...l, { item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }])}><Plus className="h-4 w-4" /> Add line</button></div><div className="space-y-2">{lines.map((line, idx) => <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]"><select className="app-select" value={line.item_id || ""} onChange={(e) => { const item = items.find((i) => i.id === Number(e.target.value)); setLines((prev) => prev.map((x, i) => i === idx ? { ...x, item_id: Number(e.target.value), unit_price: item?.unit_price || 0, description: item?.name || "" } : x)); }}><option value="">Search item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select><input className="app-input" type="number" value={line.qty} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value || 1) } : x))} /><input className="app-input" type="number" value={line.unit_price} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x))} /><button type="button" className="app-button-ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></div>)}</div></div>
    </div>
  </EntityCreateDrawer>;
}
