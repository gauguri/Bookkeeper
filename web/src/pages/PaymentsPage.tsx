import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer: {
    id: number;
    name: string;
  };
  status: string;
  amount_due: number;
};

type Payment = {
  id: number;
  invoice_id: number;
  invoice_number?: string;
  customer_id: number;
  amount: number;
  payment_date: string;
  method?: string;
  notes?: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const invoiceIdParam = searchParams.get("invoiceId");

  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    invoice_id: "",
    amount: "",
    payment_date: todayISO(),
    method: "",
    notes: ""
  });

  const loadPayments = async () => {
    try {
      const paymentsData = await apiFetch<Payment[]>("/payments");
      setPayments(paymentsData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    const hydrateDeepLink = async () => {
      if (!invoiceIdParam) {
        setInvoice(null);
        setForm((prev) => ({ ...prev, invoice_id: "", amount: "" }));
        return;
      }
      const parsedInvoiceId = Number(invoiceIdParam);
      if (!Number.isInteger(parsedInvoiceId) || parsedInvoiceId <= 0) {
        setError("Invalid invoice link. Please open payments from a valid invoice.");
        return;
      }
      try {
        const invoiceDetails = await apiFetch<InvoiceDetail>(`/invoices/${parsedInvoiceId}`);
        const dueAmount = Math.max(Number(invoiceDetails.amount_due) || 0, 0);

        setInvoice(invoiceDetails);
        setForm((prev) => ({
          ...prev,
          invoice_id: String(invoiceDetails.id),
          amount: dueAmount.toFixed(2),
          payment_date: prev.payment_date || todayISO()
        }));
        setError("");
      } catch {
        setError("Invoice from link was not found.");
      }
    };

    hydrateDeepLink();
  }, [invoiceIdParam]);

  const selectedInvoiceDisplay = useMemo(() => {
    if (!invoice) {
      return null;
    }
    return {
      customerName: invoice.customer?.name ?? "—",
      number: invoice.invoice_number,
      amountDue: invoice.amount_due
    };
  }, [invoice]);

  const submitPayment = async () => {
    if (!form.invoice_id || !form.amount || !form.payment_date) {
      setError("Invoice, amount, and payment date are required.");
      return;
    }
    const payload = {
      invoice_id: Number(form.invoice_id),
      amount: Number(form.amount),
      payment_date: form.payment_date,
      method: form.method || null,
      notes: form.notes || null
    };

    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({ invoice_id: form.invoice_id, amount: "", payment_date: todayISO(), method: "", notes: "" });
      await loadPayments();
      if (invoice) {
        const refreshedInvoice = await apiFetch<InvoiceDetail>(`/invoices/${invoice.id}`);
        const refreshedDue = Math.max(Number(refreshedInvoice.amount_due) || 0, 0);
        setInvoice(refreshedInvoice);
        setForm((prev) => ({ ...prev, amount: refreshedDue.toFixed(2) }));
      }
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Payments</p>
          <h1 className="text-3xl font-semibold">Cash application</h1>
          <p className="text-muted">Record payments against invoices and keep balances up to date.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("payment-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> Record payment
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {selectedInvoiceDisplay && (
        <div className="app-card border-primary/30 bg-primary/5 p-5" id="linked-invoice-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Deep link</p>
          <h2 className="mt-2 text-lg font-semibold">Record Payment for Invoice {selectedInvoiceDisplay.number}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Customer</p>
              <p className="font-medium">{selectedInvoiceDisplay.customerName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Invoice</p>
              <p className="font-medium">{selectedInvoiceDisplay.number}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Balance due</p>
              <p className="font-medium tabular-nums">{currency(selectedInvoiceDisplay.amountDue)}</p>
            </div>
          </div>
        </div>
      )}

      <div id="payment-form" className="app-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Record payment</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">New receipt</span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <input className="app-input" value={form.invoice_id} readOnly placeholder="Invoice ID" />
          <input
            className="app-input"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount *"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <input
            className="app-input"
            type="date"
            value={form.payment_date}
            onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
          />
          <select
            className="app-select"
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value })}
          >
            <option value="">Method (optional)</option>
            <option value="Cash">Cash</option>
            <option value="Check">Check</option>
            <option value="ACH">ACH</option>
            <option value="Card">Card</option>
            <option value="Wire">Wire</option>
          </select>
          <input
            className="app-input md:col-span-2"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </div>

        <div className="flex justify-end">
          <button className="app-button" onClick={submitPayment}>
            Record payment
          </button>
        </div>
      </div>

      <div className="app-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent payments</h2>
          <button className="app-button-ghost text-xs">Export CSV</button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="py-2">Date</th>
              <th>Invoice</th>
              <th>Method</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="app-table-row border-t">
                <td className="py-2">{payment.payment_date}</td>
                <td>
                  <Link className="text-primary hover:underline" to={`/invoices/${payment.invoice_id}`}>
                    {payment.invoice_number ?? `Invoice #${payment.invoice_id}`}
                  </Link>
                </td>
                <td>{payment.method ?? "-"}</td>
                <td className="text-right tabular-nums">{currency(payment.amount)}</td>
                <td className="text-right">
                  <button className="app-button-ghost" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
