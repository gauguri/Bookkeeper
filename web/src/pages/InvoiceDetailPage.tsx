import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type InvoiceLine = {
  id: number;
  description?: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  line_total: number;
};

type PaymentSummary = {
  payment_id: number;
  payment_date: string;
  amount: number;
  applied_amount: number;
  method?: string;
  reference?: string;
};

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_due: number;
  notes?: string;
  terms?: string;
  customer: {
    id: number;
    name: string;
    email?: string;
  };
  line_items: InvoiceLine[];
  payments: PaymentSummary[];
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadInvoice = async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<InvoiceDetail>(`/invoices/${id}`);
      setInvoice(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const markSent = async () => {
    if (!id) {
      return;
    }
    try {
      await apiFetch(`/invoices/${id}/send`, { method: "POST" });
      loadInvoice();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const voidInvoice = async () => {
    if (!id) {
      return;
    }
    if (!window.confirm("Are you sure you want to void this invoice?")) {
      return;
    }
    try {
      await apiFetch(`/invoices/${id}/void`, { method: "POST" });
      loadInvoice();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invoice...</p>;
  }

  if (!invoice) {
    return <p className="text-sm text-rose-600">{error || "Invoice not found."}</p>;
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{invoice.invoice_number}</h1>
          <p className="text-slate-600">
            {invoice.customer.name} · Due {invoice.due_date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">{invoice.status}</span>
          {invoice.status === "DRAFT" && (
            <button className="bg-slate-900 text-white rounded px-3 py-2 text-sm" onClick={markSent}>
              Mark Sent
            </button>
          )}
          {invoice.status !== "VOID" && invoice.status !== "PAID" && (
            <button className="border border-slate-300 rounded px-3 py-2 text-sm" onClick={voidInvoice}>
              Void
            </button>
          )}
          <Link className="text-sm text-slate-700" to="/sales/payments">
            Record payment
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Line items</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Tax rate</th>
              <th className="text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((line) => (
              <tr key={line.id} className="border-t border-slate-100">
                <td className="py-2">{line.description ?? "Item"}</td>
                <td>{line.quantity}</td>
                <td>{currency(line.unit_price)}</td>
                <td>{line.tax_rate}</td>
                <td className="text-right">{currency(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end text-sm text-slate-600">
          <div>
            <div>Subtotal: {currency(invoice.subtotal)}</div>
            <div>Tax: {currency(invoice.tax_total)}</div>
            <div className="font-semibold text-slate-900">Total: {currency(invoice.total)}</div>
            <div className="font-semibold text-slate-900">Balance: {currency(invoice.amount_due)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Payments</h2>
        {invoice.payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments applied yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="text-right">Applied</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.payment_id} className="border-t border-slate-100">
                  <td className="py-2">{payment.payment_date}</td>
                  <td>{payment.method ?? "-"}</td>
                  <td>{payment.reference ?? "-"}</td>
                  <td className="text-right">{currency(payment.applied_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
