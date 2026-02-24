import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiRequestError, apiFetch } from "../../../api";

type SalesOrderDetail = {
  id: number;
  order_number: string;
  account_id: number;
  opportunity_id?: number | null;
  quote_id?: number | null;
  invoice_id?: number | null;
  status: string;
  order_date: string;
  requested_ship_date?: string | null;
  fulfillment_type: string;
  shipping_address?: string | null;
  subtotal?: number | null;
  tax_total?: number | null;
  total?: number | null;
};

const fmtMoney = (amount?: number | null) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(amount || 0));

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("Order id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    apiFetch<SalesOrderDetail>(`/sales/orders/${id}`)
      .then((data) => setOrder(data))
      .catch((err: ApiRequestError) => {
        if (err.status === 404) setError("Sales order not found.");
        else setError(err.message || "Failed to load sales order.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{order?.order_number || "Sales Order"}</h2>
          <p className="text-sm text-muted">Order status, fulfillment details, and linked records.</p>
        </div>
        <Link className="app-button-secondary" to="/sales/command-center/orders">Back to orders</Link>
      </div>

      {loading && <section className="app-card p-6 text-sm text-muted">Loading order…</section>}

      {!loading && error && <section className="app-card border border-red-500/40 p-6 text-red-300">{error}</section>}

      {!loading && !error && order && (
        <section className="app-card p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted">Status</dt><dd className="font-semibold">{order.status}</dd></div>
            <div><dt className="text-muted">Order Date</dt><dd>{new Date(order.order_date).toLocaleDateString()}</dd></div>
            <div><dt className="text-muted">Requested Ship</dt><dd>{order.requested_ship_date ? new Date(order.requested_ship_date).toLocaleDateString() : "—"}</dd></div>
            <div><dt className="text-muted">Fulfillment</dt><dd>{order.fulfillment_type}</dd></div>
            <div><dt className="text-muted">Account</dt><dd>#{order.account_id}</dd></div>
            <div><dt className="text-muted">Opportunity</dt><dd>{order.opportunity_id ? `#${order.opportunity_id}` : "—"}</dd></div>
            <div><dt className="text-muted">Quote</dt><dd>{order.quote_id ? `#${order.quote_id}` : "—"}</dd></div>
            <div><dt className="text-muted">Invoice</dt><dd>{order.invoice_id ? `#${order.invoice_id}` : "—"}</dd></div>
            <div><dt className="text-muted">Subtotal</dt><dd>{fmtMoney(order.subtotal)}</dd></div>
            <div><dt className="text-muted">Tax</dt><dd>{fmtMoney(order.tax_total)}</dd></div>
            <div><dt className="text-muted">Total</dt><dd className="font-semibold">{fmtMoney(order.total)}</dd></div>
          </dl>

          <div className="mt-6 border-t border-[var(--bedrock-border)] pt-4 text-sm">
            <p className="text-muted">Shipping Address</p>
            <p>{order.shipping_address || "No shipping address provided."}</p>
          </div>
        </section>
      )}
    </div>
  );
}
