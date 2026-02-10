import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

type Customer = {
  id: number;
  name: string;
};

type Item = {
  id: number;
  name: string;
  on_hand_qty?: number;
  reserved_qty?: number;
  available_qty?: number;
};

type SupplierLink = {
  supplier_id: number;
  supplier_name: string;
  landed_cost: number;
  lead_time_days?: number | null;
  is_preferred: boolean;
};

type SalesRequestLine = {
  id: number;
  item_id: number;
  qty_requested: number;
  qty_reserved: number;
  status: string;
};

type SalesRequest = {
  id: number;
  status: string;
  customer_id?: number | null;
  lines: SalesRequestLine[];
};

type SalesRequestLineDraft = {
  item_id: string;
  qty_requested: string;
};

const emptyLine: SalesRequestLineDraft = { item_id: "", qty_requested: "" };

export default function SalesRequestsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState<SalesRequest[]>([]);
  const [lines, setLines] = useState<SalesRequestLineDraft[]>([{ ...emptyLine }]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [suppliersByItem, setSuppliersByItem] = useState<Record<number, SupplierLink[]>>({});
  const [supplierSelections, setSupplierSelections] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");

  const loadBase = async () => {
    try {
      const [customerData, itemData, requestData] = await Promise.all([
        apiFetch<Customer[]>("/customers"),
        apiFetch<Item[]>("/inventory/items"),
        apiFetch<SalesRequest[]>("/sales-requests")
      ]);
      setCustomers(customerData);
      setItems(itemData);
      setRequests(requestData);
      await Promise.all(requestData.map((request) => loadSuppliersForRequest(request)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  const createSalesRequest = async () => {
    if (!lines.some((line) => line.item_id && line.qty_requested)) {
      setError("Add at least one line with item and quantity.");
      return;
    }
    setError("");
    setMessage("");
    const payload = {
      customer_id: selectedCustomer ? Number(selectedCustomer) : null,
      notes: note || null,
      lines: lines
        .filter((line) => line.item_id && line.qty_requested)
        .map((line) => ({
          item_id: Number(line.item_id),
          qty_requested: Number(line.qty_requested)
        }))
    };
    try {
      const created = await apiFetch<SalesRequest>("/sales-requests", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const submitted = await apiFetch<SalesRequest>(`/sales-requests/${created.id}/submit`, {
        method: "POST"
      });
      setRequests((prev) => [submitted, ...prev]);
      setLines([{ ...emptyLine }]);
      setSelectedCustomer("");
      setNote("");
      await loadSuppliersForRequest(submitted);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadSuppliersForRequest = async (request: SalesRequest) => {
    const backordered = request.lines.filter((line) => line.status === "BACKORDERED");
    const supplierMap: Record<number, SupplierLink[]> = {};
    await Promise.all(
      backordered.map(async (line) => {
        const data = await apiFetch<SupplierLink[]>(`/items/${line.item_id}/suppliers`);
        supplierMap[line.item_id] = data;
      })
    );
    setSuppliersByItem((prev) => ({ ...prev, ...supplierMap }));
    setSupplierSelections((prev) => {
      const updates: Record<number, string> = { ...prev };
      backordered.forEach((line) => {
        const suppliers = supplierMap[line.item_id];
        const preferred = suppliers?.find((supplier) => supplier.is_preferred);
        if (!updates[line.id]) {
          updates[line.id] = preferred ? String(preferred.supplier_id) : suppliers?.[0]?.supplier_id?.toString() ?? "";
        }
      });
      return updates;
    });
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);

  const updateLine = (index: number, field: keyof SalesRequestLineDraft, value: string) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)));
  };

  const availableForItem = (itemId: string) => {
    const match = items.find((item) => item.id === Number(itemId));
    if (!match) {
      return "—";
    }
    return match.available_qty ?? "—";
  };

  const createPurchaseOrder = async (request: SalesRequest, line: SalesRequestLine) => {
    const supplierId = supplierSelections[line.id];
    if (!supplierId) {
      setError("Select a supplier before creating a purchase order.");
      return;
    }
    const shortfall = line.qty_requested - line.qty_reserved;
    try {
      await apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(supplierId),
          order_date: new Date().toISOString().split("T")[0],
          lines: [{ item_id: line.item_id, qty_ordered: shortfall }]
        })
      });
      setMessage(`Purchase order created for sales request #${request.id}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const requestSummary = useMemo(() => requests.slice(0, 5), [requests]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Incoming Sales Requests</h2>
        <p className="text-sm text-muted">
          Capture demand, allocate inventory, and raise purchase orders for shortfalls.
        </p>
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-500">{message}</p> : null}

      <section className="app-card space-y-4">
        <h3 className="text-lg font-semibold">Create request</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase text-muted">Customer</label>
            <select
              className="app-input mt-2 w-full"
              value={selectedCustomer}
              onChange={(event) => setSelectedCustomer(event.target.value)}
            >
              <option value="">No customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase text-muted">Notes</label>
            <input
              className="app-input mt-2 w-full"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional notes or request context"
            />
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={`line-${index}`} className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold uppercase text-muted">Item</label>
                <select
                  className="app-input mt-2 w-full"
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
                <p className="mt-1 text-xs text-muted">Available: {availableForItem(line.item_id)}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted">Qty requested</label>
                <input
                  className="app-input mt-2 w-full"
                  type="number"
                  value={line.qty_requested}
                  onChange={(event) => updateLine(index, "qty_requested", event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex items-end">
                <button className="app-button-ghost mt-2" onClick={addLine}>
                  + Add another line
                </button>
              </div>
            </div>
          ))}
        </div>

        <button className="app-button-primary" onClick={createSalesRequest}>
          Submit request
        </button>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Recent requests</h3>
        {requestSummary.map((request) => (
          <div key={request.id} className="app-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Request #{request.id}</p>
                <p className="font-semibold">Status: {request.status}</p>
              </div>
              <span className="app-badge border-primary/30 bg-primary/10 text-primary">
                {request.lines.length} lines
              </span>
            </div>
            <div className="space-y-3">
              {request.lines.map((line) => {
                const suppliers = suppliersByItem[line.item_id] ?? [];
                const shortfall = line.qty_requested - line.qty_reserved;
                return (
                  <div key={line.id} className="rounded-xl border border-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-muted">Item #{line.item_id}</p>
                        <p className="font-semibold">
                          {line.status === "ALLOCATED" ? "In stock" : "Insufficient stock"}
                        </p>
                      </div>
                      <div className="text-sm text-muted">
                        Requested {line.qty_requested} • Reserved {line.qty_reserved}
                      </div>
                    </div>
                    {line.status === "BACKORDERED" ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-sm text-muted">Shortfall: {shortfall}</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-semibold uppercase text-muted">Supplier</label>
                            <select
                              className="app-input mt-2 w-full"
                              value={supplierSelections[line.id] ?? ""}
                              onChange={(event) =>
                                setSupplierSelections((prev) => ({
                                  ...prev,
                                  [line.id]: event.target.value
                                }))
                              }
                            >
                              <option value="">Select supplier</option>
                              {suppliers.map((supplier) => (
                                <option key={supplier.supplier_id} value={supplier.supplier_id}>
                                  {supplier.supplier_name} • ${supplier.landed_cost.toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-end">
                            <button
                              className="app-button-primary mt-2"
                              onClick={() => createPurchaseOrder(request, line)}
                            >
                              Create purchase order
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
