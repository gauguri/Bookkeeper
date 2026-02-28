import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Download, FileUp, Plus, Search, Settings2, X } from "lucide-react";
import { apiFetch } from "../api";
import { formatCurrency } from "../utils/formatters";

type Supplier = {
  id: number;
  name: string;
  legal_name?: string | null;
  website?: string | null;
  tax_id?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  remit_to_address?: string | null;
  ship_from_address?: string | null;
  status: "active" | "inactive";
  default_lead_time_days?: number | null;
  payment_terms?: string | null;
  currency?: string | null;
  shipping_terms?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type SupplierSummary = {
  active_suppliers: number;
  suppliers_with_open_pos: number;
  average_lead_time_days: number;
  on_time_delivery_percent: number;
  catalog_coverage_percent: number;
};

type SupplierItem = {
  id: number;
  supplier_id: number;
  item_id: number;
  item_name: string;
  item_sku?: string | null;
  supplier_sku?: string | null;
  default_unit_cost: number;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  is_active: boolean;
  is_preferred: boolean;
};

type Item = { id: number; name: string; sku?: string | null; unit_price: number };
type Queue = "all" | "needs_attention" | "active" | "inactive" | "missing_catalog" | "high_lead_time";

const ranges = ["MTD", "QTD", "YTD", "12M"];
const queueOptions: Array<{ key: Queue; label: string }> = [
  { key: "needs_attention", label: "Needs Attention" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "missing_catalog", label: "Missing Catalog" },
  { key: "high_lead_time", label: "High Lead Time" },
  { key: "all", label: "All Suppliers" },
];

const emptyForm = {
  name: "",
  legal_name: "",
  website: "",
  tax_id: "",
  status: "active" as "active" | "inactive",
  contact_name: "",
  email: "",
  phone: "",
  remit_to_address: "",
  ship_from_address: "",
  default_lead_time_days: "",
  payment_terms: "Net 30",
  currency: "USD",
  shipping_terms: "",
  notes: "",
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<Queue>("all");
  const [range, setRange] = useState("YTD");
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [selectedTab, setSelectedTab] = useState<"overview" | "catalog" | "performance" | "notes">("overview");
  const [catalog, setCatalog] = useState<SupplierItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [columnsCompact, setColumnsCompact] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogItemIds, setCatalogItemIds] = useState<number[]>([]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError("");
    try {
      const [supplierData, summaryData, itemData] = await Promise.all([
        apiFetch<Supplier[]>(`/suppliers?search=${encodeURIComponent(search)}&queue=${queue === "all" ? "" : queue}`),
        apiFetch<SupplierSummary>(`/suppliers/summary?range=${range}`),
        apiFetch<Item[]>("/items"),
      ]);
      setSuppliers(supplierData);
      setSummary(summaryData);
      setItems(itemData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSuppliers(); }, [search, queue, range]);

  const loadCatalog = async (supplierId: number) => {
    try {
      const data = await apiFetch<SupplierItem[]>(`/suppliers/${supplierId}/items`);
      setCatalog(data);
    } catch {
      setCatalog([]);
    }
  };

  const openSupplier = (supplier: Supplier) => {
    setSelected(supplier);
    setSelectedTab("overview");
    void loadCatalog(supplier.id);
  };

  const queueCounts = useMemo(() => ({
    needs_attention: suppliers.filter((s) => !s.email || !s.phone || !s.remit_to_address).length,
    active: suppliers.filter((s) => s.status === "active").length,
    inactive: suppliers.filter((s) => s.status === "inactive").length,
    missing_catalog: suppliers.filter((s) => s.status === "active").filter((s) => !catalog.some((c) => c.supplier_id === s.id)).length,
    high_lead_time: suppliers.filter((s) => (s.default_lead_time_days ?? 0) > 30).length,
    all: suppliers.length,
  }), [suppliers, catalog]);

  const spendData = suppliers.slice(0, 10).map((s) => ({ name: s.name, spend: 0 }));
  const leadTimeData = [0, 7, 14, 30, 45].map((bucket, index) => ({ bucket: `${bucket}+`, count: suppliers.filter((s) => (s.default_lead_time_days ?? 0) >= bucket && (index === 4 || (s.default_lead_time_days ?? 0) < [7, 14, 30, 45, 999][index + 1])).length }));
  const onTimeData = [{ name: "On-time", value: summary?.on_time_delivery_percent ?? 0 }, { name: "Late", value: 100 - (summary?.on_time_delivery_percent ?? 0) }];

  const saveSupplier = async (addCatalog = false) => {
    if (!form.name.trim()) return setError("Supplier name is required.");
    const emailValid = !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    const urlValid = !form.website || /^https?:\/\//.test(form.website);
    if (!emailValid) return setError("Enter a valid email.");
    if (!urlValid) return setError("Website must start with http:// or https://");

    const payload = {
      ...form,
      default_lead_time_days: form.default_lead_time_days ? Number(form.default_lead_time_days) : null,
    };

    try {
      let saved: Supplier;
      if (editingId) {
        saved = await apiFetch<Supplier>(`/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        saved = await apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadSuppliers();
      if (addCatalog) {
        openSupplier(saved);
        setSelectedTab("catalog");
        setCatalogPickerOpen(true);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleBulkStatus = async (status: "active" | "inactive") => {
    await Promise.all(selectedRows.map((id) => apiFetch(`/suppliers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) })));
    setSelectedRows([]);
    await loadSuppliers();
  };

  const addCatalogItems = async () => {
    if (!selected || !catalogItemIds.length) return;
    await apiFetch(`/suppliers/${selected.id}/items`, {
      method: "POST",
      body: JSON.stringify(catalogItemIds.map((id) => ({ item_id: id, supplier_cost: 0, default_unit_cost: 0 }))),
    });
    setCatalogPickerOpen(false);
    setCatalogItemIds([]);
    await loadCatalog(selected.id);
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Suppliers Workbench</h1>
          <p className="text-muted">Manage vendors, catalogs, lead times, and purchasing performance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ranges.map((r) => <button key={r} className={`app-button-secondary ${range === r ? "ring-2 ring-primary/30" : ""}`} onClick={() => setRange(r)}>{r}</button>)}
          <button className="app-button-secondary"><FileUp className="h-4 w-4" /> Import</button>
          <button className="app-button-secondary"><Download className="h-4 w-4" /> Export</button>
          <button className="app-button" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Supplier</button>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {[
          { label: "Active Suppliers", value: summary?.active_suppliers ?? 0, onClick: () => setQueue("active") },
          { label: "Suppliers with Open POs", value: summary?.suppliers_with_open_pos ?? 0, onClick: () => setQueue("all") },
          { label: "Average Lead Time", value: `${Math.round(summary?.average_lead_time_days ?? 0)}d`, onClick: () => setQueue("high_lead_time") },
          { label: "On-Time Delivery %", value: `${Math.round(summary?.on_time_delivery_percent ?? 0)}%`, onClick: () => setQueue("all") },
          { label: "Catalog Coverage", value: `${Math.round(summary?.catalog_coverage_percent ?? 0)}%`, onClick: () => setQueue("missing_catalog") },
        ].map((tile) => (
          <button key={tile.label} className="app-card p-4 text-left transition hover:-translate-y-0.5" onClick={tile.onClick}>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <aside className="app-card space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          {queueOptions.map((q) => (
            <button key={q.key} onClick={() => setQueue(q.key)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${queue === q.key ? "bg-primary text-primary-foreground" : "bg-secondary/60"}`}>
              <span>{q.label}</span><span>{queueCounts[q.key]}</span>
            </button>
          ))}
        </aside>

        <div className="space-y-4 xl:col-span-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">Spend by Supplier (Top 10)</p><ResponsiveContainer width="100%" height="90%"><BarChart data={spendData}><XAxis dataKey="name" hide /><YAxis hide /><Tooltip /><Bar dataKey="spend" fill="#4f46e5" /></BarChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">Lead Time Distribution</p><ResponsiveContainer width="100%" height="90%"><BarChart data={leadTimeData}><XAxis dataKey="bucket" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#0891b2" /></BarChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">On-Time vs Late</p><ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={onTimeData} dataKey="value" innerRadius={50} outerRadius={80}>{onTimeData.map((_, i) => <Cell key={i} fill={i === 0 ? "#16a34a" : "#dc2626"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">PO Volume Trend</p><ResponsiveContainer width="100%" height="90%"><LineChart data={[{ month: "M-3", value: 0 }, { month: "M-2", value: 0 }, { month: "M-1", value: 0 }, { month: "Now", value: 0 }]}><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="value" stroke="#7c3aed" /></LineChart></ResponsiveContainer></div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted" /><input className="app-input w-72" placeholder="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="flex gap-2">
                <button className="app-button-secondary" onClick={() => setColumnsCompact((p) => !p)}><Settings2 className="h-4 w-4" /> Density</button>
                {selectedRows.length > 0 ? <><button className="app-button-secondary" onClick={() => void toggleBulkStatus("active")}>Activate</button><button className="app-button-secondary" onClick={() => void toggleBulkStatus("inactive")}>Deactivate</button></> : null}
              </div>
            </div>
            {loading ? <div className="h-52 animate-pulse rounded-xl bg-secondary" /> : suppliers.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center"><Building2 className="mx-auto mb-2 h-8 w-8 text-muted" /><p className="text-lg font-semibold">No suppliers yet</p><p className="text-sm text-muted">Add your first supplier or import your vendor master.</p><div className="mt-4 flex justify-center gap-2"><button className="app-button" onClick={() => setShowForm(true)}>Add your first supplier</button><button className="app-button-secondary">Import suppliers</button></div></div>
            ) : (
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th /><th>Supplier Name</th><th>Status</th><th>Primary Contact</th><th>Email</th><th>Phone</th><th>Lead Time</th><th>Catalog Items</th><th>Preferred Items</th><th>Spend (YTD)</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{suppliers.map((s) => { const count = catalog.filter((c) => c.supplier_id === s.id).length; return <tr key={s.id} className={`border-t ${columnsCompact ? "" : "h-14"}`}><td><input type="checkbox" checked={selectedRows.includes(s.id)} onChange={() => setSelectedRows((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])} /></td><td><button className="font-medium hover:underline" onClick={() => openSupplier(s)}>{s.name}</button></td><td><span className={`app-badge ${s.status === "active" ? "border-success/30 bg-success/10 text-success" : ""}`}>{s.status}</span></td><td>{s.contact_name ?? "-"}</td><td>{s.email ?? "-"}</td><td>{s.phone ?? "-"}</td><td>{s.default_lead_time_days ?? "-"}</td><td>{count}</td><td>{catalog.filter((c) => c.supplier_id === s.id && c.is_preferred).length}</td><td>{formatCurrency(0)}</td><td>{new Date(s.updated_at).toLocaleDateString()}</td><td><div className="flex gap-2"><button className="app-button-ghost" onClick={() => openSupplier(s)}>View/Edit</button><button className="app-button-ghost" onClick={() => { openSupplier(s); setSelectedTab("catalog"); }}>Map Items</button></div></td></tr>; })}</tbody></table></div>
            )}
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="h-full w-full max-w-2xl overflow-auto bg-background p-6">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{editingId ? "Edit Supplier" : "New Supplier"}</h2><button className="app-button-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}><X className="h-4 w-4" /></button></div>
            <div className="space-y-4">
              <label className="block text-sm">Supplier name *<input className="app-input mt-1 w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Legal name<input className="app-input mt-1 w-full" value={form.legal_name} onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))} /></label><label className="text-sm">Website<input className="app-input mt-1 w-full" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://" /></label></div>
              <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Contact name<input className="app-input mt-1 w-full" value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} /></label><label className="text-sm">Email<input className="app-input mt-1 w-full" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></label></div>
              <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Phone<input className="app-input mt-1 w-full" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label><label className="text-sm">Tax ID<input className="app-input mt-1 w-full" value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} /></label></div>
              <label className="block text-sm">Remit-to address<textarea className="app-input mt-1 w-full" value={form.remit_to_address} onChange={(e) => setForm((p) => ({ ...p, remit_to_address: e.target.value }))} /></label>
              <label className="block text-sm">Ship-from address<textarea className="app-input mt-1 w-full" value={form.ship_from_address} onChange={(e) => setForm((p) => ({ ...p, ship_from_address: e.target.value }))} /></label>
              <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Lead time days<input className="app-input mt-1 w-full" type="number" min={0} value={form.default_lead_time_days} onChange={(e) => setForm((p) => ({ ...p, default_lead_time_days: e.target.value }))} /></label><label className="text-sm">Payment terms<input className="app-input mt-1 w-full" value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))} /></label><label className="text-sm">Currency<input className="app-input mt-1 w-full" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} /></label></div>
              <div className="flex justify-end gap-2 border-t pt-4"><button className="app-button-secondary" onClick={() => void saveSupplier(false)}>Save Draft</button><button className="app-button" onClick={() => void saveSupplier(false)}>Save</button><button className="app-button-secondary" onClick={() => void saveSupplier(true)}>Save & Add Catalog Items</button></div>
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}><aside className="h-full w-full max-w-2xl overflow-auto bg-background p-6" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-semibold">{selected.name}</h2><p className="text-sm text-muted">Supplier detail drawer</p></div><button className="app-button-ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></button></div><div className="mb-4 flex gap-2">{(["overview", "catalog", "performance", "notes"] as const).map((tab) => <button key={tab} className={`app-button-secondary ${selectedTab === tab ? "ring-2 ring-primary/30" : ""}`} onClick={() => setSelectedTab(tab)}>{tab}</button>)}</div>
          {selectedTab === "overview" ? <div className="space-y-3 text-sm"><p><span className="text-muted">Legal name:</span> {selected.legal_name ?? "-"}</p><p><span className="text-muted">Website:</span> {selected.website ?? "-"}</p><p><span className="text-muted">Tax ID:</span> {selected.tax_id ?? "-"}</p><p><span className="text-muted">Contact:</span> {selected.contact_name ?? "-"} • {selected.email ?? "-"} • {selected.phone ?? "-"}</p><p><span className="text-muted">Remit-to:</span> {selected.remit_to_address ?? "-"}</p><p><span className="text-muted">Ship-from:</span> {selected.ship_from_address ?? "-"}</p><p><span className="text-muted">Defaults:</span> {selected.currency ?? "USD"} • {selected.payment_terms ?? "-"} • LT {selected.default_lead_time_days ?? "-"}d</p></div> : null}
          {selectedTab === "catalog" ? <div className="space-y-3"><div className="flex justify-end"><button className="app-button" onClick={() => setCatalogPickerOpen(true)}><Plus className="h-4 w-4" /> Link Items</button></div>{catalog.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-semibold">No catalog items yet</p><button className="app-button mt-3" onClick={() => setCatalogPickerOpen(true)}>Link items</button></div> : <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted"><tr><th>Item</th><th>Supplier SKU</th><th>Default Unit Cost</th><th>Lead Time</th><th>MOQ</th><th>Active</th></tr></thead><tbody>{catalog.map((row) => <tr key={row.id} className="border-t"><td>{row.item_name}</td><td>{row.supplier_sku ?? "-"}</td><td>{formatCurrency(row.default_unit_cost ?? 0)}</td><td>{row.lead_time_days ?? "-"}</td><td>{row.min_order_qty ?? "-"}</td><td>{row.is_active ? "Yes" : "No"}</td></tr>)}</tbody></table>}</div> : null}
          {selectedTab === "performance" ? <div className="rounded-lg border border-dashed p-6 text-sm text-muted">Performance metrics coming soon.</div> : null}
          {selectedTab === "notes" ? <div className="rounded-lg border p-4 text-sm">{selected.notes || "No notes or documents uploaded yet."}</div> : null}
        </aside></div>
      ) : null}

      {catalogPickerOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" onClick={() => setCatalogPickerOpen(false)}>
          <div className="app-card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold">Link Items to Supplier</h3>
            <div className="grid max-h-80 grid-cols-1 gap-2 overflow-auto rounded-lg border p-3">
              {items.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catalogItemIds.includes(item.id)} onChange={() => setCatalogItemIds((prev) => prev.includes(item.id) ? prev.filter((i) => i !== item.id) : [...prev, item.id])} />{item.name} {item.sku ? `(${item.sku})` : ""}</label>)}
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="app-button-ghost" onClick={() => setCatalogPickerOpen(false)}>Cancel</button><button className="app-button" onClick={() => void addCatalogItems()}>Bulk Add</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
