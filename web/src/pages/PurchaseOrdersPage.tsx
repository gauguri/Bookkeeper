import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

type Supplier = {
  id: number;
  name: string;
};

type PurchaseOrderLine = {
  id: number;
  item_id: number;
  qty_ordered: number;
  unit_cost: number;
  freight_cost: number;
  tariff_cost: number;
  landed_cost: number;
  qty_received: number;
};

type PurchaseOrder = {
  id: number;
  supplier_id: number;
  status: string;
  order_date: string;
  expected_date?: string | null;
  lines: PurchaseOrderLine[];
};

type ReceiveDraft = Record<number, string>;

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [receiveDrafts, setReceiveDrafts] = useState<Record<number, ReceiveDraft>>({});

  const loadData = async () => {
    try {
      const [poData, supplierData] = await Promise.all([
        apiFetch<PurchaseOrder[]>("/purchase-orders"),
        apiFetch<Supplier[]>("/suppliers")
      ]);
      setPurchaseOrders(poData);
      setSuppliers(supplierData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const supplierLookup = useMemo(() => {
    return suppliers.reduce<Record<number, string>>((acc, supplier) => {
      acc[supplier.id] = supplier.name;
      return acc;
    }, {});
  }, [suppliers]);

  const updateReceiveDraft = (poId: number, lineId: number, value: string) => {
    setReceiveDrafts((prev) => ({
      ...prev,
      [poId]: { ...(prev[poId] ?? {}), [lineId]: value }
    }));
  };

  const submitReceive = async (po: PurchaseOrder) => {
    const lines = Object.entries(receiveDrafts[po.id] ?? {})
      .filter(([, qty]) => qty)
      .map(([lineId, qty]) => ({ line_id: Number(lineId), qty_received: Number(qty) }));
    if (!lines.length) {
      setError("Enter at least one received quantity.");
      return;
    }
    setError("");
    try {
      const updated = await apiFetch<PurchaseOrder>(`/purchase-orders/${po.id}/receive`, {
        method: "POST",
        body: JSON.stringify({ lines })
      });
      setPurchaseOrders((prev) => prev.map((existing) => (existing.id === po.id ? updated : existing)));
      setReceiveDrafts((prev) => ({ ...prev, [po.id]: {} }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Purchase Orders</h2>
        <p className="text-sm text-muted">Track supplier orders and receive incoming stock.</p>
      </header>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <div className="space-y-4">
        {purchaseOrders.map((po) => (
          <div key={po.id} className="app-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted">PO #{po.id}</p>
                <p className="font-semibold">{supplierLookup[po.supplier_id] ?? `Supplier ${po.supplier_id}`}</p>
              </div>
              <div className="text-sm text-muted">
                Status: <span className="font-semibold text-foreground">{po.status}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Qty ordered</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">Landed cost</th>
                    <th className="px-4 py-3">Receive now</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((line) => (
                    <tr key={line.id} className="border-t border-muted/20">
                      <td className="px-4 py-3">Item #{line.item_id}</td>
                      <td className="px-4 py-3">{line.qty_ordered}</td>
                      <td className="px-4 py-3">{line.qty_received}</td>
                      <td className="px-4 py-3">${line.landed_cost.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <input
                          className="app-input w-28"
                          type="number"
                          value={receiveDrafts[po.id]?.[line.id] ?? ""}
                          onChange={(event) => updateReceiveDraft(po.id, line.id, event.target.value)}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="app-button-primary" onClick={() => submitReceive(po)}>
              Receive stock
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
