import { useEffect, useMemo, useState } from "react";
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
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Items</h1>
        <p className="text-slate-600">Manage your product and service catalog.</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <input
              className="border border-slate-300 rounded px-3 py-2 text-sm"
              placeholder="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="bg-slate-900 text-white rounded px-3 py-2 text-sm" onClick={loadItems}>
              Search
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th>SKU</th>
                <th>Unit price</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-2">{item.name}</td>
                  <td>{item.sku ?? "-"}</td>
                  <td>{currency(item.unit_price)}</td>
                  <td>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="text-right space-x-2">
                    <button className="text-slate-700 text-sm" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                    <button
                      className="text-rose-600 text-sm"
                      onClick={() => archiveItem(item.id)}
                      disabled={!item.is_active}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">{editingId ? "Edit item" : "New item"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Name *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="SKU"
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Unit price *"
            type="number"
            min="0"
            step="0.01"
            value={form.unit_price}
            onChange={(event) => setForm({ ...form, unit_price: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Income account ID"
            value={form.income_account_id}
            onChange={(event) => setForm({ ...form, income_account_id: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm md:col-span-2"
            placeholder="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
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
                className="border border-slate-300 rounded px-3 py-2 text-sm"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
            <button className="bg-slate-900 text-white rounded px-4 py-2 text-sm" onClick={handleSubmit}>
              {editingId ? "Save changes" : "Create item"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
