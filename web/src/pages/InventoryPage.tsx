import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

type InventoryItem = {
  id: number;
  name: string;
  reserved_qty: number;
  available_qty: number;
};

type ReservationDetail = {
  source_type: string;
  source_id: number;
  source_label: string;
  qty_reserved: number;
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

/* ---------- Reservation popover ---------- */

function ReservedCell({ itemId, reservedQty }: { itemId: number; reservedQty: number }) {
  const [open, setOpen] = useState(false);
  const [reservations, setReservations] = useState<ReservationDetail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleClick = async () => {
    if (reservedQty <= 0) return;
    setOpen((prev) => !prev);
    if (reservations !== null) return; // already loaded
    setLoading(true);
    try {
      const data = await apiFetch<ReservationDetail[]>(`/inventory/reservations/${itemId}`);
      setReservations(data);
    } catch {
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const sourceUrl = (r: ReservationDetail) => {
    if (r.source_type === "sales_request") return `/sales-requests/${r.source_id}`;
    if (r.source_type === "invoice") return `/invoices/${r.source_id}`;
    return null;
  };

  return (
    <td className="px-4 py-3 relative" ref={ref}>
      {reservedQty > 0 ? (
        <button
          type="button"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          onClick={handleClick}
        >
          {reservedQty.toFixed(2)}
        </button>
      ) : (
        <span>{reservedQty.toFixed(2)}</span>
      )}

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border bg-white shadow-lg">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted border-b">
            Reservations
          </div>
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted">Loading…</div>
          ) : !reservations || reservations.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted">No active reservations</div>
          ) : (
            <ul className="divide-y">
              {reservations.map((r, i) => {
                const url = sourceUrl(r);
                return (
                  <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    {url ? (
                      <Link to={url} className="font-medium text-primary hover:underline">
                        {r.source_label}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.source_label}</span>
                    )}
                    <span className="tabular-nums text-muted">{Number(r.qty_reserved).toFixed(2)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </td>
  );
}

/* ---------- Main component ---------- */

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<InventoryForm>(emptyForm);

  const loadData = async () => {
    try {
      const [inventoryData, itemData] = await Promise.all([
        apiFetch<InventoryRow[]>("/inventory"),
        apiFetch<InventoryItem[]>("/inventory/items")
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
              <th className="px-4 py-3">Reserved</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Landed Unit Cost</th>
              <th className="px-4 py-3">Total Value</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const matchedItem = items.find((item) => item.id === row.item_id);
              const reservedQty = Number(matchedItem?.reserved_qty ?? 0);
              return (
                <tr key={row.id} className="border-t border-muted/20">
                  <td className="px-4 py-3 font-medium">{row.item_name}</td>
                  <td className="px-4 py-3">{Number(row.quantity_on_hand).toFixed(2)}</td>
                  <ReservedCell itemId={row.item_id} reservedQty={reservedQty} />
                  <td className="px-4 py-3">{Number(matchedItem?.available_qty ?? row.quantity_on_hand).toFixed(2)}</td>
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
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
