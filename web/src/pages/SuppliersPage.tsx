import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { apiFetch } from "../api";
import SupplierItemLinkModal, { SupplierItemLinkForm } from "../components/SupplierItemLinkModal";
import { currency } from "../utils/format";

type Supplier = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
  updated_at: string;
};

type ItemOption = {
  id: number;
  name: string;
  sku?: string | null;
  unit_price: number;
};

type SupplierItemLink = {
  supplier_id: number;
  item_id: number;
  item_name: string;
  item_sku?: string | null;
  item_unit_price: number;
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
  name: "",
  email: "",
  phone: "",
  address: ""
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierItems, setSupplierItems] = useState<SupplierItemLink[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState<SupplierItemLinkForm>({
    related_id: "",
    supplier_cost: "",
    freight_cost: "",
    tariff_cost: "",
    supplier_sku: "",
    lead_time_days: "",
    min_order_qty: "",
    notes: "",
    is_preferred: false
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search) {
      return suppliers;
    }
    return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search.toLowerCase()));
  }, [suppliers, search]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<Supplier[]>(`/suppliers?search=${encodeURIComponent(search)}`);
      setSuppliers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await apiFetch<ItemOption[]>("/items");
      setItems(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadSupplierItems = async (supplierId: number) => {
    try {
      const data = await apiFetch<SupplierItemLink[]>(`/suppliers/${supplierId}/items`);
      setSupplierItems(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      loadSupplierItems(selectedSupplierId);
    } else {
      setSupplierItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplierId]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setError("");
    try {
      if (editingId) {
        const updated = await apiFetch<Supplier>(`/suppliers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
        setSuppliers((prev) => prev.map((supplier) => (supplier.id === editingId ? updated : supplier)));
      } else {
        const created = await apiFetch<Supplier>("/suppliers", {
          method: "POST",
          body: JSON.stringify(form)
        });
        setSuppliers((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setSelectedSupplierId(supplier.id);
    setForm({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? ""
    });
  };

  const deleteSupplier = async (supplierId: number) => {
    try {
      await apiFetch(`/suppliers/${supplierId}`, { method: "DELETE" });
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== supplierId));
      if (selectedSupplierId === supplierId) {
        setSelectedSupplierId(null);
        setSupplierItems([]);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openItemModal = (link?: SupplierItemLink) => {
    if (link) {
      setEditingItemId(link.item_id);
      setItemForm({
        related_id: link.item_id.toString(),
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
      setEditingItemId(null);
      setItemForm({
        related_id: "",
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
    setItemModalOpen(true);
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
  };

  const submitSupplierItem = async () => {
    if (!selectedSupplierId) {
      setError("Select a supplier to manage items.");
      return;
    }
    if (!itemForm.related_id) {
      setError("Select an item to link.");
      return;
    }
    const payload = {
      item_id: Number(itemForm.related_id),
      supplier_cost: Number(itemForm.supplier_cost || 0),
      freight_cost: Number(itemForm.freight_cost || 0),
      tariff_cost: Number(itemForm.tariff_cost || 0),
      supplier_sku: itemForm.supplier_sku || null,
      lead_time_days: itemForm.lead_time_days ? Number(itemForm.lead_time_days) : null,
      min_order_qty: itemForm.min_order_qty ? Number(itemForm.min_order_qty) : null,
      notes: itemForm.notes || null,
      is_preferred: itemForm.is_preferred
    };
    try {
      if (editingItemId) {
        await apiFetch(`/suppliers/${selectedSupplierId}/items/${editingItemId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/suppliers/${selectedSupplierId}/items`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      await loadSupplierItems(selectedSupplierId);
      setItemModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeSupplierItem = async (itemId: number) => {
    if (!selectedSupplierId) {
      return;
    }
    try {
      await apiFetch(`/suppliers/${selectedSupplierId}/items/${itemId}`, { method: "DELETE" });
      await loadSupplierItems(selectedSupplierId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setPreferredSupplierItem = async (itemId: number) => {
    if (!selectedSupplierId) {
      return;
    }
    try {
      await apiFetch(`/suppliers/${selectedSupplierId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_preferred: true })
      });
      await loadSupplierItems(selectedSupplierId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Suppliers</p>
          <h1 className="text-3xl font-semibold">Supplier directory</h1>
          <p className="text-muted">Maintain vendor contacts and purchasing partners.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("supplier-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> New supplier
        </button>
      </div>

      <div className="app-card p-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-surface/95 pb-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="app-input w-60"
              placeholder="Search suppliers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="app-button-secondary" onClick={loadSuppliers} disabled={loading}>
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
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => (
                <tr
                  key={supplier.id}
                  className={`app-table-row border-t ${supplier.id === selectedSupplierId ? "bg-secondary/40" : ""}`}
                >
                  <td className="py-3 font-medium text-foreground">
                    <button
                      className="text-left font-medium text-foreground hover:underline"
                      onClick={() => setSelectedSupplierId(supplier.id)}
                    >
                      {supplier.name}
                    </button>
                  </td>
                  <td className="text-muted">{supplier.email ?? "-"}</td>
                  <td className="text-muted">{supplier.phone ?? "-"}</td>
                  <td className="text-muted">{supplier.address ?? "-"}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="app-button-ghost" onClick={() => startEdit(supplier)}>
                        Edit
                      </button>
                      <button className="app-button-ghost" onClick={() => setSelectedSupplierId(supplier.id)}>
                        Manage items
                      </button>
                      <button className="app-button-ghost text-danger" onClick={() => deleteSupplier(supplier.id)}>
                        Delete
                      </button>
                      <button className="app-button-ghost" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-secondary" />
                      <p className="font-semibold">No suppliers found</p>
                      <p className="text-sm text-muted">Create a supplier to start tracking vendor costs.</p>
                      <button
                        className="app-button"
                        onClick={() => document.getElementById("supplier-form")?.scrollIntoView()}
                      >
                        Create supplier
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Items supplied</h2>
            <p className="text-sm text-muted">
              {selectedSupplier ? `Manage catalog for ${selectedSupplier.name}.` : "Select a supplier to manage items."}
            </p>
          </div>
          <button className="app-button-secondary" onClick={() => openItemModal()} disabled={!selectedSupplierId}>
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
        {selectedSupplier ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="py-3">Item</th>
                  <th>SKU</th>
                  <th>Sell price</th>
                  <th>Supplier cost</th>
                  <th>Freight</th>
                  <th>Tariff</th>
                  <th>Landed cost</th>
                  <th>Preferred for item?</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {supplierItems.map((link) => (
                  <tr key={link.item_id} className="app-table-row border-t">
                    <td className="py-3 font-medium text-foreground">{link.item_name}</td>
                    <td className="text-muted">{link.item_sku ?? "-"}</td>
                    <td className="text-muted tabular-nums">{currency(link.item_unit_price)}</td>
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
                        <button className="app-button-ghost" onClick={() => openItemModal(link)}>
                          Edit
                        </button>
                        <button className="app-button-ghost" onClick={() => setPreferredSupplierItem(link.item_id)}>
                          Set preferred
                        </button>
                        <button className="app-button-ghost text-danger" onClick={() => removeSupplierItem(link.item_id)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {supplierItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-muted">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-secondary" />
                        <p className="font-semibold">No items linked</p>
                        <p className="text-sm text-muted">Add items to build the supplier catalog.</p>
                        <button className="app-button" onClick={() => openItemModal()}>
                          Add item
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-10 text-center text-sm text-muted">
            Select a supplier from the list to view and manage its supplied items.
          </div>
        )}
      </div>

      <div id="supplier-form" className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{editingId ? "Edit supplier" : "New supplier"}</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">Vendor profile</span>
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
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="app-input md:col-span-2"
            placeholder="Address"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted">Last updated {editingId ? "recently" : "—"}</div>
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
              {editingId ? "Save changes" : "Create supplier"}
            </button>
          </div>
        </div>
      </div>

      <SupplierItemLinkModal
        isOpen={itemModalOpen}
        title={editingItemId ? "Edit supplied item" : "Add item"}
        subtitle="Supplier catalog"
        entityLabel="Item"
        options={items.map((item) => ({
          value: item.id.toString(),
          label: item.name,
          description: item.sku ? `SKU ${item.sku}` : undefined
        }))}
        form={itemForm}
        disableSelection={Boolean(editingItemId)}
        primaryActionLabel={editingItemId ? "Save changes" : "Add item"}
        onClose={closeItemModal}
        onSubmit={submitSupplierItem}
        onChange={setItemForm}
      />

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("supplier-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}
