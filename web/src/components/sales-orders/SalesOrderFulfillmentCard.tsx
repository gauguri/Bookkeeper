import { Package, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import type { SalesRequestLineDetail } from "../../hooks/useSalesRequests";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  lines: SalesRequestLineDetail[];
  fulfillmentDate: string | null;
  linkedInvoiceId: number | null;
  linkedInvoiceNumber: string | null;
  linkedInvoiceStatus: string | null;
  linkedInvoiceShippedAt: string | null;
  status: string;
};

const formatDate = (v?: string | null) => {
  if (!v) return "\u2014";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
};

export default function SalesOrderFulfillmentCard({
  lines,
  fulfillmentDate,
  linkedInvoiceId,
  linkedInvoiceNumber,
  linkedInvoiceStatus,
  linkedInvoiceShippedAt,
  status,
}: Props) {
  const isTerminal = ["CLOSED", "LOST", "CANCELLED"].includes(status);
  const allAvailable = lines.every(
    (l) => Number(l.available_qty) >= Number(l.quantity)
  );
  const someAvailable = lines.some((l) => Number(l.available_qty) > 0);

  const daysRemaining = fulfillmentDate
    ? Math.ceil(
        (new Date(fulfillmentDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="app-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Fulfillment Status</p>
          <p className="text-xs text-muted">
            Inventory availability and shipping
          </p>
        </div>
      </div>

      {/* Fulfillment date */}
      {fulfillmentDate && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            daysRemaining != null && daysRemaining < 0 && !isTerminal
              ? "border-red-200 bg-red-50 text-red-700"
              : daysRemaining != null && daysRemaining <= 3 && !isTerminal
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-border bg-surface"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>
            Requested: {formatDate(fulfillmentDate)}
            {daysRemaining != null && !isTerminal && (
              <span className="ml-2 font-semibold">
                {daysRemaining >= 0
                  ? `(${daysRemaining}d remaining)`
                  : `(${Math.abs(daysRemaining)}d overdue)`}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Per-line inventory */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Line Item Availability
        </p>
        <div className="space-y-1.5">
          {lines.map((line) => {
            const avail = Number(line.available_qty);
            const needed = Number(line.quantity);
            const ok = avail >= needed;
            return (
              <div
                key={line.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  {ok ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-medium">{line.item_name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums text-muted">
                  <span>Need: {needed}</span>
                  <span>Avail: {avail}</span>
                  <span>On hand: {Number(line.on_hand_qty)}</span>
                  <span>Reserved: {Number(line.reserved_qty)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall readiness */}
      <div
        className={`rounded-lg border p-3 text-sm font-medium ${
          allAvailable
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : someAvailable
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {allAvailable
          ? "All line items have sufficient inventory"
          : someAvailable
            ? "Some items have insufficient inventory"
            : "Inventory unavailable for all items"}
      </div>

      {/* Linked invoice shipping */}
      {linkedInvoiceId && (
        <div className="rounded-lg border border-border bg-surface p-3 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Linked Invoice
          </p>
          <p className="text-sm font-medium">{linkedInvoiceNumber}</p>
          <p className="text-xs text-muted">
            Status: {linkedInvoiceStatus?.replace(/_/g, " ") ?? "\u2014"}
            {linkedInvoiceShippedAt &&
              ` \u00B7 Shipped: ${formatDate(linkedInvoiceShippedAt)}`}
          </p>
        </div>
      )}
    </div>
  );
}
