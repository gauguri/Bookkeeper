import { useMemo, useState } from "react";
import { apiFetch, type ApiRequestError } from "../api";
import CustomerInsightsPanel from "./CustomerInsightsPanel";

type Customer = { id: number; name: string };
type Item = { id: number; name: string; unit_price: number };
type InventoryAvailabilityResponse = { item_id: number; available_qty: number };
type PricingContextResponse = {
  item_id: number;
  landed_unit_cost: number;
  available_qty: number;
  recommended_price: number;
  margin_threshold_percent: number;
  mwb_price: number | null;
  mwb_source_level?: string;
  mwb_confidence?: string;
  mwb_explanation?: MWBExplanation;
  mwb_loading?: boolean;
};

type MWBExplanation = {
  source_level?: string;
  observation_count?: number;
  quantiles?: Record<string, string>;
  candidates?: Array<{ unit_price: string; acceptance_probability: number; expected_revenue: string }>;
  warnings?: string[];
};

type MWBResponse = {
  unit_price: number | string;
  source_level: string;
  confidence: string;
  explanation: MWBExplanation;
};

type LineItemForm = {
  item_id: number | "";
  quantity: string;
  unit_price: string;
  available_qty: number | null;
  quantity_error: string;
  availability_loading: boolean;
  landed_unit_cost: number | null;
  recommended_price: number | null;
  margin_threshold_percent: number;
  mwb_price: number | null;
  mwb_source_level?: string;
  mwb_confidence?: string;
  mwb_explanation?: MWBExplanation;
  mwb_loading?: boolean;
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
  availability_loading: false,
  landed_unit_cost: null,
  recommended_price: null,
  margin_threshold_percent: 20,
  mwb_price: null
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
  availability_loading: false,
  landed_unit_cost: null,
  recommended_price: null,
  margin_threshold_percent: 20,
  mwb_price: null
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
  const [mwbDrawerOpen, setMwbDrawerOpen] = useState(false);
  const [activeMwb, setActiveMwb] = useState<{ lineIndex: number; price: number; sourceLevel: string; confidence: string; explanation: MWBExplanation } | null>(null);
  const [mwbNotice, setMwbNotice] = useState("");

  const isWalkIn = customerId === "WALK_IN";
  const isEdit = mode === "edit";
  const selectedCustomerId = !isWalkIn && customerId ? Number(customerId) : null;

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

  const fetchPricingContextForLine = async (index: number, itemId: number) => {
    try {
      const customerIdParam = !isWalkIn && customerId ? `?customer_id=${customerId}` : "";
      const pricingContext = await apiFetch<PricingContextResponse>(`/items/${itemId}/pricing-context${customerIdParam}`);
      updateLine(index, {
        landed_unit_cost: Number(pricingContext.landed_unit_cost),
        recommended_price: Number(pricingContext.recommended_price),
        margin_threshold_percent: Number(pricingContext.margin_threshold_percent),
        available_qty: Number(pricingContext.available_qty),
        ...(Number(lines[index]?.unit_price || 0) <= 0 ? { unit_price: String(pricingContext.recommended_price) } : {})
      });
    } catch {
      setError("Unable to load landed-cost pricing context for the selected item.");
    }
  };

  const fetchMWBForLine = async (index: number, apply = true) => {
    const line = lines[index];
    if (!line || !selectedCustomerId || typeof line.item_id !== "number" || Number(line.quantity) <= 0) {
      return;
    }

    updateLine(index, { mwb_loading: true });
    try {
      const response = await apiFetch<MWBResponse>(`/pricing/mwb?customer_id=${selectedCustomerId}&item_id=${line.item_id}&qty=${Number(line.quantity)}`);
      const mwbPrice = Number(response.unit_price);
      updateLine(index, {
        mwb_loading: false,
        mwb_price: Number.isFinite(mwbPrice) ? mwbPrice : null,
        mwb_source_level: response.source_level,
        mwb_confidence: response.confidence,
        mwb_explanation: response.explanation
      });
      if (apply && Number.isFinite(mwbPrice)) {
        updateLine(index, { unit_price: String(mwbPrice) });
        setMwbNotice(`MWB applied: $${mwbPrice.toFixed(2)}. Click to view calculation.`);
      }
      if (Number.isFinite(mwbPrice)) {
        setActiveMwb({
          lineIndex: index,
          price: mwbPrice,
          sourceLevel: response.source_level,
          confidence: response.confidence,
          explanation: response.explanation
        });
        setMwbDrawerOpen(true);
      }
    } catch {
      updateLine(index, { mwb_loading: false });
      setError("Unable to load MWB pricing for this line item.");
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
            status: "NEW",
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section className="app-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{isEdit ? "Update Sales Request" : "New Sales Request"}</h3>
        <span className="app-badge border-primary/30 bg-primary/10 text-primary">Internal entry</span>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {mwbNotice ? <p className="text-sm text-success">{mwbNotice}</p> : null}
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
                  void fetchPricingContextForLine(index, itemId);
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
            <div className="flex items-center gap-2">
              {selectedCustomerId && typeof line.item_id === "number" && Number(line.quantity) > 0 ? (
                <button
                  className="text-xs text-primary underline"
                  type="button"
                  onClick={() => void fetchMWBForLine(index, true)}
                  disabled={line.mwb_loading}
                >
                  {line.mwb_loading ? "Calculating MWB..." : `MWB${line.mwb_price ? `: $${line.mwb_price.toFixed(2)}` : ""}`}
                </button>
              ) : (
                <span className="text-xs text-muted">MWB available after customer + item + qty</span>
              )}
              {line.mwb_price ? (
                <button className="text-xs text-muted underline" type="button" onClick={() => {
                  setActiveMwb({ lineIndex: index, price: line.mwb_price as number, sourceLevel: line.mwb_source_level || "", confidence: line.mwb_confidence || "Low", explanation: line.mwb_explanation || {} });
                  setMwbDrawerOpen(true);
                }}>
                  How calculated
                </button>
              ) : null}
            </div>
            <button
              className="app-button-ghost text-danger"
              type="button"
              onClick={() => removeLine(index)}
              disabled={lines.length === 1}
            >
              Remove
            </button>
            <div className="text-xs text-muted md:col-span-4">
              <div>
                Landed unit cost: {line.landed_unit_cost !== null ? `$${line.landed_unit_cost.toFixed(2)}` : "—"} • Suggested sell:
                {line.recommended_price !== null ? ` $${line.recommended_price.toFixed(2)}` : " —"}
              </div>
              {line.landed_unit_cost !== null ? (() => {
                const sellPrice = Number(line.unit_price || 0);
                const qty = Number(line.quantity || 0);
                const marginPerUnit = sellPrice - line.landed_unit_cost;
                const marginDollars = marginPerUnit * qty;
                const marginPercent = sellPrice > 0 ? (marginPerUnit / sellPrice) * 100 : 0;
                return (
                  <div className={marginPercent < line.margin_threshold_percent ? "text-danger" : ""}>
                    Margin: ${marginDollars.toFixed(2)} ({marginPercent.toFixed(1)}%)
                    {marginPercent < line.margin_threshold_percent
                      ? ` • Below threshold (${line.margin_threshold_percent.toFixed(0)}%)`
                      : ""}
                  </div>
                );
              })() : null}
            </div>
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
      <CustomerInsightsPanel customerId={selectedCustomerId} />

      {mwbDrawerOpen && activeMwb ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">MWB Calculation</h3>
              <button className="app-button-ghost" type="button" onClick={() => setMwbDrawerOpen(false)}>Close</button>
            </div>
            <p className="text-sm">MWB price: <strong>${activeMwb.price.toFixed(2)}</strong></p>
            <p className="text-xs text-muted">Source: {activeMwb.sourceLevel} · Confidence: {activeMwb.confidence}</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-medium">Quantiles</p>
              <pre className="overflow-x-auto rounded bg-surface p-3 text-xs">{JSON.stringify(activeMwb.explanation.quantiles ?? {}, null, 2)}</pre>
              <p className="font-medium">Candidates</p>
              <pre className="overflow-x-auto rounded bg-surface p-3 text-xs">{JSON.stringify(activeMwb.explanation.candidates ?? [], null, 2)}</pre>
              {(activeMwb.explanation.warnings?.length ?? 0) > 0 ? (
                <div>
                  <p className="font-medium">Warnings</p>
                  <ul className="list-disc pl-5 text-xs text-warning">{activeMwb.explanation.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
