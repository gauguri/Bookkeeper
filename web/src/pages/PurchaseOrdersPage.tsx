import { useEffect, useMemo, useState } from "react";
import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  PurchaseOrderPayload,
  sendPurchaseOrder,
  updatePurchaseOrder,
  apiFetch
} from "../api";

type Supplier = {
  id: number;
  name: string;
};

type Item = {
  id: number;
  name: string;
};

type PurchaseOrderListRow = {
  id: number;
  po_number: string;
  supplier_name: string;
  order_date: string;
  status: string;
  total: number;
};

type PurchaseOrderDetailLine = {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
};

type PurchaseOrderDetail = {
  id: number;
  po_number: string;
  supplier_id: number;
  order_date: string;
  expected_date?: string | null;
  notes?: string | null;
  status: string;
  lines: PurchaseOrderDetailLine[];
};

type FormLine = {
  item_id: string;
  quantity: string;
  unit_cost: string;
};

const today = new Date().toISOString().slice(0, 10);
const emptyLine = (): FormLine => ({ item_id: "", quantity: "1", unit_cost: "0" });

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(true);
  const [form, setForm] = useState({
    supplier_id: "",
    order_date: today,
    expected_date: "",
    notes: "",
    lines: [emptyLine()]
  });

  const loadData = async () => {
    try {
      const [poData, supplierData, itemData] = await Promise.all([
        listPurchaseOrders<PurchaseOrderListRow[]>(),
        apiFetch<Supplier[]>("/suppliers"),
        apiFetch<Item[]>("/items")
      ]);
      setPurchaseOrders(poData);
      setSuppliers(supplierData);
      setItems(itemData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormOpen(false);
    setForm({ supplier_id: "", order_date: today, expected_date: "", notes: "", lines: [emptyLine()] });
  };

  const subtotal = useMemo(
    () =>
      form.lines.reduce((sum, line) => {
        const quantity = Number(line.quantity || 0);
        const unitCost = Number(line.unit_cost || 0);
        return sum + quantity * unitCost;
      }, 0),
    [form.lines]
  );

  const submit = async () => {
    if (!form.supplier_id) {
      setError("Supplier is required.");
      return;
    }
    if (!form.lines.length || form.lines.some((line) => !line.item_id || Number(line.quantity) <= 0)) {
      setError("At least one valid line item is required.");
      return;
    }

    const payload: PurchaseOrderPayload = {
      supplier_id: Number(form.supplier_id),
      order_date: form.order_date,
      expected_date: form.expected_date || null,
      notes: form.notes || null,
      lines: form.lines.map((line) => ({
        item_id: Number(line.item_id),
        quantity: Number(line.quantity),
        unit_cost: Number(line.unit_cost || 0)
      }))
    };

    setError("");
    try {
      if (editingId) {
        await updatePurchaseOrder<PurchaseOrderDetail>(editingId, payload);
      } else {
        await createPurchaseOrder<PurchaseOrderDetail>(payload);
      }
      await loadData();
      resetForm();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startCreate = () => {
    setError("");
    setFormOpen(true);
    setEditingId(null);
    setForm({ supplier_id: "", order_date: today, expected_date: "", notes: "", lines: [emptyLine()] });
  };

  const startEdit = async (poId: number) => {
    setError("");
    try {
      const po = await getPurchaseOrder<PurchaseOrderDetail>(poId);
      setEditingId(po.id);
      setFormOpen(true);
      setForm({
        supplier_id: String(po.supplier_id),
        order_date: po.order_date,
        expected_date: po.expected_date ?? "",
        notes: po.notes ?? "",
        lines: po.lines.map((line) => ({
          item_id: String(line.item_id),
          quantity: String(line.quantity),
          unit_cost: String(line.unit_cost)
        }))
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const send = async (poId: number) => {
    setError("");
    try {
      await sendPurchaseOrder(poId);
      setPurchaseOrders((prev) => prev.map((po) => (po.id === poId ? { ...po, status: "SENT" } : po)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateLine = (index: number, key: keyof FormLine, value: string) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [key]: value } : line))
    }));
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));
  const removeLine = (index: number) => {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }));
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Purchase Orders</h2>
          <p className="text-sm text-muted">Create, edit, and send supplier purchase orders.</p>
        </div>
        <button className="app-button" onClick={startCreate}>Create Purchase Order</button>
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      {formOpen ? (
        <section className="app-card space-y-4">
          <h3 className="text-lg font-semibold">{editingId ? "Edit Purchase Order" : "New Purchase Order"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Supplier</span>
              <select
                className="app-input"
                value={form.supplier_id}
                onChange={(event) => setForm((prev) => ({ ...prev, supplier_id: event.target.value }))}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Order date</span>
              <input
                className="app-input"
                type="date"
                value={form.order_date}
                onChange={(event) => setForm((prev) => ({ ...prev, order_date: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Expected date</span>
              <input
                className="app-input"
                type="date"
                value={form.expected_date}
                onChange={(event) => setForm((prev) => ({ ...prev, expected_date: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Notes</span>
              <textarea
                className="app-input min-h-20"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>

          <div className="space-y-3">
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-muted/30 p-3 md:grid-cols-12">
                <select
                  className="app-input md:col-span-5"
                  value={line.item_id}
                  onChange={(event) => updateLine(index, "item_id", event.target.value)}
                >
                  <option value="">Select item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  className="app-input md:col-span-2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, "quantity", event.target.value)}
                  placeholder="Qty"
                />
                <input
                  className="app-input md:col-span-2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_cost}
                  onChange={(event) => updateLine(index, "unit_cost", event.target.value)}
                  placeholder="Unit cost"
                />
                <p className="flex items-center text-sm md:col-span-2">
                  ${(Number(line.quantity || 0) * Number(line.unit_cost || 0)).toFixed(2)}
                </p>
                <button
                  className="app-button-secondary md:col-span-1"
                  onClick={() => removeLine(index)}
                  disabled={form.lines.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button className="app-button-secondary" onClick={addLine}>
              Add line item
            </button>
            <p className="text-sm font-semibold">Subtotal: ${subtotal.toFixed(2)}</p>
          </div>

          <div className="flex gap-2">
            <button className="app-button-primary" onClick={submit}>{editingId ? "Save" : "Submit"}</button>
            <button className="app-button-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </section>
      ) : null}

      <section className="app-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">PO Number</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => (
              <tr key={po.id} className="border-t border-muted/20">
                <td className="px-4 py-3">{po.po_number}</td>
                <td className="px-4 py-3">{po.supplier_name}</td>
                <td className="px-4 py-3">{po.order_date}</td>
                <td className="px-4 py-3">{po.status}</td>
                <td className="px-4 py-3">${Number(po.total).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="app-button-secondary"
                      onClick={() => startEdit(po.id)}
                      disabled={po.status !== "DRAFT"}
                    >
                      Edit
                    </button>
                    <button
                      className="app-button-primary"
                      onClick={() => send(po.id)}
                      disabled={po.status === "SENT"}
                    >
                      Send
                    </button>
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
