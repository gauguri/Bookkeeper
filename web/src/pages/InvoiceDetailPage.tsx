import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleCheck,
  Clock,
  FileText,
  Send,
  XCircle
} from "lucide-react";
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
  created_at: string;
  updated_at: string;
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

type InvoiceDetailPayload = Omit<InvoiceDetail, "line_items"> & {
  line_items?: InvoiceLine[];
  lines?: InvoiceLine[];
};

type ErrorState = {
  kind: "not-found" | "server";
  message: string;
};

const statusStyles: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-muted",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
  PAID: "border-success/30 bg-success/10 text-success",
  VOID: "border-danger/30 bg-danger/10 text-danger"
};

const formatDate = (value?: string) => {
  if (!value) {
    return "—";
  }
  if (!value.includes("T")) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const StatusPill = ({ status }: { status: string }) => (
  <span className={`app-badge ${statusStyles[status] ?? "border-border bg-secondary"}`}>
    {status.replace(/_/g, " ")}
  </span>
);

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  confirmTone = "default",
  onConfirm,
  onCancel,
  loading
}: ConfirmDialogProps) => {
  if (!open) {
    return null;
  }

  const confirmClass = confirmTone === "danger" ? "app-button-secondary text-danger" : "app-button";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="app-card w-full max-w-md p-6 shadow-glow">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="app-button-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className={confirmClass} onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const invoiceIdentifier = id ?? "";
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const loadInvoice = async () => {
    if (!invoiceIdentifier) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InvoiceDetailPayload>(`/invoices/${invoiceIdentifier}`);
      const normalized: InvoiceDetail = {
        ...data,
        line_items: data.line_items ?? data.lines ?? []
      };
      setInvoice(normalized);
      setActionError("");
    } catch (err) {
      const message = (err as Error).message;
      setInvoice(null);
      setError({
        kind: message.toLowerCase().includes("not found") ? "not-found" : "server",
        message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceIdentifier]);

  const markSent = async () => {
    if (!invoice) {
      return;
    }
    try {
      setSending(true);
      setActionError("");
      await apiFetch(`/invoices/${invoice.id}/send`, { method: "POST" });
      await loadInvoice();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const voidInvoice = async () => {
    if (!invoice) {
      return;
    }
    try {
      setVoiding(true);
      setActionError("");
      await apiFetch(`/invoices/${invoice.id}/void`, { method: "POST" });
      setConfirmVoid(false);
      await loadInvoice();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setVoiding(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="app-skeleton h-4 w-48" />
          <div className="app-skeleton h-8 w-64" />
          <div className="app-skeleton h-4 w-56" />
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="app-card p-5">
              <div className="app-skeleton h-4 w-24" />
              <div className="mt-4 app-skeleton h-6 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="app-card p-6">
            <div className="app-skeleton h-6 w-40" />
            <div className="mt-6 space-y-3">
              <div className="app-skeleton h-4 w-full" />
              <div className="app-skeleton h-4 w-5/6" />
              <div className="app-skeleton h-4 w-4/6" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="app-card p-6">
              <div className="app-skeleton h-5 w-32" />
              <div className="mt-4 space-y-3">
                <div className="app-skeleton h-12 w-full" />
                <div className="app-skeleton h-12 w-full" />
              </div>
            </div>
            <div className="app-card p-6">
              <div className="app-skeleton h-5 w-24" />
              <div className="mt-4 space-y-2">
                <div className="app-skeleton h-4 w-40" />
                <div className="app-skeleton h-4 w-32" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!invoice || error) {
    const title = error?.kind === "not-found" ? "Invoice not found" : "Something went wrong";
    const description =
      error?.kind === "not-found"
        ? "We couldn't locate this invoice. Check the link or head back to the invoice list."
        : "We hit a snag while loading this invoice. Please try again in a moment.";
    return (
      <section className="space-y-6">
        <div className="app-card p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="app-button" onClick={loadInvoice}>
              Retry
            </button>
            <Link className="app-button-ghost" to="/invoices">
              Back to invoices
            </Link>
          </div>
          {error?.message && <p className="mt-4 text-xs text-muted">Details: {error.message}</p>}
        </div>
      </section>
    );
  }

  const canMarkSent = invoice.status === "DRAFT";
  const canVoid = !["PAID", "VOID", "PARTIALLY_PAID"].includes(invoice.status);
  const headerTitle = `Invoice ${invoice.invoice_number}`;
  const customerLabel = invoice.customer.email
    ? `${invoice.customer.name} · ${invoice.customer.email}`
    : invoice.customer.name;
  const breadcrumbInvoice = invoice.invoice_number || `Invoice ${invoice.id}`;
  const metadataRows = useMemo(
    () => [
      { label: "Created", value: formatDate(invoice.created_at) },
      { label: "Updated", value: formatDate(invoice.updated_at) },
      { label: "Internal ID", value: invoice.id.toString() }
    ],
    [invoice.created_at, invoice.updated_at, invoice.id]
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <nav className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            <Link to="/sales" className="hover:text-foreground">
              Sales
            </Link>{" "}
            /{" "}
            <Link to="/invoices" className="hover:text-foreground">
              Invoices
            </Link>{" "}
            / <span className="text-foreground">{breadcrumbInvoice}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{headerTitle}</h1>
            <StatusPill status={invoice.status} />
          </div>
          <p className="text-muted">
            {customerLabel} · Due {invoice.due_date}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="app-button-ghost" to="/invoices">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            {canMarkSent && (
              <button className="app-button" onClick={markSent} disabled={sending}>
                <Send className="h-4 w-4" /> {sending ? "Sending..." : "Mark as sent"}
              </button>
            )}
            {canVoid && (
              <button
                className="app-button-secondary"
                onClick={() => setConfirmVoid(true)}
                disabled={voiding}
              >
                <XCircle className="h-4 w-4" /> {voiding ? "Voiding..." : "Void"}
              </button>
            )}
            <Link className="app-button-ghost" to="/sales/payments">
              Record payment
            </Link>
          </div>
          <p className="text-xs text-muted">Apply payments from the Payments page to update this invoice.</p>
        </div>
      </div>

      {actionError && (
        <div className="app-card border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {actionError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Total</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{currency(invoice.total)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Balance due</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{currency(invoice.amount_due)}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Due date</p>
          <p className="mt-3 text-2xl font-semibold">{invoice.due_date}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Customer</p>
          <p className="mt-3 text-lg font-semibold">{invoice.customer.name}</p>
          <p className="text-sm text-muted">{invoice.customer.email ?? "No email on file"}</p>
        </div>
      </div>

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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Bookkeeper</p>
                <p className="mt-2 text-lg font-semibold">Invoice statement</p>
              </div>
              <div className="text-right text-sm text-muted">
                <p>Invoice: {invoice.invoice_number}</p>
                <p>Issued: {invoice.issue_date}</p>
                <p>Due: {invoice.due_date}</p>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs uppercase tracking-widest text-muted">Bill to</p>
              <p className="text-lg font-semibold">{invoice.customer.name}</p>
              <p className="text-sm text-muted">{invoice.customer.email ?? "No email on file"}</p>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Unit price</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.length === 0 ? (
                    <tr className="border-t">
                      <td className="px-4 py-6 text-sm text-muted" colSpan={4}>
                        No line items on this invoice.
                      </td>
                    </tr>
                  ) : (
                    invoice.line_items.map((line) => (
                      <tr key={line.id} className="border-t">
                        <td className="px-4 py-3">{line.description ?? "Item"}</td>
                        <td className="px-4 py-3">{line.quantity}</td>
                        <td className="px-4 py-3 tabular-nums">{currency(line.unit_price)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{currency(line.line_total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-4 text-sm text-muted">
              <div className="space-y-2">
                {invoice.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Notes</p>
                    <p className="mt-1 text-sm text-foreground">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Terms</p>
                    <p className="mt-1 text-sm text-foreground">{invoice.terms}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-right">
                <div>Subtotal: {currency(invoice.subtotal)}</div>
                <div>Tax: {currency(invoice.tax_total)}</div>
                <div className="text-base font-semibold text-foreground">Total: {currency(invoice.total)}</div>
                <div className="text-base font-semibold text-foreground">
                  Amount due: {currency(invoice.amount_due)}
                </div>
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
              <p className="mt-4 text-sm text-muted">No payments recorded.</p>
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

          <div className="app-card p-6">
            <p className="text-sm font-semibold">Metadata</p>
            <div className="mt-4 space-y-3 text-sm text-muted">
              {metadataRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span>{row.label}</span>
                  <span className="font-medium text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmVoid}
        title="Void this invoice?"
        description="This will cancel the invoice and remove any remaining balance. This action cannot be undone."
        confirmLabel={voiding ? "Voiding..." : "Void invoice"}
        confirmTone="danger"
        onConfirm={voidInvoice}
        onCancel={() => setConfirmVoid(false)}
        loading={voiding}
      />
    </section>
  );
}
