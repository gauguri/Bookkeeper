import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type Item = {
  id: number;
  sku?: string;
  name: string;
  description?: string;
  unit_price: number;
  income_account_id?: number | null;
  is_active: boolean;
  preferred_supplier_id?: number | null;
  preferred_supplier_name?: string | null;
  preferred_landed_cost?: number | null;
};

type Supplier = {
  id: number;
  name: string;
};

type SupplierLink = {
  supplier_id: number;
  item_id: number;
  supplier_name: string;
  supplier_cost: number;
  freight_cost: number;
  tariff_cost: number;
  landed_cost: number;
  is_preferred: boolean;
  supplier_sku?: string | null;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  notes?: string | null;
};

const emptyForm = {
  sku: "",
  name: "",
  description: "",
  unit_price: "",
  income_account_id: "",
  is_active: true
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierLinks, setSupplierLinks] = useState<SupplierLink[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: "",
    supplier_cost: "",
    freight_cost: "",
    tariff_cost: "",
    supplier_sku: "",
    lead_time_days: "",
    min_order_qty: "",
    notes: "",
    is_preferred: false
  });
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const loadItems = async () => {
    try {
      const data = await apiFetch<Item[]>(`/items?search=${encodeURIComponent(search)}`);
      setItems(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await apiFetch<Supplier[]>("/suppliers");
      setSuppliers(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadItemSuppliers = async (itemId: number) => {
    try {
      const data = await apiFetch<SupplierLink[]>(`/items/${itemId}/suppliers`);
      setSupplierLinks(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadItems();
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editingId) {
      loadItemSuppliers(editingId);
    } else {
      setSupplierLinks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.unit_price) {
      setError("Item name and unit price are required.");
      return;
    }
    setError("");
    const payload = {
      sku: form.sku || null,
      name: form.name,
      description: form.description || null,
      unit_price: Number(form.unit_price),
      income_account_id: form.income_account_id ? Number(form.income_account_id) : null,
      is_active: form.is_active
    };
    try {
      if (editingId) {
        const updated = await apiFetch<Item>(`/items/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      } else {
        const created = await apiFetch<Item>("/items", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setItems((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setSupplierLinks([]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setForm({
      sku: item.sku ?? "",
      name: item.name,
      description: item.description ?? "",
      unit_price: item.unit_price.toString(),
      income_account_id: item.income_account_id ? item.income_account_id.toString() : "",
      is_active: item.is_active
    });
  };

  const archiveItem = async (itemId: number) => {
    try {
      const updated = await apiFetch<Item>(`/items/${itemId}`, { method: "DELETE" });
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openSupplierModal = (link?: SupplierLink) => {
    if (link) {
      setEditingSupplierId(link.supplier_id);
      setSupplierForm({
        supplier_id: link.supplier_id.toString(),
        supplier_cost: link.supplier_cost.toString(),
        freight_cost: link.freight_cost.toString(),
        tariff_cost: link.tariff_cost.toString(),
        supplier_sku: link.supplier_sku ?? "",
        lead_time_days: link.lead_time_days ? link.lead_time_days.toString() : "",
        min_order_qty: link.min_order_qty ? link.min_order_qty.toString() : "",
        notes: link.notes ?? "",
        is_preferred: link.is_preferred
      });
    } else {
      setEditingSupplierId(null);
      setSupplierForm({
        supplier_id: "",
        supplier_cost: "",
        freight_cost: "",
        tariff_cost: "",
        supplier_sku: "",
        lead_time_days: "",
        min_order_qty: "",
        notes: "",
        is_preferred: false
      });
    }
    setSupplierModalOpen(true);
  };

  const closeSupplierModal = () => {
    setSupplierModalOpen(false);
  };

  const submitSupplierLink = async () => {
    if (!editingId) {
      return;
    }
    if (!supplierForm.supplier_id) {
      setError("Select a supplier to link.");
      return;
    }
    const payload = {
      supplier_id: Number(supplierForm.supplier_id),
      supplier_cost: Number(supplierForm.supplier_cost || 0),
      freight_cost: Number(supplierForm.freight_cost || 0),
      tariff_cost: Number(supplierForm.tariff_cost || 0),
      supplier_sku: supplierForm.supplier_sku || null,
      lead_time_days: supplierForm.lead_time_days ? Number(supplierForm.lead_time_days) : null,
      min_order_qty: supplierForm.min_order_qty ? Number(supplierForm.min_order_qty) : null,
      notes: supplierForm.notes || null,
      is_preferred: supplierForm.is_preferred
    };
    try {
      if (editingSupplierId) {
        await apiFetch(`/items/${editingId}/suppliers/${editingSupplierId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/items/${editingId}/suppliers`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      await loadItemSuppliers(editingId);
      await loadItems();
      setSupplierModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeSupplierLink = async (supplierId: number) => {
    if (!editingId) {
      return;
    }
    try {
      await apiFetch(`/items/${editingId}/suppliers/${supplierId}`, { method: "DELETE" });
      await loadItemSuppliers(editingId);
      await loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setPreferredSupplier = async (supplierId: number) => {
    if (!editingId) {
      return;
    }
    try {
      await apiFetch(`/items/${editingId}/suppliers/${supplierId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_preferred: true })
      });
      await loadItemSuppliers(editingId);
      await loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Items</p>
          <h1 className="text-3xl font-semibold">Product catalog</h1>
          <p className="text-muted">Keep pricing, SKUs, and services perfectly up to date.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("item-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> New item
        </button>
      </div>

      <div className="app-card p-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-surface/95 pb-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="app-input w-60"
              placeholder="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="app-button-secondary" onClick={loadItems}>
              Search
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="py-3">Name</th>
                <th>SKU</th>
                <th>Unit price</th>
                <th>Preferred supplier</th>
                <th>Landed cost</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="app-table-row border-t">
                  <td className="py-3 font-medium text-foreground">{item.name}</td>
                  <td className="text-muted">{item.sku ?? "-"}</td>
                  <td className="text-muted tabular-nums">{currency(item.unit_price)}</td>
                  <td className="text-muted">{item.preferred_supplier_name ?? "—"}</td>
                  <td className="text-muted tabular-nums">
                    {item.preferred_landed_cost != null ? currency(item.preferred_landed_cost) : "—"}
                  </td>
                  <td>
                    <span
                      className={`app-badge ${
                        item.is_active
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border bg-secondary text-muted"
                      }`}
                    >
                      {item.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="app-button-ghost" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button
                        className="app-button-ghost text-danger"
                        onClick={() => archiveItem(item.id)}
                        disabled={!item.is_active}
                      >
                        Archive
                      </button>
                      <button className="app-button-ghost" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-secondary" />
                      <p className="font-semibold">No items found</p>
                      <p className="text-sm text-muted">Add your first service or product.</p>
                      <button className="app-button" onClick={() => document.getElementById("item-form")?.scrollIntoView()}>
                        Create item
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="item-form" className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{editingId ? "Edit item" : "New item"}</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">Catalog details</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="app-input"
            placeholder="Name *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="SKU"
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Unit price *"
            type="number"
            min="0"
            step="0.01"
            value={form.unit_price}
            onChange={(event) => setForm({ ...form, unit_price: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Income account ID"
            value={form.income_account_id}
            onChange={(event) => setForm({ ...form, income_account_id: event.target.value })}
          />
          <input
            className="app-input md:col-span-2"
            placeholder="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
            />
            Active
          </label>
          <div className="flex items-center gap-2">
            {editingId && (
              <button
                className="app-button-secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
            <button className="app-button" onClick={handleSubmit}>
              {editingId ? "Save changes" : "Create item"}
            </button>
          </div>
        </div>
      </div>

      {editingId && (
        <div className="app-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Suppliers</h2>
              <p className="text-sm text-muted">Track landed costs and preferred vendors for this item.</p>
            </div>
            <button className="app-button-secondary" onClick={() => openSupplierModal()}>
              <Plus className="h-4 w-4" /> Add supplier
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="py-3">Supplier</th>
                  <th>Supplier cost</th>
                  <th>Freight</th>
                  <th>Tariff</th>
                  <th>Landed cost</th>
                  <th>Preferred</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {supplierLinks.map((link) => (
                  <tr key={link.supplier_id} className="app-table-row border-t">
                    <td className="py-3 font-medium text-foreground">{link.supplier_name}</td>
                    <td className="text-muted tabular-nums">{currency(link.supplier_cost)}</td>
                    <td className="text-muted tabular-nums">{currency(link.freight_cost)}</td>
                    <td className="text-muted tabular-nums">{currency(link.tariff_cost)}</td>
                    <td className="text-muted tabular-nums">{currency(link.landed_cost)}</td>
                    <td>
                      <span
                        className={`app-badge ${
                          link.is_preferred
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-border bg-secondary text-muted"
                        }`}
                      >
                        {link.is_preferred ? "Preferred" : "—"}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button className="app-button-ghost" onClick={() => openSupplierModal(link)}>
                          Edit
                        </button>
                        <button className="app-button-ghost" onClick={() => setPreferredSupplier(link.supplier_id)}>
                          Set preferred
                        </button>
                        <button
                          className="app-button-ghost text-danger"
                          onClick={() => removeSupplierLink(link.supplier_id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {supplierLinks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-secondary" />
                        <p className="font-semibold">No suppliers linked</p>
                        <p className="text-sm text-muted">Add supplier costs to track COGS.</p>
                        <button className="app-button" onClick={() => openSupplierModal()}>
                          Add supplier
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="app-card w-full max-w-xl space-y-4 p-6 shadow-glow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Supplier costs</p>
              <h3 className="text-lg font-semibold">
                {editingSupplierId ? "Edit supplier costs" : "Add supplier"}
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="app-select md:col-span-2"
                value={supplierForm.supplier_id}
                onChange={(event) => setSupplierForm({ ...supplierForm, supplier_id: event.target.value })}
                disabled={Boolean(editingSupplierId)}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Supplier cost"
                value={supplierForm.supplier_cost}
                onChange={(event) => setSupplierForm({ ...supplierForm, supplier_cost: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Freight cost"
                value={supplierForm.freight_cost}
                onChange={(event) => setSupplierForm({ ...supplierForm, freight_cost: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Tariff cost"
                value={supplierForm.tariff_cost}
                onChange={(event) => setSupplierForm({ ...supplierForm, tariff_cost: event.target.value })}
              />
              <input
                className="app-input"
                placeholder="Supplier SKU"
                value={supplierForm.supplier_sku}
                onChange={(event) => setSupplierForm({ ...supplierForm, supplier_sku: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                placeholder="Lead time (days)"
                value={supplierForm.lead_time_days}
                onChange={(event) => setSupplierForm({ ...supplierForm, lead_time_days: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Min order qty"
                value={supplierForm.min_order_qty}
                onChange={(event) => setSupplierForm({ ...supplierForm, min_order_qty: event.target.value })}
              />
              <input
                className="app-input md:col-span-2"
                placeholder="Notes"
                value={supplierForm.notes}
                onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={supplierForm.is_preferred}
                onChange={(event) => setSupplierForm({ ...supplierForm, is_preferred: event.target.checked })}
              />
              Mark as preferred supplier
            </label>
            <div className="flex justify-end gap-2">
              <button className="app-button-ghost" onClick={closeSupplierModal}>
                Cancel
              </button>
              <button className="app-button" onClick={submitSupplierLink}>
                {editingSupplierId ? "Save changes" : "Add supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("item-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}
