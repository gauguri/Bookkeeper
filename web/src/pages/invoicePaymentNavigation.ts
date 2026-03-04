export type InvoiceRecordPaymentCandidate = {
  id?: number | string | null;
  invoice_number?: string | null;
  status?: string | null;
  amount_due?: number | string | null;
};

const BLOCKED_STATUSES = new Set(["PAID", "VOID"]);

export const canRecordPayment = (invoice: InvoiceRecordPaymentCandidate) => {
  const status = String(invoice.status ?? "").toUpperCase();
  const amountDue = Number(invoice.amount_due ?? 0);
  return !BLOCKED_STATUSES.has(status) && Number.isFinite(amountDue) && amountDue > 0;
};

export const buildInvoiceRecordPaymentPath = (invoice: InvoiceRecordPaymentCandidate) => {
  const invoiceKey = invoice.id ?? invoice.invoice_number;
  if (invoiceKey === undefined || invoiceKey === null || invoiceKey === "") {
    return null;
  }
  return `/invoices/${encodeURIComponent(String(invoiceKey))}?action=record-payment`;
};

export const shouldAutoOpenRecordPayment = (actionParam: string | null, state?: { openRecordPayment?: boolean } | null) =>
  actionParam === "record-payment" || state?.openRecordPayment === true;
