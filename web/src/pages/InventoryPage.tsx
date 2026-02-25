import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
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

type PopoverPosition = {
  top: number;
  left: number;
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

function ReservedCell({
  itemId,
  itemName,
  reservedQty,
}: {
  itemId: number;
  itemName: string;
  reservedQty: number;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reservations, setReservations] = useState<ReservationDetail[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 280;
      const height = 260;
      const gap = 8;
      const viewportPadding = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = rect.right + gap;
      let top = rect.top;

      if (left + width > viewportWidth - viewportPadding) {
        left = rect.left;
        top = rect.bottom + gap;
      }
      if (left + width > viewportWidth - viewportPadding) {
        left = Math.max(viewportPadding, viewportWidth - width - viewportPadding);
      }
      if (top + height > viewportHeight - viewportPadding) {
        top = Math.max(viewportPadding, viewportHeight - height - viewportPadding);
      }

      setPosition({ left, top });
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    popoverRef.current?.focus();

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
    }
  }, [open]);

  const handleClick = async () => {
    if (reservedQty <= 0) return;
    setOpen((prev) => !prev);
    if (reservations !== null) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiFetch<ReservationDetail[]>(`/inventory/reservations/${itemId}`);
      setReservations(data);
    } catch (err) {
      setLoadError((err as Error).message || "Could not load reservations.");
    } finally {
      setLoading(false);
    }
  };

  const sourceUrl = (r: ReservationDetail) => {
    if (r.source_type === "sales_request") return `/sales-requests/${r.source_id}`;
    if (r.source_type === "invoice") return `/invoices/${r.source_id}`;
    return null;
  };

  const openSource = (reservation: ReservationDetail) => {
    const url = sourceUrl(reservation);
    if (url) {
      setOpen(false);
      navigate(url);
    }
  };

  const openSalesRequestsFiltered = () => {
    setOpen(false);
    navigate(`/sales-requests?item_id=${itemId}&item_name=${encodeURIComponent(itemName)}`);
  };

  return (
    <td className="px-4 py-3">
      {reservedQty > 0 ? (
        <button
          ref={triggerRef}
          type="button"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          onClick={handleClick}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
        >
          {reservedQty.toFixed(2)}
        </button>
      ) : (
        <span>{reservedQty.toFixed(2)}</span>
      )}

      {open && position && createPortal(
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label="Reservations"
          tabIndex={-1}
          className="fixed z-40 w-[280px] rounded-xl border bg-white shadow-xl outline-none"
          style={{ left: `${position.left}px`, top: `${position.top}px` }}
        >
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted">
            RESERVATIONS
          </div>

          {loading ? (
            <div className="space-y-2 p-3">
              <div className="app-skeleton h-4 w-40" />
              <div className="app-skeleton h-4 w-52" />
              <div className="app-skeleton h-4 w-32" />
            </div>
          ) : loadError ? (
            <div className="px-3 py-4 text-xs text-rose-600">{loadError}</div>
          ) : !reservations || reservations.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted">No reservations.</div>
          ) : (
            <ul className="max-h-[240px] divide-y overflow-y-auto">
              {reservations.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => openSource(r)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--pl-hover)]"
                  >
                    <span className="font-medium">{r.source_label}</span>
                    <span className="tabular-nums text-muted">{Number(r.qty_reserved).toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end border-t px-3 py-2">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={openSalesRequestsFiltered}
            >
              View all
            </button>
          </div>
        </div>,
        document.body
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
                  <ReservedCell itemId={row.item_id} itemName={row.item_name} reservedQty={reservedQty} />
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
