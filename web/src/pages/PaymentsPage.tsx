import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type Customer = {
  id: number;
  name: string;
};

type InvoiceList = {
  id: number;
  invoice_number: string;
  status: string;
  total: number;
  amount_due: number;
  issue_date: string;
  due_date: string;
  customer_id: number;
};

type Payment = {
  id: number;
  customer_id: number;
  amount: number;
  payment_date: string;
  method?: string;
  reference?: string;
  memo?: string;
};

type Application = {
  invoice_id: number;
  applied_amount: string;
};

export default function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceList[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    payment_date: "",
    method: "",
    reference: "",
    memo: ""
  });
  const [applications, setApplications] = useState<Application[]>([]);

  const loadData = async () => {
    try {
      const [customersData, invoicesData, paymentsData] = await Promise.all([
        apiFetch<Customer[]>("/customers"),
        apiFetch<InvoiceList[]>("/invoices"),
        apiFetch<Payment[]>("/payments")
      ]);
      setCustomers(customersData);
      setInvoices(invoicesData);
      setPayments(paymentsData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const customerInvoices = useMemo(() => {
    if (!form.customer_id) {
      return [];
    }
    return invoices.filter(
      (invoice) =>
        invoice.customer_id === Number(form.customer_id) &&
        invoice.amount_due > 0 &&
        invoice.status !== "VOID" &&
        invoice.status !== "DRAFT"
    );
  }, [form.customer_id, invoices]);

  const totalApplied = applications.reduce((sum, app) => sum + (Number(app.applied_amount) || 0), 0);

  const updateApplication = (invoiceId: number, amount: string) => {
    setApplications((prev) => {
      const existing = prev.find((app) => app.invoice_id === invoiceId);
      if (existing) {
        return prev.map((app) => (app.invoice_id === invoiceId ? { ...app, applied_amount: amount } : app));
      }
      return [...prev, { invoice_id: invoiceId, applied_amount: amount }];
    });
  };

  const autoApply = () => {
    let remaining = Number(form.amount || 0);
    const nextApplications = customerInvoices.map((invoice) => {
      const applied = Math.min(invoice.amount_due, remaining);
      remaining -= applied;
      return { invoice_id: invoice.id, applied_amount: applied.toFixed(2) };
    });
    setApplications(nextApplications);
  };

  const submitPayment = async () => {
    if (!form.customer_id || !form.amount || !form.payment_date) {
      setError("Customer, amount, and payment date are required.");
      return;
    }
    const payload = {
      customer_id: Number(form.customer_id),
      amount: Number(form.amount),
      payment_date: form.payment_date,
      method: form.method || null,
      reference: form.reference || null,
      memo: form.memo || null,
      applications: applications
        .filter((app) => Number(app.applied_amount) > 0)
        .map((app) => ({ invoice_id: app.invoice_id, applied_amount: Number(app.applied_amount) }))
    };
    try {
      await apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({ customer_id: "", amount: "", payment_date: "", method: "", reference: "", memo: "" });
      setApplications([]);
      loadData();
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Payments</h1>
        <p className="text-slate-600">Apply incoming payments to outstanding invoices.</p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Record payment</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            value={form.customer_id}
            onChange={(event) => {
              setForm({ ...form, customer_id: event.target.value });
              setApplications([]);
            }}
          >
            <option value="">Select customer *</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount *"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={form.payment_date}
            onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Method"
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Reference"
            value={form.reference}
            onChange={(event) => setForm({ ...form, reference: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Memo"
            value={form.memo}
            onChange={(event) => setForm({ ...form, memo: event.target.value })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Apply to invoices</h3>
            <button className="text-sm text-slate-700" onClick={autoApply} disabled={!form.amount}>
              Auto-apply
            </button>
          </div>
          {customerInvoices.length === 0 ? (
            <p className="text-sm text-slate-500">Select a customer to see open invoices.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Invoice</th>
                  <th>Balance</th>
                  <th className="text-right">Apply</th>
                </tr>
              </thead>
              <tbody>
                {customerInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-100">
                    <td className="py-2">{invoice.invoice_number}</td>
                    <td>{currency(invoice.amount_due)}</td>
                    <td className="text-right">
                      <input
                        className="border border-slate-300 rounded px-2 py-1 text-sm w-28 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          applications.find((app) => app.invoice_id === invoice.id)?.applied_amount ?? ""
                        }
                        onChange={(event) => updateApplication(invoice.id, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="text-sm text-slate-600">
            Applied total: {currency(totalApplied)} / Payment amount: {currency(Number(form.amount || 0))}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="bg-slate-900 text-white rounded px-4 py-2 text-sm" onClick={submitPayment}>
            Record payment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Recent payments</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Date</th>
              <th>Customer</th>
              <th>Method</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-t border-slate-100">
                <td className="py-2">{payment.payment_date}</td>
                <td>{customers.find((customer) => customer.id === payment.customer_id)?.name ?? "-"}</td>
                <td>{payment.method ?? "-"}</td>
                <td className="text-right">{currency(payment.amount)}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
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
