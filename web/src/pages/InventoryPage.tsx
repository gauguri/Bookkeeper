import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type InventoryRow = {
  id: number;
  item_id: number;
  item_name: string;
  item_sku?: string | null;
  quantity_on_hand: number;
  landed_unit_cost: number;
  total_value: number;
  last_updated_at: string;
};

type Item = {
  id: number;
  name: string;
};

type InventoryForm = {
  item_id: string;
  quantity_on_hand: string;
  landed_unit_cost: string;
};

const emptyForm: InventoryForm = {
  item_id: "",
  quantity_on_hand: "0",
  landed_unit_cost: "0"
};

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<InventoryForm>(emptyForm);

  const loadData = async () => {
    try {
      const [inventoryData, itemData] = await Promise.all([
        apiFetch<InventoryRow[]>("/inventory"),
        apiFetch<Item[]>("/items")
      ]);
      setRows(inventoryData);
      setItems(itemData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
  };

  const openEdit = (row: InventoryRow) => {
    setEditing(row);
    setForm({
      item_id: String(row.item_id),
      quantity_on_hand: String(row.quantity_on_hand),
      landed_unit_cost: String(row.landed_unit_cost)
    });
    setFormOpen(true);
    setError("");
  };

  const save = async () => {
    if (!form.item_id || Number(form.quantity_on_hand) < 0 || Number(form.landed_unit_cost) < 0) {
      setError("Item, quantity, and landed unit cost are required. Values must be 0 or greater.");
      return;
    }

    setError("");
    try {
      if (editing) {
        await apiFetch(`/inventory/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            quantity_on_hand: Number(form.quantity_on_hand),
            landed_unit_cost: Number(form.landed_unit_cost)
          })
        });
      } else {
        await apiFetch("/inventory", {
          method: "POST",
          body: JSON.stringify({
            item_id: Number(form.item_id),
            quantity_on_hand: Number(form.quantity_on_hand),
            landed_unit_cost: Number(form.landed_unit_cost)
          })
        });
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (row: InventoryRow) => {
    if (!window.confirm(`Delete inventory record for ${row.item_name}?`)) {
      return;
    }
    setError("");
    try {
      await apiFetch(`/inventory/${row.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Inventory</h2>
          <p className="text-sm text-muted">Real-time inventory levels and landed values.</p>
        </div>
        <button className="app-button" onClick={openCreate}>Add Inventory</button>
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      {formOpen ? (
        <section className="app-card space-y-4 p-6">
          <h3 className="text-lg font-semibold">{editing ? "Edit Inventory" : "Add Inventory"}</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted">Item</label>
              <select
                className="app-input mt-2 w-full"
                value={form.item_id}
                onChange={(event) => setForm((prev) => ({ ...prev, item_id: event.target.value }))}
                disabled={Boolean(editing)}
              >
                <option value="">Select item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted">Quantity</label>
              <input
                className="app-input mt-2 w-full"
                type="number"
                min="0"
                step="0.01"
                value={form.quantity_on_hand}
                onChange={(event) => setForm((prev) => ({ ...prev, quantity_on_hand: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted">Landed unit cost</label>
              <input
                className="app-input mt-2 w-full"
                type="number"
                min="0"
                step="0.01"
                value={form.landed_unit_cost}
                onChange={(event) => setForm((prev) => ({ ...prev, landed_unit_cost: event.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="app-button-primary" onClick={save}>Save</button>
            <button className="app-button-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
          </div>
        </section>
      ) : null}

      <section className="app-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Quantity On Hand</th>
              <th className="px-4 py-3">Landed Unit Cost</th>
              <th className="px-4 py-3">Total Value</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-muted/20">
                <td className="px-4 py-3 font-medium">{row.item_name}</td>
                <td className="px-4 py-3">{Number(row.quantity_on_hand).toFixed(2)}</td>
                <td className="px-4 py-3">${Number(row.landed_unit_cost).toFixed(2)}</td>
                <td className="px-4 py-3">${Number(row.total_value).toFixed(2)}</td>
                <td className="px-4 py-3">{new Date(row.last_updated_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="app-button-secondary" onClick={() => openEdit(row)}>Edit</button>
                    <button className="app-button-secondary" onClick={() => remove(row)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
