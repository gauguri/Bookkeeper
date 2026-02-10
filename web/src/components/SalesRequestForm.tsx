import { useMemo, useState } from "react";
import { apiFetch } from "../api";

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };

type LineItemForm = {
  item_id: number | "";
  quantity: string;
  unit_price: string;
};

type Props = {
  customers: Customer[];
  items: Item[];
  createdByUserId?: number;
  onCreated: () => void;
  onCancel: () => void;
};

const emptyLine: LineItemForm = { item_id: "", quantity: "1", unit_price: "0" };

export default function SalesRequestForm({ customers, items, createdByUserId, onCreated, onCancel }: Props) {
  const [customerId, setCustomerId] = useState<string>("");
  const [walkInName, setWalkInName] = useState("");
  const [notes, setNotes] = useState("");
  const [requestedFulfillmentDate, setRequestedFulfillmentDate] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [lines, setLines] = useState<LineItemForm[]>([{ ...emptyLine }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isWalkIn = customerId === "WALK_IN";

  const lineTotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0),
    [lines]
  );

  const updateLine = (index: number, patch: Partial<LineItemForm>) => {
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      if (typeof patch.item_id === "number") {
        const item = items.find((entry) => entry.id === patch.item_id);
        if (item && (!patch.unit_price || patch.unit_price === "0")) {
          merged.unit_price = String(item.unit_price ?? 0);
        }
      }
      next[index] = merged;
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index));

  const handleSubmit = async () => {
    setError("");
    if (!customerId) {
      setError("Customer is required.");
      return;
    }
    if (isWalkIn && !walkInName.trim()) {
      setError("Walk-in customer name is required.");
      return;
    }
    if (lines.length < 1) {
      setError("Add at least one line item.");
      return;
    }
    for (const line of lines) {
      if (!line.item_id) {
        setError("Please select an item for each line.");
        return;
      }
      if (Number(line.quantity) <= 0) {
        setError("Quantity must be greater than 0.");
        return;
      }
      if (Number(line.unit_price) < 0) {
        setError("Unit price cannot be negative.");
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch("/sales-requests", {
        method: "POST",
        body: JSON.stringify({
          customer_id: isWalkIn ? null : Number(customerId),
          customer_name: isWalkIn ? walkInName.trim() : null,
          notes: notes.trim() || null,
          requested_fulfillment_date: requestedFulfillmentDate || null,
          status,
          created_by_user_id: createdByUserId ?? null,
          lines: lines.map((line) => ({
            item_id: Number(line.item_id),
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price)
          }))
        })
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message || "Unable to create sales request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="app-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Sales Request</h3>
        <span className="app-badge border-primary/30 bg-primary/10 text-primary">Internal entry</span>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <select className="app-input" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Select customer *</option>
          <option value="WALK_IN">Walk-in customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        {isWalkIn ? (
          <input
            className="app-input"
            value={walkInName}
            onChange={(event) => setWalkInName(event.target.value)}
            placeholder="Walk-in customer name *"
          />
        ) : null}
        <input
          className="app-input"
          type="date"
          value={requestedFulfillmentDate}
          onChange={(event) => setRequestedFulfillmentDate(event.target.value)}
        />
        <select className="app-input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Line items</p>
          <button className="app-button-secondary" onClick={addLine} type="button">
            Add line
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-4">
            <select
              className="app-input"
              value={line.item_id}
              onChange={(event) => updateLine(index, { item_id: Number(event.target.value) })}
            >
              <option value="">Select item *</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              className="app-input"
              type="number"
              min="0.01"
              step="0.01"
              value={line.quantity}
              onChange={(event) => updateLine(index, { quantity: event.target.value })}
              placeholder="Quantity"
            />
            <input
              className="app-input"
              type="number"
              min="0"
              step="0.01"
              value={line.unit_price}
              onChange={(event) => updateLine(index, { unit_price: event.target.value })}
              placeholder="Unit price"
            />
            <button
              className="app-button-ghost text-danger"
              type="button"
              onClick={() => removeLine(index)}
              disabled={lines.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <textarea
        className="app-input min-h-28"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Estimated total: ${lineTotal.toFixed(2)}</p>
        <div className="flex gap-2">
          <button className="app-button-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="app-button" onClick={handleSubmit} disabled={saving} type="button">
            {saving ? "Saving..." : "Create sales request"}
          </button>
        </div>
      </div>
    </section>
  );
}
