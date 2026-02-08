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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

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

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <td colSpan={5} className="py-10 text-center text-muted">
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

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("item-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}
