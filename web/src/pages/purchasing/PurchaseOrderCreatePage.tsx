import { AlertTriangle, ArrowLeft, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch, createPurchaseOrder, PurchaseOrderPayload, sendPurchaseOrder } from "../../api";
import { formatCurrency } from "../../utils/formatters";

type Supplier = { id: number; name: string; email?: string | null; phone?: string | null; lead_time_days?: number | null };
type Item = { id: number; name: string; sku?: string | null; preferred_supplier_id?: number | null; preferred_landed_cost?: number | null };
type SupplierItem = {
  item_id: number;
  item_name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  default_unit_cost?: number | null;
};
type CreateLine = { item_id: string; quantity: string; unit_cost: string };
type InventoryPrefillLine = { item_id: number; quantity?: number; qty?: number };
type LocationState = { prefillLines?: InventoryPrefillLine[]; supplierId?: number | null };

const cardClass = "app-card space-y-4 p-5";
const emptyLine = (): CreateLine => ({ item_id: "", quantity: "1", unit_cost: "0" });

export default function PurchaseOrderCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [supplierItems, setSupplierItems] = useState<SupplierItem[]>([]);
  const [supplierItemsLoading, setSupplierItemsLoading] = useState(false);
  const [lineSearch, setLineSearch] = useState<Record<number, string>>({});
  const [supplierChangeWarning, setSupplierChangeWarning] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Quick Add Supplier
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");

  const [form, setForm] = useState({
    supplier_id: "",
    supplier_contact: "",
    supplier_email: "",
    expected_lead_time: "",
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: "",
    ship_to_location: "",
    notes: "",
    lines: [emptyLine()] as CreateLine[]
  });

  const loadCreateDependencies = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [supplierData, itemData] = await Promise.all([apiFetch<Supplier[]>("/suppliers"), apiFetch<Item[]>("/items-enriched")]);
      setSuppliers(supplierData);
      setItems(itemData);
    } catch (err) {
      setLoadError((err as Error).message || "Unable to load purchase order setup data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCreateDependencies();
  }, []);

  const createQuickSupplier = async () => {
    if (!quickAddForm.name.trim()) {
      setQuickAddError("Supplier name is required.");
      return;
    }
    setQuickAddSaving(true);
    setQuickAddError("");
    try {
      const created = await apiFetch<Supplier>("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: quickAddForm.name.trim(),
          email: quickAddForm.email.trim() || null,
          phone: quickAddForm.phone.trim() || null,
          address: quickAddForm.address.trim() || null,
        }),
      });
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, supplier_id: String(created.id) }));
      setQuickAddOpen(false);
      setQuickAddForm({ name: "", email: "", phone: "", address: "" });
    } catch (err) {
      setQuickAddError((err as Error).message || "Failed to create supplier.");
    } finally {
      setQuickAddSaving(false);
    }
  };

  useEffect(() => {
    if (!items.length) return;

    const prefill = state.prefillLines ?? [];
    if (!prefill.length) {
      if (state.supplierId) {
        setForm((prev) => ({ ...prev, supplier_id: String(state.supplierId) }));
      }
      return;
    }

    const mapped = prefill.map((line) => {
      const item = items.find((entry) => entry.id === line.item_id);
      const qty = line.qty ?? line.quantity ?? 1;
      return { item_id: String(line.item_id), quantity: String(Math.max(1, qty)), unit_cost: String(item?.preferred_landed_cost ?? 0) };
    });

    const preferredSupplier = state.supplierId
      ? String(state.supplierId)
      : (() => {
          const supplierIds = new Set(prefill.map((line) => items.find((entry) => entry.id === line.item_id)?.preferred_supplier_id).filter((value): value is number => typeof value === "number"));
          return supplierIds.size === 1 ? String(Array.from(supplierIds)[0]) : "";
        })();

    setForm((prev) => ({ ...prev, supplier_id: prev.supplier_id || preferredSupplier, lines: mapped.length ? mapped : prev.lines }));
  }, [items, state.prefillLines, state.supplierId]);

  useEffect(() => {
    if (!supplierChangeWarning) return;
    const timer = window.setTimeout(() => setSupplierChangeWarning(""), 4000);
    return () => window.clearTimeout(timer);
  }, [supplierChangeWarning]);

  useEffect(() => {
    if (!form.supplier_id) {
      setSupplierItems([]);
      setForm((prev) => ({ ...prev, supplier_contact: "", supplier_email: "", expected_lead_time: "" }));
      return;
    }

    const supplier = suppliers.find((entry) => entry.id === Number(form.supplier_id));
    if (supplier) {
      setForm((prev) => ({
        ...prev,
        supplier_contact: supplier.phone ?? "",
        supplier_email: supplier.email ?? "",
        expected_lead_time: supplier.lead_time_days != null ? String(supplier.lead_time_days) : prev.expected_lead_time
      }));
    }

    let cancelled = false;
    setSupplierItemsLoading(true);
    setSubmitError("");

    apiFetch<SupplierItem[]>(`/suppliers/${form.supplier_id}/items`)
      .then((data) => {
        if (cancelled) return;
        setSupplierItems(data);
        const allowed = new Set(data.map((item) => String(item.item_id)));
        let removedCount = 0;
        setForm((prev) => {
          const nextLines = prev.lines.map((line) => {
            if (!line.item_id || allowed.has(line.item_id)) return line;
            removedCount += 1;
            return { ...line, item_id: "", unit_cost: "0" };
          });
          return { ...prev, lines: nextLines };
        });
        if (removedCount > 0) {
          setSupplierChangeWarning("Item removed because it is not supplied by the selected supplier.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setSupplierItems([]);
        setSubmitError((err as Error).message || "Unable to load supplier items.");
      })
      .finally(() => {
        if (cancelled) return;
        setSupplierItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.supplier_id, suppliers]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!form.supplier_id) errors.push("Supplier is required.");
    if (!form.lines.length) errors.push("At least one line item is required.");
    form.lines.forEach((line, index) => {
      if (!line.item_id) errors.push(`Line ${index + 1}: Select an item.`);
      if (Number(line.quantity) <= 0) errors.push(`Line ${index + 1}: Qty must be greater than 0.`);
      if (Number(line.unit_cost) < 0) errors.push(`Line ${index + 1}: Unit cost cannot be negative.`);
    });
    return errors;
  }, [form]);

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0);
    return { subtotal, total: subtotal };
  }, [form.lines]);

  const setLine = (index: number, patch: Partial<CreateLine>) => {
    setForm((prev) => ({ ...prev, lines: prev.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)) }));
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));
  const removeLine = (index: number) => {
    setForm((prev) => {
      const nextLines = prev.lines.filter((_, lineIndex) => lineIndex !== index);
      return { ...prev, lines: nextLines.length ? nextLines : [emptyLine()] };
    });
  };

  const submit = async (mode: "draft" | "submit") => {
    if (validationErrors.length > 0) {
      setSubmitError(validationErrors[0]);
      return;
    }

    const payload: PurchaseOrderPayload = {
      supplier_id: Number(form.supplier_id),
      order_date: form.order_date,
      expected_date: form.expected_date || null,
      notes: [form.ship_to_location ? `Ship to: ${form.ship_to_location}` : "", form.notes].filter(Boolean).join("\n") || null,
      lines: form.lines.map((line) => ({ item_id: Number(line.item_id), quantity: Number(line.quantity), unit_cost: Number(line.unit_cost || 0) }))
    };

    setSubmitError("");
    if (mode === "draft") setSavingDraft(true);
    if (mode === "submit") setSubmitting(true);

    try {
      const created = await createPurchaseOrder<{ id: number }>(payload);
      if (mode === "submit") await sendPurchaseOrder(created.id);
      navigate("/purchasing/po-hub");
    } catch (err) {
      setSubmitError((err as Error).message || "Unable to save purchase order.");
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  const noSuppliers = !loading && !loadError && suppliers.length === 0;
  const noItems = !loading && !loadError && items.length === 0;
  const supplierSelected = Boolean(form.supplier_id);
  const hasMappedItems = supplierItems.length > 0;
  const supplierItemsEmpty = supplierSelected && !supplierItemsLoading && !hasMappedItems;

  return (
    <section className="space-y-6">
      {supplierChangeWarning ? (
        <div className="fixed right-4 top-4 z-50 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg">
          {supplierChangeWarning}
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground" onClick={() => navigate("/purchasing/po-hub")}>
            <ArrowLeft className="h-4 w-4" /> Back to Procurement Hub
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Purchasing</p>
          <h1 className="text-3xl font-semibold">Create Purchase Order</h1>
          <p className="text-muted">Create, send, and track supplier orders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="app-button-secondary" disabled={savingDraft || submitting || loading || noSuppliers || noItems || supplierItemsEmpty} onClick={() => void submit("draft")}>{savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Draft</button>
          <button className="app-button" disabled={savingDraft || submitting || loading || noSuppliers || noItems || supplierItemsEmpty} onClick={() => void submit("submit")}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit</button>
          <button className="app-button-ghost" onClick={() => navigate("/purchasing/po-hub")}>Cancel</button>
        </div>
      </header>

      {submitError ? <div className="app-card border-danger/30 bg-danger/5 p-3 text-sm text-danger"><AlertTriangle className="mr-2 inline h-4 w-4" />{submitError}</div> : null}

      {loadError ? (
        <section className="app-card space-y-3 p-6">
          <p className="text-lg font-semibold">We couldn’t load purchasing data</p>
          <p className="text-sm text-muted">{loadError}</p>
          <div className="flex gap-2">
            <button className="app-button" onClick={() => void loadCreateDependencies()}>Retry</button>
            <button className="app-button-ghost" onClick={() => navigate("/purchasing/po-hub")}>Back to Procurement Hub</button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <div className="app-card h-44 animate-pulse" />
          <div className="app-card h-44 animate-pulse" />
          <div className="app-card h-72 animate-pulse" />
        </div>
      ) : null}

      {!loading && !loadError && noSuppliers ? (
        <section className="app-card border-dashed p-10 text-center">
          <p className="text-lg font-semibold">No suppliers found</p>
          <p className="mt-1 text-sm text-muted">Add a supplier before creating a purchase order.</p>
          <Link className="app-button mt-4 inline-flex" to="/procurement/suppliers">Add Supplier</Link>
        </section>
      ) : null}

      {!loading && !loadError && !noSuppliers && noItems ? (
        <section className="app-card border-dashed p-10 text-center">
          <p className="text-lg font-semibold">No inventory items available</p>
          <p className="mt-1 text-sm text-muted">Create at least one inventory item to add purchase order lines.</p>
          <Link className="app-button mt-4 inline-flex" to="/sales/items">Add Item</Link>
        </section>
      ) : null}

      {/* Quick Add Supplier Overlay */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setQuickAddOpen(false)}>
          <div className="app-card w-full max-w-md space-y-5 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Quick Add</p>
                <h3 className="text-lg font-semibold">New Supplier</h3>
              </div>
              <button type="button" className="app-button-ghost" onClick={() => setQuickAddOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {quickAddError && <p className="text-sm text-danger">{quickAddError}</p>}
            <div className="space-y-3">
              <label className="block space-y-1 text-sm font-medium">
                Name <span className="text-danger">*</span>
                <input className="app-input w-full" value={quickAddForm.name} onChange={(e) => setQuickAddForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Supplier name" autoFocus />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Email
                <input className="app-input w-full" type="email" value={quickAddForm.email} onChange={(e) => setQuickAddForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@supplier.com" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm font-medium">
                  Phone
                  <input className="app-input w-full" value={quickAddForm.phone} onChange={(e) => setQuickAddForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone number" />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Address
                  <input className="app-input w-full" value={quickAddForm.address} onChange={(e) => setQuickAddForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Business address" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button type="button" className="app-button-secondary" onClick={() => setQuickAddOpen(false)}>Cancel</button>
              <button type="button" className="app-button" onClick={() => void createQuickSupplier()} disabled={quickAddSaving}>
                {quickAddSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {quickAddSaving ? "Creating..." : "Create Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !loadError && !noSuppliers && !noItems ? (
        <>
          <section className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Supplier</h2>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline" onClick={() => { setQuickAddOpen(true); setQuickAddError(""); setQuickAddForm({ name: "", email: "", phone: "", address: "" }); }}>
                <Plus className="h-3.5 w-3.5" /> Quick Add Supplier
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Supplier *
                <select className="app-select w-full" value={form.supplier_id} onChange={(event) => setForm((prev) => ({ ...prev, supplier_id: event.target.value }))}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium">Expected lead time (days)
                <input className="app-input w-full" value={form.expected_lead_time} onChange={(event) => setForm((prev) => ({ ...prev, expected_lead_time: event.target.value }))} placeholder="Optional" />
              </label>
              <label className="space-y-1 text-sm font-medium">Supplier contact
                <input className="app-input w-full" value={form.supplier_contact} onChange={(event) => setForm((prev) => ({ ...prev, supplier_contact: event.target.value }))} placeholder="Phone / contact" />
              </label>
              <label className="space-y-1 text-sm font-medium">Supplier email
                <input className="app-input w-full" type="email" value={form.supplier_email} onChange={(event) => setForm((prev) => ({ ...prev, supplier_email: event.target.value }))} placeholder="name@supplier.com" />
              </label>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold">Order Details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">PO date
                <input className="app-input w-full" type="date" value={form.order_date} onChange={(event) => setForm((prev) => ({ ...prev, order_date: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-medium">Expected delivery date
                <input className="app-input w-full" type="date" value={form.expected_date} onChange={(event) => setForm((prev) => ({ ...prev, expected_date: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-medium md:col-span-2">Ship-to location
                <input className="app-input w-full" value={form.ship_to_location} onChange={(event) => setForm((prev) => ({ ...prev, ship_to_location: event.target.value }))} placeholder="Warehouse / receiving location" />
              </label>
              <label className="space-y-1 text-sm font-medium md:col-span-2">Notes / terms
                <textarea className="app-input min-h-28 w-full" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Payment terms, shipping notes, or special instructions" />
              </label>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Line Items</h2>
              <button className="app-button-secondary" onClick={addLine}><Plus className="h-4 w-4" /> Add another line</button>
            </div>

            {!supplierSelected ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">Select supplier first.</div>
            ) : null}

            {supplierSelected && supplierItemsLoading ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">Loading supplier items…</div>
            ) : null}

            {supplierItemsEmpty ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center">
                <p className="text-lg font-semibold">No items are linked to this supplier yet.</p>
                <p className="mt-1 text-sm text-muted">Link supplier-item mappings before creating a PO for this supplier.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Link className="app-button inline-flex" to="/procurement/suppliers">Link items to supplier</Link>
                  <button className="app-button-ghost" onClick={() => setForm((prev) => ({ ...prev, supplier_id: "" }))}>Change supplier</button>
                </div>
              </div>
            ) : null}

            {supplierSelected && !supplierItemsLoading && hasMappedItems ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2">Unit cost</th><th className="py-2">Line total</th><th className="py-2" /></tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line, index) => {
                      const lineTotal = Number(line.quantity || 0) * Number(line.unit_cost || 0);
                      const query = (lineSearch[index] ?? "").toLowerCase();
                      const filteredItems = supplierItems.filter((item) => {
                        const option = `${item.item_name} ${item.sku ?? ""} ${item.supplier_sku ?? ""}`.toLowerCase();
                        return option.includes(query);
                      });

                      return (
                        <tr key={`line-${index}`} className="border-t border-border/50 align-top">
                          <td className="py-2 pr-2">
                            <input
                              className="app-input mb-2 w-full"
                              placeholder="Search items"
                              value={lineSearch[index] ?? ""}
                              onChange={(event) => setLineSearch((prev) => ({ ...prev, [index]: event.target.value }))}
                            />
                            <select
                              className="app-select w-full"
                              disabled={!supplierSelected}
                              value={line.item_id}
                              onChange={(event) => {
                                const selectedId = Number(event.target.value);
                                const selectedItem = supplierItems.find((item) => item.item_id === selectedId);
                                setLine(index, {
                                  item_id: event.target.value,
                                  unit_cost: selectedItem?.default_unit_cost != null ? String(selectedItem.default_unit_cost) : line.unit_cost
                                });
                              }}
                            >
                              <option value="">Select item</option>
                              {filteredItems.map((item) => (
                                <option key={item.item_id} value={item.item_id}>
                                  {item.item_name}
                                  {item.sku ? ` (${item.sku})` : ""}
                                  {item.supplier_sku ? ` • Supplier SKU: ${item.supplier_sku}` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2"><input className="app-input w-24" type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} /></td>
                          <td className="py-2 pr-2"><input className="app-input w-32" type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => setLine(index, { unit_cost: event.target.value })} /></td>
                          <td className="py-2 font-medium">{formatCurrency(lineTotal)}</td>
                          <td className="py-2 text-right"><button className="app-button-ghost" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex justify-end border-t border-border/50 pt-3 text-sm">
              <div className="space-y-1 text-right">
                <p className="text-muted">Subtotal: <span className="font-semibold text-foreground">{formatCurrency(totals.subtotal)}</span></p>
                <p className="text-base font-semibold">Total: {formatCurrency(totals.total)}</p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
