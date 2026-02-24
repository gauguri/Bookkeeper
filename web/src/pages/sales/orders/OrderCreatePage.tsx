import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../api";
import CreateObjectPageShell from "../../../components/sales/CreateObjectPageShell";
import { ItemLookup, ListResponse, QuoteLine, SalesAccount, SalesOrder, SalesQuote } from "../../../components/sales/types";
import { formatCurrency } from "../../../utils/formatters";

const FULFILLMENT_OPTIONS = ["SHIPPING", "PICKUP", "DELIVERY"];
const card = "rounded-2xl border border-[var(--bedrock-border)] bg-surface p-4 shadow-sm sm:p-6";

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [items, setItems] = useState<ItemLookup[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([{ item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }]);
  const [form, setForm] = useState({ account_id: "", quote_id: "", opportunity_id: "", order_date: new Date().toISOString().slice(0, 10), requested_ship_date: "", fulfillment_type: "SHIPPING", shipping_address: "", status: "DRAFT" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<ListResponse<SalesAccount>>(`/sales/accounts?page=0&page_size=100`).then((r) => setAccounts(r.items)); apiFetch<ListResponse<SalesQuote>>(`/sales/quotes?page=0&page_size=100`).then((r) => setQuotes(r.items)); apiFetch<ItemLookup[]>(`/items-enriched`).then(setItems); }, []);

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
      else navigate(`/sales/orders/${created.id}`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  return <CreateObjectPageShell title="Create Order" description="Build a fulfillment-ready order with operational risk visibility." dirty={Boolean(form.account_id || lines.length > 1)} error={error} validationErrors={!form.account_id ? [{ id: "order-account", label: "Account is required" }] : []} creating={saving} onClose={() => navigate(-1)} onCancel={() => navigate(-1)} onSaveDraft={() => localStorage.setItem("draft:create-order", JSON.stringify({ form, lines }))} onSaveNew={() => create(true)} onCreate={() => create(false)} insights={<><section className={card}><h3 className="text-base font-semibold">Availability / ETA</h3><p className="mt-2 text-sm">{lowStock ? "Inventory risk detected" : "Inventory levels look healthy"}</p><p className="mt-1 text-xs text-muted">ETA integration placeholder until inventory service is connected.</p></section><section className={card}><h3 className="text-base font-semibold">Risk Flags</h3><ul className="mt-2 space-y-1 text-sm"><li>• Large order threshold: {totals > 20000 ? "Triggered" : "Normal"}</li><li>• Fulfillment: {form.fulfillment_type}</li><li>• Total: {formatCurrency(totals)}</li></ul></section></>}>
    <section className={card}><h2 className="text-lg font-semibold">Customer</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium" htmlFor="order-account">Account *<select id="order-account" data-autofocus="true" className="app-select w-full" value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="space-y-1 text-sm font-medium">Source quote<select className="app-select w-full" value={form.quote_id} onChange={(e) => setForm((p) => ({ ...p, quote_id: e.target.value }))}><option value="">Optional quote</option>{quotes.map((q) => <option key={q.id} value={q.id}>{q.quote_number}</option>)}</select></label></div></section>
    <section className={card}><h2 className="text-lg font-semibold">Fulfillment</h2><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium">Order date<input className="app-input w-full" type="date" value={form.order_date} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Requested ship date<input className="app-input w-full" type="date" value={form.requested_ship_date} onChange={(e) => setForm((p) => ({ ...p, requested_ship_date: e.target.value }))} /></label><label className="space-y-1 text-sm font-medium">Fulfillment type<select className="app-select w-full" value={form.fulfillment_type} onChange={(e) => setForm((p) => ({ ...p, fulfillment_type: e.target.value }))}>{FULFILLMENT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>{(form.fulfillment_type === "SHIPPING" || form.fulfillment_type === "DELIVERY") && <label className="space-y-1 text-sm font-medium sm:col-span-2">Shipping address<textarea className="app-input min-h-24 w-full" value={form.shipping_address} onChange={(e) => setForm((p) => ({ ...p, shipping_address: e.target.value }))} /></label>}</div></section>
    <section className={card}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Line Items</h2><button className="app-button-secondary" type="button" onClick={() => setLines((l) => [...l, { item_id: null, description: "", qty: 1, unit_price: 0, discount_pct: 0 }])}><Plus className="h-4 w-4" />Add line</button></div><div className="space-y-3">{lines.map((line, idx) => <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]"><select className="app-select" value={line.item_id || ""} onChange={(e) => { const item = items.find((i) => i.id === Number(e.target.value)); setLines((prev) => prev.map((x, i) => i === idx ? { ...x, item_id: Number(e.target.value), unit_price: item?.unit_price || 0, description: item?.name || "" } : x)); }}><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="app-input" type="number" min="1" value={line.qty} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value || 1) } : x))} /><input className="app-input" type="number" min="0" value={line.unit_price} onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value || 0) } : x))} /><button type="button" className="app-button-ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
    <section className={card}><h2 className="text-lg font-semibold">Totals</h2><p className="mt-2 text-sm font-semibold">Estimated total: {formatCurrency(totals)}</p></section>
  </CreateObjectPageShell>;
}
