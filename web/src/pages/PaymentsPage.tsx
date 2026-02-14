import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invoiceIdParam = searchParams.get("invoiceId");
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
  const [deepLinkedInvoiceId, setDeepLinkedInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!invoiceIdParam) {
      setDeepLinkedInvoiceId(null);
      return;
    }

    const parsedInvoiceId = Number(invoiceIdParam);
    if (!Number.isInteger(parsedInvoiceId) || parsedInvoiceId <= 0) {
      setError("Invalid invoice link. Please choose an invoice manually.");
      setDeepLinkedInvoiceId(null);
      return;
    }

    setDeepLinkedInvoiceId(parsedInvoiceId);
  }, [invoiceIdParam]);

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

  useEffect(() => {
    if (!deepLinkedInvoiceId || invoices.length === 0) {
      return;
    }

    const targetInvoice = invoices.find((invoice) => invoice.id === deepLinkedInvoiceId);
    if (!targetInvoice) {
      setError("Invoice from link was not found. Please choose an invoice manually.");
      return;
    }

    const amountDue = Math.max(Number(targetInvoice.amount_due) || 0, 0);
    setForm((prev) => ({
      ...prev,
      customer_id: String(targetInvoice.customer_id),
      amount: amountDue.toFixed(2)
    }));
    setApplications([{ invoice_id: targetInvoice.id, applied_amount: amountDue.toFixed(2) }]);

    setTimeout(() => {
      document.getElementById("payment-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);

    navigate("/payments", { replace: true });
    setDeepLinkedInvoiceId(null);
    setError("");
  }, [deepLinkedInvoiceId, invoices, navigate]);

  const selectedInvoice = useMemo(() => {
    const selectedInvoiceId = applications.find((application) => Number(application.applied_amount) > 0)?.invoice_id;
    if (!selectedInvoiceId) {
      return null;
    }
    return invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  }, [applications, invoices]);

  const selectedCustomerName =
    customers.find((customer) => customer.id === selectedInvoice?.customer_id)?.name ?? "—";

  const { openInvoices, draftInvoices, visibleInvoices } = useMemo(() => {
    if (!form.customer_id) {
      return { openInvoices: [], draftInvoices: [], visibleInvoices: [] };
    }
    const customerInvoiceList = invoices.filter((invoice) => invoice.customer_id === Number(form.customer_id));
    const open = customerInvoiceList.filter(
      (invoice) => invoice.amount_due > 0 && invoice.status !== "VOID" && invoice.status !== "DRAFT"
    );
    const drafts = customerInvoiceList.filter(
      (invoice) => invoice.amount_due > 0 && invoice.status === "DRAFT"
    );
    return {
      openInvoices: open,
      draftInvoices: drafts,
      visibleInvoices: open.length > 0 ? open : drafts
    };
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
    const nextApplications = visibleInvoices.map((invoice) => {
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
    if (Number(form.amount || 0) !== totalApplied) {
      setError("Apply the full payment amount to one or more invoices to continue.");
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
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Payments</p>
          <h1 className="text-3xl font-semibold">Cash application</h1>
          <p className="text-muted">Match incoming payments to outstanding invoices.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("payment-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> Record payment
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div id="payment-form" className="app-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Record payment</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">New receipt</span>
        </div>
        {selectedInvoice && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-semibold text-primary">Invoice ready for payment</p>
            <p className="text-muted">
              {selectedInvoice.invoice_number} · {selectedCustomerName} · Balance due{" "}
              {currency(selectedInvoice.amount_due)}
            </p>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="app-select"
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
            className="app-input"
            type="number"
            min="0"
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
          <input
            className="app-input"
            placeholder="Method"
            value={form.method}
            onChange={(event) => setForm({ ...form, method: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Reference"
            value={form.reference}
            onChange={(event) => setForm({ ...form, reference: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Memo"
            value={form.memo}
            onChange={(event) => setForm({ ...form, memo: event.target.value })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Apply to invoices</h3>
            <button className="app-button-ghost text-xs" onClick={autoApply} disabled={!form.amount}>
              Auto-apply
            </button>
          </div>
          {!form.customer_id ? (
            <p className="text-sm text-muted">Select a customer to see open invoices.</p>
          ) : visibleInvoices.length === 0 ? (
            <p className="text-sm text-muted">No invoices available for this customer. Create an invoice first.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="py-2">Invoice</th>
                  <th>Balance</th>
                  <th className="text-right">Apply</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((invoice) => (
                  <tr key={invoice.id} className="app-table-row border-t">
                    <td className="py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{invoice.invoice_number}</span>
                        {invoice.status === "DRAFT" && (
                          <span className="app-badge border-border bg-secondary text-muted">Draft</span>
                        )}
                      </div>
                    </td>
                    <td className="text-muted tabular-nums">{currency(invoice.amount_due)}</td>
                    <td className="text-right">
                      <input
                        className="app-input w-28 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={applications.find((app) => app.invoice_id === invoice.id)?.applied_amount ?? ""}
                        onChange={(event) => updateApplication(invoice.id, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {visibleInvoices.length > 0 && draftInvoices.length > 0 && openInvoices.length === 0 && (
            <p className="text-sm text-muted">Draft invoices will be marked as Sent when you record this payment.</p>
          )}
          <div className="text-sm text-muted">
            Applied total: {currency(totalApplied)} / Payment amount: {currency(Number(form.amount || 0))}
          </div>
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
              <th>Customer</th>
              <th>Method</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="app-table-row border-t">
                <td className="py-2">{payment.payment_date}</td>
                <td>{customers.find((customer) => customer.id === payment.customer_id)?.name ?? "-"}</td>
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

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("payment-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Record
      </button>
    </section>
  );
}
