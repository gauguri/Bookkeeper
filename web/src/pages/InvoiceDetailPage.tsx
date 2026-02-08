import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CircleCheck, Clock, FileText, Send, XCircle } from "lucide-react";
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

const statusStyles: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-muted",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
  PAID: "border-success/30 bg-success/10 text-success",
  VOID: "border-danger/30 bg-danger/10 text-danger"
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
    return (
      <div className="app-card p-6">
        <div className="app-skeleton h-6 w-40" />
        <div className="mt-4 space-y-3">
          <div className="app-skeleton h-4 w-full" />
          <div className="app-skeleton h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return <p className="text-sm text-danger">{error || "Invoice not found."}</p>;
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Invoice</p>
          <h1 className="text-3xl font-semibold">{invoice.invoice_number}</h1>
          <p className="text-muted">
            {invoice.customer.name} · Due {invoice.due_date}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`app-badge ${statusStyles[invoice.status] ?? "border-border bg-secondary"}`}>
            {invoice.status.replace("_", " ")}
          </span>
          {invoice.status === "DRAFT" && (
            <button className="app-button" onClick={markSent}>
              <Send className="h-4 w-4" /> Mark sent
            </button>
          )}
          {invoice.status !== "VOID" && invoice.status !== "PAID" && (
            <button className="app-button-secondary" onClick={voidInvoice}>
              <XCircle className="h-4 w-4" /> Void
            </button>
          )}
          <Link className="app-button-ghost" to="/sales/payments">
            Record payment
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="app-card p-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Invoice preview</p>
                <p className="text-xs text-muted">Issued {invoice.issue_date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">Total due</p>
              <p className="text-2xl font-semibold tabular-nums">{currency(invoice.amount_due)}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-gradient-to-b from-white to-slate-50 p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted">Bill to</p>
                <p className="text-lg font-semibold">{invoice.customer.name}</p>
                <p className="text-sm text-muted">{invoice.customer.email ?? "No email on file"}</p>
              </div>
              <div className="text-right text-sm text-muted">
                <p>Invoice: {invoice.invoice_number}</p>
                <p>Issued: {invoice.issue_date}</p>
                <p>Due: {invoice.due_date}</p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Unit price</th>
                    <th className="px-4 py-3">Tax rate</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="px-4 py-3">{line.description ?? "Item"}</td>
                      <td className="px-4 py-3">{line.quantity}</td>
                      <td className="px-4 py-3 tabular-nums">{currency(line.unit_price)}</td>
                      <td className="px-4 py-3">{line.tax_rate}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{currency(line.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end text-sm text-muted">
              <div className="space-y-1 text-right">
                <div>Subtotal: {currency(invoice.subtotal)}</div>
                <div>Tax: {currency(invoice.tax_total)}</div>
                <div className="text-base font-semibold text-foreground">Total: {currency(invoice.total)}</div>
                <div className="text-base font-semibold text-foreground">Balance: {currency(invoice.amount_due)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="app-card p-6">
            <p className="text-sm font-semibold">Status timeline</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <CircleCheck className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold">Invoice issued</p>
                  <p className="text-xs text-muted">{invoice.issue_date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-semibold">Due date</p>
                  <p className="text-xs text-muted">{invoice.due_date}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="app-card p-6">
            <p className="text-sm font-semibold">Payment history</p>
            {invoice.payments.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No payments applied yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {invoice.payments.map((payment) => (
                  <div key={payment.payment_id} className="flex items-center justify-between rounded-xl border bg-surface px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">{payment.method ?? "Payment"}</p>
                      <p className="text-xs text-muted">
                        {payment.payment_date} · {payment.reference ?? "No reference"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{currency(payment.applied_amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
