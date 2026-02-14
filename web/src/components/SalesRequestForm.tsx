import { useMemo, useState } from "react";
import { apiFetch, type ApiRequestError } from "../api";

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };
type InventoryAvailabilityResponse = { item_id: number; available_qty: number };

type LineItemForm = {
  item_id: number | "";
  quantity: string;
  unit_price: string;
  available_qty: number | null;
  quantity_error: string;
  availability_loading: boolean;
};

type InitialValues = {
  customer_id: number | null;
  customer_name: string | null;
  notes: string | null;
  requested_fulfillment_date: string | null;
  lines: Array<{ item_id: number; quantity: number; unit_price: number; available_qty?: number | null }>;
};

type Props = {
  customers: Customer[];
  items: Item[];
  createdByUserId?: number;
  onCreated?: () => void;
  onSaved?: () => void;
  onCancel: () => void;
  mode?: "create" | "edit";
  salesRequestId?: number;
  initialValues?: InitialValues;
};

const emptyLine: LineItemForm = {
  item_id: "",
  quantity: "1",
  unit_price: "0",
  available_qty: null,
  quantity_error: "",
  availability_loading: false
};

const getQuantityValidationError = (quantity: string, availableQty: number | null) => {
  const quantityValue = Number(quantity);
  if (Number.isNaN(quantityValue) || quantityValue <= 0) {
    return "Quantity must be greater than 0.";
  }
  if (availableQty !== null && quantityValue > availableQty) {
    return `Quantity exceeds available inventory (${availableQty}).`;
  }
  return "";
};

const mapInitialLine = (line: InitialValues["lines"][number]): LineItemForm => ({
  item_id: line.item_id,
  quantity: String(line.quantity),
  unit_price: String(line.unit_price),
  available_qty: line.available_qty ?? null,
  quantity_error: getQuantityValidationError(String(line.quantity), line.available_qty ?? null),
  availability_loading: false
});

export default function SalesRequestForm({
  customers,
  items,
  createdByUserId,
  onCreated,
  onSaved,
  onCancel,
  mode = "create",
  salesRequestId,
  initialValues
}: Props) {
  const [customerId, setCustomerId] = useState<string>(() => {
    if (!initialValues) return "";
    if (initialValues.customer_id) return String(initialValues.customer_id);
    if (initialValues.customer_name) return "WALK_IN";
    return "";
  });
  const [walkInName, setWalkInName] = useState(initialValues?.customer_name ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [requestedFulfillmentDate, setRequestedFulfillmentDate] = useState(initialValues?.requested_fulfillment_date ?? "");
  const [lines, setLines] = useState<LineItemForm[]>(() =>
    initialValues?.lines?.length ? initialValues.lines.map(mapInitialLine) : [{ ...emptyLine }]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isWalkIn = customerId === "WALK_IN";
  const isEdit = mode === "edit";

  const hasLineErrors = useMemo(() => lines.some((line) => Boolean(line.quantity_error)), [lines]);

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

      merged.quantity_error = getQuantityValidationError(merged.quantity, merged.available_qty);
      next[index] = merged;
      return next;
    });
  };

  const fetchAvailabilityForLine = async (index: number, itemId: number) => {
    updateLine(index, { availability_loading: true, available_qty: null, quantity_error: "" });
    try {
      const availability = await apiFetch<InventoryAvailabilityResponse>(`/inventory/available?item_id=${itemId}`);
      updateLine(index, {
        available_qty: Number(availability.available_qty),
        availability_loading: false
      });
    } catch {
      updateLine(index, { availability_loading: false, available_qty: null });
      setError("Unable to load real-time inventory for the selected item.");
    }
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index));

  const resetForm = () => {
    setCustomerId("");
    setWalkInName("");
    setNotes("");
    setRequestedFulfillmentDate("");
    setLines([{ ...emptyLine }]);
    setError("");
  };

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
      if (!line.item_id && line.item_id !== 0) {
        setError("Please select an item for each line.");
        return;
      }
      if (line.quantity_error) {
        setError(line.quantity_error);
        return;
      }
      if (Number(line.unit_price) < 0 || Number.isNaN(Number(line.unit_price))) {
        setError("Unit price cannot be negative.");
        return;
      }
      if (line.available_qty !== null && Number(line.quantity) > line.available_qty) {
        const itemName = items.find((entry) => entry.id === line.item_id)?.name ?? "item";
        setError(`Quantity exceeds available inventory for ${itemName}.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (isEdit && salesRequestId) {
        await apiFetch(`/sales-requests/${salesRequestId}`, {
          method: "PUT",
          body: JSON.stringify({
            customer_id: isWalkIn ? null : Number(customerId),
            customer_name: isWalkIn ? walkInName.trim() : null,
            notes: notes.trim() || null,
            requested_fulfillment_date: requestedFulfillmentDate || null,
            line_items: lines.map((line) => ({
              item_id: Number(line.item_id),
              quantity: Number(line.quantity),
              requested_price: Number(line.unit_price)
            }))
          })
        });
        onSaved?.();
      } else {
        await apiFetch("/sales-requests", {
          method: "POST",
          body: JSON.stringify({
            customer_id: isWalkIn ? null : Number(customerId),
            customer_name: isWalkIn ? walkInName.trim() : null,
            notes: notes.trim() || null,
            requested_fulfillment_date: requestedFulfillmentDate || null,
            status: "OPEN",
            created_by_user_id: createdByUserId ?? null,
            lines: lines.map((line) => ({
              item_id: Number(line.item_id),
              quantity: Number(line.quantity),
              unit_price: Number(line.unit_price)
            }))
          })
        });
        resetForm();
        onCreated?.();
      }
    } catch (err) {
      const requestError = err as ApiRequestError;
      if (requestError.status === 409) {
        setError(requestError.message);
      } else {
        setError(requestError.message || (isEdit ? "Unable to update sales request." : "Unable to create sales request."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="app-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{isEdit ? "Update Sales Request" : "New Sales Request"}</h3>
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
              onChange={(event) => {
                const val = event.target.value;
                const itemId = val ? Number(val) : "";
                updateLine(index, { item_id: itemId, available_qty: null, quantity_error: "" });
                if (typeof itemId === "number") {
                  void fetchAvailabilityForLine(index, itemId);
                }
              }}
            >
              <option value="">Select item *</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div>
              <input
                className="app-input"
                type="number"
                min="0.01"
                max={line.available_qty ?? undefined}
                step="0.01"
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
                placeholder="Quantity"
              />
              <p className="mt-1 text-xs text-muted">
                {line.availability_loading
                  ? "Loading availability..."
                  : line.available_qty !== null
                    ? `Available: ${line.available_qty} • Max: ${line.available_qty}`
                    : "Available: —"}
              </p>
              {line.quantity_error ? <p className="mt-1 text-xs text-danger">{line.quantity_error}</p> : null}
            </div>
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
          <button className="app-button" onClick={handleSubmit} disabled={saving || hasLineErrors} type="button">
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create sales request"}
          </button>
        </div>
      </div>
    </section>
  );
}
