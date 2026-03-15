import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Loader2, PackageCheck, TrendingUp } from "lucide-react";

import { ApiRequestError, apiFetch } from "../../../api";
import SalesOrderStatusBadge from "../../../components/sales-orders/SalesOrderStatusBadge";

type SupplierOption = {
  supplier_id: number;
  supplier_name: string;
  landed_cost: number;
  is_preferred: boolean;
  lead_time_days?: number | null;
};

type OrderLine = {
  id: number;
  item_id?: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  invoice_unit_price?: number | null;
  invoice_line_total?: number | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  supplier_options: SupplierOption[];
};

type TimelineEntry = {
  status: string;
  label: string;
  occurred_at?: string | null;
  completed: boolean;
  current: boolean;
};

type OrderKpis = {
  total_amount: number;
  line_count: number;
  avg_line_value?: number | null;
  estimated_margin_percent?: number | null;
  estimated_margin_amount?: number | null;
  days_open: number;
  fulfillment_days_remaining?: number | null;
};

type RelatedOrder = {
  id: number;
  request_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

type SalesOrderExecutionDetail = {
  id: number;
  order_number: string;
  account_id: number;
  account_name?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  opportunity_id?: number | null;
  quote_id?: number | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  status: string;
  order_date: string;
  requested_ship_date?: string | null;
  fulfillment_type: string;
  shipping_address?: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  created_at: string;
  updated_at: string;
  lines: OrderLine[];
  linked_invoice_id?: number | null;
  linked_invoice_number?: string | null;
  linked_invoice_status?: string | null;
  linked_invoice_shipped_at?: string | null;
  allowed_transitions: string[];
  timeline: TimelineEntry[];
  kpis: OrderKpis;
  customer_recent_orders: RelatedOrder[];
};

const fmtMoney = (amount?: number | null) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(amount || 0));

const fmtDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
};

const actionLabels: Record<string, string> = {
  CONFIRMED: "Confirm order",
  ALLOCATED: "Allocate stock",
  CLOSED: "Close order",
};

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="app-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<SalesOrderExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actingKey, setActingKey] = useState<string | null>(null);

  const loadOrder = async () => {
    if (!id) {
      setError("Order id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<SalesOrderExecutionDetail>(`/sales/orders/${id}/360`);
      setOrder(data);
    } catch (err) {
      const requestError = err as ApiRequestError;
      if (requestError.status === 404) setError("Sales order not found.");
      else setError(requestError.message || "Failed to load sales order.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrder();
  }, [id]);

  const runStatusAction = async (nextStatus: string) => {
    if (!id) return;
    setActingKey(nextStatus);
    setActionError("");
    try {
      await apiFetch(`/sales/orders/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadOrder();
    } catch (err) {
      const requestError = err as ApiRequestError;
      setActionError(requestError.message || `Failed to move order to ${nextStatus}.`);
    } finally {
      setActingKey(null);
    }
  };

  const generateInvoice = async () => {
    if (!id) return;
    setActingKey("GENERATE_INVOICE");
    setActionError("");
    try {
      const refreshed = await apiFetch<SalesOrderExecutionDetail>(`/sales/orders/${id}/generate-invoice`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setOrder(refreshed);
    } catch (err) {
      const requestError = err as ApiRequestError;
      setActionError(requestError.message || "Failed to generate invoice from order.");
    } finally {
      setActingKey(null);
    }
  };

  const nextStepMessage = (() => {
    if (!order) return "";
    if (order.status === "DRAFT") return "Confirm the order to reserve stock and make it operational.";
    if (order.status === "CONFIRMED" || order.status === "ALLOCATED") {
      if (!order.linked_invoice_id) return "Generate the invoice from this order to hand off to billing and shipment.";
    }
    if (order.linked_invoice_id && !order.linked_invoice_shipped_at) {
      return "Open the linked invoice to send and ship it. Shipment will automatically fulfill this order.";
    }
    if (order.linked_invoice_id && order.linked_invoice_status !== "PAID") {
      return "Record payment against the linked invoice. When it is fully paid, this order will close automatically.";
    }
    if (order.status === "CLOSED") return "This order is complete. Review related invoice and margin performance if needed.";
    return "Review the linked records and keep the order moving from invoice to shipment to payment.";
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-foreground" to="/sales/command-center/orders">
            <ArrowLeft className="h-4 w-4" />
            Back to orders
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">{order?.order_number || "Sales Order"}</h2>
            {order ? <SalesOrderStatusBadge status={order.status} size="md" /> : null}
          </div>
          <p className="max-w-3xl text-sm text-muted">
            Sales Order is now the execution record. Use this screen to confirm the order, allocate inventory, generate the invoice, and follow the handoff through shipment and payment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order?.linked_invoice_id ? (
            <Link className="app-button-secondary inline-flex items-center gap-2" to={`/sales/invoices/${order.linked_invoice_id}`}>
              <ExternalLink className="h-4 w-4" />
              Open invoice
            </Link>
          ) : null}
          {order && !order.linked_invoice_id && order.allowed_transitions.includes("INVOICED") ? (
            <button className="app-button inline-flex items-center gap-2" disabled={actingKey !== null} onClick={() => void generateInvoice()}>
              {actingKey === "GENERATE_INVOICE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate invoice
            </button>
          ) : null}
          {order?.allowed_transitions.filter((status) => status !== "INVOICED").map((status) => (
            <button
              key={status}
              className="app-button-secondary"
              disabled={actingKey !== null}
              onClick={() => void runStatusAction(status)}
            >
              {actingKey === status ? "Working..." : actionLabels[status] ?? status}
            </button>
          ))}
        </div>
      </div>

      {loading && <section className="app-card p-6 text-sm text-muted">Loading order execution workbench...</section>}
      {!loading && error && <section className="app-card border border-red-500/40 p-6 text-red-300">{error}</section>}

      {!loading && !error && order ? (
        <>
          {actionError ? <section className="app-card border border-red-500/40 p-4 text-sm text-red-300">{actionError}</section> : null}

          <section className="grid gap-4 lg:grid-cols-4">
            <KpiCard label="Order total" value={fmtMoney(order.kpis.total_amount)} hint={`${order.kpis.line_count} line${order.kpis.line_count === 1 ? "" : "s"}`} />
            <KpiCard label="Estimated margin" value={order.kpis.estimated_margin_percent == null ? "N/A" : `${order.kpis.estimated_margin_percent.toFixed(1)}%`} hint={order.kpis.estimated_margin_amount == null ? "No supplier cost baseline yet" : fmtMoney(order.kpis.estimated_margin_amount)} />
            <KpiCard label="Days open" value={`${order.kpis.days_open}`} hint={`Order date ${fmtDate(order.order_date)}`} />
            <KpiCard label="Requested ship" value={fmtDate(order.requested_ship_date)} hint={order.kpis.fulfillment_days_remaining == null ? "No requested ship date" : `${order.kpis.fulfillment_days_remaining} day(s) remaining`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <section className="app-card p-6">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Execution control</h3>
                </div>
                <p className="mt-2 text-sm text-muted">{nextStepMessage}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Account</p>
                    <p className="mt-1 font-medium">{order.account_name || `#${order.account_id}`}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Customer</p>
                    <p className="mt-1 font-medium">{order.customer_name || "Pending customer linkage"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Fulfillment</p>
                    <p className="mt-1 font-medium">{order.fulfillment_type}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Opportunity</p>
                    <p className="mt-1 font-medium">{order.opportunity_id ? `#${order.opportunity_id}` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Quote</p>
                    <p className="mt-1 font-medium">{order.quote_id ? `#${order.quote_id}` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Linked invoice</p>
                    <p className="mt-1 font-medium">{order.linked_invoice_number || "Not generated yet"}</p>
                    {order.linked_invoice_status ? <p className="text-sm text-muted">{order.linked_invoice_status}</p> : null}
                  </div>
                </div>
                <div className="mt-4 border-t border-[var(--bedrock-border)] pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Shipping address</p>
                  <p className="mt-1 text-sm">{order.shipping_address || "No shipping address provided."}</p>
                </div>
              </section>

              <section className="app-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--bedrock-border)] px-6 py-4">
                  <div>
                    <h3 className="text-lg font-semibold">Order lines</h3>
                    <p className="text-sm text-muted">Inventory coverage, price alignment, and supplier cost context for each committed line.</p>
                  </div>
                  <div className="text-sm text-muted">Subtotal {fmtMoney(order.subtotal)} | Tax {fmtMoney(order.tax_total)} | Total {fmtMoney(order.total)}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--bedrock-bg-subtle)] text-left text-xs uppercase tracking-[0.18em] text-muted">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3">Qty</th>
                        <th className="px-4 py-3">Order price</th>
                        <th className="px-4 py-3">Invoice price</th>
                        <th className="px-4 py-3">Available</th>
                        <th className="px-4 py-3">Preferred landed cost</th>
                        <th className="px-4 py-3">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => {
                        const preferredSupplier = line.supplier_options.find((option) => option.is_preferred) ?? line.supplier_options[0];
                        return (
                          <tr key={line.id} className="border-t border-[var(--bedrock-border)] align-top">
                            <td className="px-4 py-4">
                              <div className="font-medium">{line.item_name}</div>
                              {preferredSupplier ? (
                                <div className="mt-1 text-xs text-muted">
                                  Preferred source: {preferredSupplier.supplier_name}
                                  {preferredSupplier.lead_time_days != null ? ` | ${preferredSupplier.lead_time_days}d lead time` : ""}
                                </div>
                              ) : (
                                <div className="mt-1 text-xs text-muted">No supplier mapping yet.</div>
                              )}
                            </td>
                            <td className="px-4 py-4 tabular-nums">{line.quantity}</td>
                            <td className="px-4 py-4 tabular-nums">{fmtMoney(line.unit_price)}</td>
                            <td className="px-4 py-4 tabular-nums">{line.invoice_unit_price == null ? "-" : fmtMoney(line.invoice_unit_price)}</td>
                            <td className="px-4 py-4">
                              <div className="tabular-nums">{line.available_qty}</div>
                              <div className="mt-1 text-xs text-muted">On hand {line.on_hand_qty} | Reserved {line.reserved_qty}</div>
                            </td>
                            <td className="px-4 py-4 tabular-nums">{preferredSupplier ? fmtMoney(preferredSupplier.landed_cost) : "N/A"}</td>
                            <td className="px-4 py-4 font-medium tabular-nums">{fmtMoney(line.line_total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="app-card p-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Execution timeline</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {order.timeline.map((entry) => (
                    <div key={entry.status} className="flex items-start gap-3">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${entry.completed ? "bg-primary" : "bg-slate-300"}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{entry.label}</p>
                          {entry.current ? <SalesOrderStatusBadge status={entry.status} /> : null}
                        </div>
                        <p className="text-sm text-muted">{entry.occurred_at ? fmtDate(entry.occurred_at) : "Pending"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="app-card p-6">
                <h3 className="text-lg font-semibold">Related records</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted">Quote</span>
                    {order.quote_id ? <Link className="text-primary hover:underline" to={`/sales/quotes/${order.quote_id}`}>Open quote #{order.quote_id}</Link> : <span>-</span>}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted">Linked invoice</span>
                    {order.linked_invoice_id ? <Link className="text-primary hover:underline" to={`/sales/invoices/${order.linked_invoice_id}`}>{order.linked_invoice_number || `Invoice #${order.linked_invoice_id}`}</Link> : <span>Not generated</span>}
                  </div>
                </div>
              </section>

              <section className="app-card p-6">
                <h3 className="text-lg font-semibold">Recent orders for this customer</h3>
                <div className="mt-4 space-y-3">
                  {order.customer_recent_orders.length === 0 ? (
                    <p className="text-sm text-muted">No prior orders found for this account.</p>
                  ) : (
                    order.customer_recent_orders.map((related) => (
                      <Link key={related.id} className="flex items-center justify-between rounded-xl border border-[var(--bedrock-border)] px-3 py-3 transition hover:border-primary/50 hover:bg-[var(--bedrock-bg-subtle)]" to={`/sales/orders/${related.id}`}>
                        <div>
                          <p className="font-medium">{related.request_number}</p>
                          <p className="text-xs text-muted">{fmtDate(related.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <SalesOrderStatusBadge status={related.status} />
                          <p className="mt-1 text-sm font-medium">{fmtMoney(related.total_amount)}</p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
