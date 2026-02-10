import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

type InventoryItem = {
  id: number;
  sku?: string | null;
  name: string;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  reorder_point?: number | null;
};

type AdjustmentForm = {
  item_id: string;
  qty_delta: string;
  reason: string;
};

const emptyAdjustment: AdjustmentForm = {
  item_id: "",
  qty_delta: "",
  reason: ""
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [adjustment, setAdjustment] = useState<AdjustmentForm>(emptyAdjustment);

  const filtered = useMemo(() => {
    if (!search) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  const loadItems = async () => {
    try {
      const data = await apiFetch<InventoryItem[]>(
        `/inventory/items?search=${encodeURIComponent(search)}`
      );
      setItems(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAdjustment = async () => {
    if (!adjustment.item_id || !adjustment.qty_delta) {
      setError("Select an item and enter a quantity adjustment.");
      return;
    }
    setError("");
    try {
      await apiFetch("/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          item_id: Number(adjustment.item_id),
          qty_delta: Number(adjustment.qty_delta),
          reason: adjustment.reason || null
        })
      });
      setAdjustment(emptyAdjustment);
      loadItems();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Inventory Dashboard</h2>
          <p className="text-sm text-muted">
            Track on-hand stock, reservations, and availability in real time.
          </p>
        </div>
        <input
          className="app-input w-full max-w-xs"
          placeholder="Search items"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <section className="app-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3">Reserved</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Reorder point</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-muted/20">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-muted">{item.sku || "—"}</td>
                  <td className="px-4 py-3">{item.on_hand_qty}</td>
                  <td className="px-4 py-3">{item.reserved_qty}</td>
                  <td className="px-4 py-3 font-semibold">{item.available_qty}</td>
                  <td className="px-4 py-3 text-muted">{item.reorder_point ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-card space-y-4">
        <h3 className="text-lg font-semibold">Adjust inventory</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold uppercase text-muted">Item</label>
            <select
              className="app-input mt-2 w-full"
              value={adjustment.item_id}
              onChange={(event) =>
                setAdjustment((prev) => ({ ...prev, item_id: event.target.value }))
              }
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
            <label className="text-xs font-semibold uppercase text-muted">Qty delta</label>
            <input
              className="app-input mt-2 w-full"
              type="number"
              value={adjustment.qty_delta}
              onChange={(event) =>
                setAdjustment((prev) => ({ ...prev, qty_delta: event.target.value }))
              }
              placeholder="e.g. 5 or -2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted">Reason</label>
            <input
              className="app-input mt-2 w-full"
              value={adjustment.reason}
              onChange={(event) =>
                setAdjustment((prev) => ({ ...prev, reason: event.target.value }))
              }
              placeholder="Optional note"
            />
          </div>
        </div>
        <button className="app-button-primary" onClick={submitAdjustment}>
          Post adjustment
        </button>
      </section>
    </div>
  );
}
