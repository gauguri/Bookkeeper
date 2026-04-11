import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getPurchaseOrder } from "../api";

type PurchaseOrderDetailLine = {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number | string;
  unit_cost: number | string;
};

type PurchaseOrderDetail = {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name?: string;
  order_date: string;
  expected_date?: string | null;
  notes?: string | null;
  freight_cost: number | string;
  tariff_cost: number | string;
  status: string;
  total?: number | string;
  lines: PurchaseOrderDetailLine[];
};

type LocationState = {
  supplierName?: string;
  backTo?: string;
  backLabel?: string;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusBadge(status: string) {
  if (status === "DRAFT") return "app-badge border-slate-300 bg-slate-100 text-slate-600";
  if (status === "SENT") return "app-badge border-blue-300 bg-blue-50 text-blue-700";
  if (status === "RECEIVED") return "app-badge border-green-300 bg-green-50 text-green-700";
  if (status === "PARTIALLY_RECEIVED") return "app-badge border-amber-300 bg-amber-50 text-amber-700";
  return "app-badge border-slate-300 bg-slate-100 text-slate-600";
}

export default function PurchaseOrderDetailPage() {
  const { purchaseOrderId } = useParams<{ purchaseOrderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | null) ?? null;
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(purchaseOrderId);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Purchase order not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    getPurchaseOrder<PurchaseOrderDetail>(id)
      .then((response) => {
        setDetail({
          ...response,
          supplier_name: response.supplier_name ?? locationState?.supplierName,
        });
      })
      .catch((err) => setError((err as Error).message || "Unable to load purchase order."))
      .finally(() => setLoading(false));
  }, [purchaseOrderId, locationState?.supplierName]);

  const backTo = locationState?.backTo || "/purchasing/po-hub";
  const backLabel = locationState?.backLabel || "Back to Procurement Hub";

  const poTotal = useMemo(() => {
    if (!detail) return 0;
    if (detail.total != null) return toNumber(detail.total);
    return detail.lines.reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.unit_cost), 0)
      + toNumber(detail.freight_cost)
      + toNumber(detail.tariff_cost);
  }, [detail]);

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-secondary" />
        <div className="app-card h-72 animate-pulse bg-secondary" />
      </section>
    );
  }

  if (error || !detail) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">{error || "Unable to load purchase order."}</p>
        <button className="app-button mt-4" onClick={() => navigate(backTo)}>
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <button
        onClick={() => navigate(backTo)}
        className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
        type="button"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>

      <div className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold">{detail.po_number}</h1>
              <span className={statusBadge(detail.status)}>{detail.status.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{detail.supplier_name || `Supplier #${detail.supplier_id}`}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Order Date</p>
            <p className="mt-2 text-lg font-semibold">{detail.order_date}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Expected Date</p>
            <p className="mt-2 text-lg font-semibold">{detail.expected_date || "-"}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Total</p>
            <p className="mt-2 text-lg font-semibold">${poTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">Line Items</h2>
          {detail.lines.length > 0 ? (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => {
                    const quantity = toNumber(line.quantity);
                    const unitCost = toNumber(line.unit_cost);
                    return (
                      <tr key={line.id} className="border-t">
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-primary hover:underline"
                            onClick={() => navigate(`/sales/items/${line.item_id}`, {
                              state: {
                                backTo: `/purchasing/purchase-orders/${detail.id}`,
                                backLabel: `Back to ${detail.po_number}`,
                              },
                            })}
                            type="button"
                          >
                            {line.item_name}
                          </button>
                        </td>
                        <td className="px-4 py-3">{quantity}</td>
                        <td className="px-4 py-3">${unitCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-semibold">${(quantity * unitCost).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">No line items on this purchase order.</p>
          )}
        </div>

        {(toNumber(detail.freight_cost) > 0 || toNumber(detail.tariff_cost) > 0 || detail.notes) ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold">Additional Costs</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Freight</span>
                  <span className="font-medium">${toNumber(detail.freight_cost).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Tariff</span>
                  <span className="font-medium">${toNumber(detail.tariff_cost).toFixed(2)}</span>
                </div>
              </div>
            </div>
            {detail.notes ? (
              <div className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Notes</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{detail.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
