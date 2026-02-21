import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  FileText,
  Package,
  Truck,
} from "lucide-react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";
import CustomerInsightsPanel from "../components/CustomerInsightsPanel";
import SalesRequestTimeline from "../components/sales/SalesRequestTimeline";

/* ---------- types ---------- */

type SupplierOption = {
  supplier_id: number;
  supplier_name: string;
  supplier_cost: number;
  freight_cost: number;
  tariff_cost: number;
  landed_cost: number;
  is_preferred: boolean;
  lead_time_days: number | null;
};

type SalesRequestLineDetail = {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  mwb_unit_price: number | null;
  mwb_confidence: string | null;
  mwb_confidence_score: number | null;
  mwb_explanation: string | null;
  mwb_computed_at: string | null;
  invoice_unit_price: number | null;
  invoice_line_total: number | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  supplier_options: SupplierOption[];
};

type SalesRequestDetail = {
  id: number;
  request_number: string;
  customer_id: number | null;
  customer_name: string | null;
  status: "NEW" | "QUOTED" | "CONFIRMED" | "INVOICED" | "SHIPPED" | "CLOSED" | "LOST" | "CANCELLED";
  created_at: string;
  updated_at: string;
  notes: string | null;
  requested_fulfillment_date: string | null;
  total_amount: number;
  lines: SalesRequestLineDetail[];
  linked_invoice_id: number | null;
  linked_invoice_number: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  linked_invoice_status: string | null;
  linked_invoice_shipped_at: string | null;
  allowed_transitions: Array<SalesRequestDetail["status"]>;
  timeline: TimelineEntry[];
};

type TimelineEntry = {
  status: "NEW" | "QUOTED" | "CONFIRMED" | "INVOICED" | "SHIPPED" | "CLOSED" | "LOST" | "CANCELLED";
  label: string;
  occurred_at: string | null;
  completed: boolean;
  current: boolean;
};

type LineSelection = {
  lineId: number;
  supplierId: number | null;
  unitCost: string;
  unitPriceOverride: string;
  discount: string;
  taxRate: string;
};

type GenerateResult = {
  invoice_id: number;
  invoice_number: string;
  total: string;
  status: string;
};

/* ---------- helpers ---------- */

const statusStyles: Record<string, string> = {
  NEW: "border-slate-400/40 bg-slate-400/10 text-slate-700",
  QUOTED: "border-warning/30 bg-warning/10 text-warning",
  CONFIRMED: "border-primary/30 bg-primary/10 text-primary",
  INVOICED: "border-info/30 bg-info/10 text-info",
  SHIPPED: "border-primary/30 bg-primary/10 text-primary",
  CLOSED: "border-success/30 bg-success/10 text-success",
  LOST: "border-danger/30 bg-danger/10 text-danger",
  CANCELLED: "border-muted/30 bg-muted/10 text-muted",
};

const formatDate = (value?: string | null) => {
  if (!value) return "\u2014";
  if (!value.includes("T")) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

const formatDateForInput = (date: Date) => {
  const tz = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

const num = (v: string) => (v === "" ? 0 : Number(v));

/* ---------- availability badge ---------- */

const AvailabilityBadge = ({
  available,
  needed,
}: {
  available: number;
  needed: number;
}) => {
  if (available >= needed) {
    return (
      <span className="app-badge border-success/30 bg-success/10 text-success">
        {available} avail
      </span>
    );
  }
  if (available > 0) {
    return (
      <span className="app-badge border-warning/30 bg-warning/10 text-warning">
        {available} avail (need {needed})
      </span>
    );
  }
  return (
    <span className="app-badge border-danger/30 bg-danger/10 text-danger">
      Out of stock
    </span>
  );
};

/* ---------- main component ---------- */

export default function SalesRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [detail, setDetail] = useState<SalesRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-line supplier/pricing selections
  const [lineSelections, setLineSelections] = useState<LineSelection[]>([]);

  // Markup and invoice form
  const [markupPercent, setMarkupPercent] = useState("20");
  const [invoiceForm, setInvoiceForm] = useState({
    issue_date: formatDateForInput(new Date()),
    due_date: "",
    notes: "",
    terms: "",
  });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusDraft, setStatusDraft] = useState<SalesRequestDetail["status"] | "">("");
  const [statusNotice, setStatusNotice] = useState("");
  const notice = (location.state as { notice?: string } | null)?.notice || "";

  /* --- data loading --- */

  const loadDetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SalesRequestDetail>(
        `/sales-requests/${id}/detail`
      );
      setDetail(data);
      setStatusDraft(data.status);
    } catch (err) {
      setDetail(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  useEffect(() => {
    if (!location.state?.notice) return;
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  // Initialize line selections once detail loads
  useEffect(() => {
    if (!detail) return;
    setLineSelections(
      detail.lines.map((line) => {
        const preferred = line.supplier_options.find((s) => s.is_preferred);
        return {
          lineId: line.id,
          supplierId: preferred?.supplier_id ?? null,
          unitCost: preferred ? String(preferred.landed_cost) : "",
          unitPriceOverride: "",
          discount: "0",
          taxRate: "0",
        };
      })
    );
  }, [detail]);

  /* --- selection handlers --- */

  const updateSelection = (lineId: number, patch: Partial<LineSelection>) => {
    setLineSelections((prev) =>
      prev.map((sel) => (sel.lineId === lineId ? { ...sel, ...patch } : sel))
    );
  };

  const handleSupplierChange = (lineId: number, supplierId: string) => {
    const line = detail?.lines.find((l) => l.id === lineId);
    if (!line) return;
    const sid = supplierId ? Number(supplierId) : null;
    const supplier = sid
      ? line.supplier_options.find((s) => s.supplier_id === sid)
      : null;
    updateSelection(lineId, {
      supplierId: sid,
      unitCost: supplier ? String(supplier.landed_cost) : "",
    });
  };

  /* --- computed totals --- */

  const totals = useMemo(() => {
    if (!detail) return { totalCost: 0, totalSales: 0, profit: 0 };
    const useInvoiceTotals = detail.status === "CLOSED" && !!detail.linked_invoice_id;
    const markup = num(markupPercent);
    let totalCost = 0;
    let totalSales = 0;

    for (const line of detail.lines) {
      const sel = lineSelections.find((s) => s.lineId === line.id);
      const unitCost = sel ? num(sel.unitCost) : 0;
      const lineCost = unitCost * line.quantity;
      totalCost += lineCost;

      let lineSalePrice: number;
      if (useInvoiceTotals && line.invoice_line_total != null) {
        lineSalePrice = line.invoice_line_total;
      } else if (sel?.unitPriceOverride && num(sel.unitPriceOverride) > 0) {
        lineSalePrice = num(sel.unitPriceOverride) * line.quantity;
      } else if (unitCost > 0) {
        lineSalePrice = unitCost * (1 + markup / 100) * line.quantity;
      } else {
        lineSalePrice = line.unit_price * line.quantity;
      }
      const discount = sel ? num(sel.discount) : 0;
      const taxRate = sel ? num(sel.taxRate) : 0;
      const afterDiscount = lineSalePrice - discount;
      const afterTax = afterDiscount * (1 + taxRate);
      totalSales += afterTax;
    }

    const finalTotalSales = useInvoiceTotals ? detail.total_amount : totalSales;

    return {
      totalCost,
      totalSales: finalTotalSales,
      profit: finalTotalSales - totalCost,
    };
  }, [detail, lineSelections, markupPercent]);

  /* --- generate invoice --- */

  const handleGenerateInvoice = async () => {
    if (!detail || !id) return;
    setGenerateError("");

    if (!invoiceForm.issue_date || !invoiceForm.due_date) {
      setGenerateError("Issue date and due date are required.");
      return;
    }
    if (invoiceForm.due_date < invoiceForm.issue_date) {
      setGenerateError("Due date cannot be earlier than issue date.");
      return;
    }

    setGenerating(true);
    try {
      const result = await apiFetch<GenerateResult>(
        `/sales-requests/${id}/generate-invoice`,
        {
          method: "POST",
          body: JSON.stringify({
            issue_date: invoiceForm.issue_date,
            due_date: invoiceForm.due_date,
            notes: invoiceForm.notes || null,
            terms: invoiceForm.terms || null,
            markup_percent: Number(markupPercent),
            line_selections: lineSelections.map((sel) => ({
              sales_request_line_id: sel.lineId,
              supplier_id: sel.supplierId,
              unit_cost: sel.unitCost ? Number(sel.unitCost) : null,
              unit_price:
                sel.unitPriceOverride && num(sel.unitPriceOverride) > 0
                  ? Number(sel.unitPriceOverride)
                  : null,
              discount: Number(sel.discount || 0),
              tax_rate: Number(sel.taxRate || 0),
            })),
          }),
        }
      );
      setGenerateResult(result);
      // Reload detail to reflect CLOSED status and linked invoice
      await loadDetail();
    } catch (err) {
      setGenerateError((err as Error).message || "Failed to generate invoice.");
    } finally {
      setGenerating(false);
    }
  };

  const handleViewInvoice = () => {
    if (!detail) return;
    const invoiceIdentifier = detail.invoice_id ?? detail.invoice_number;
    if (!invoiceIdentifier) return;
    navigate(`/invoices/${invoiceIdentifier}`);
  };
  const handleStatusTransition = async (nextStatus: SalesRequestDetail["status"]) => {
    if (!detail || !id || nextStatus === detail.status) return;
    setStatusError("");
    setStatusNotice("");
    setStatusUpdating(true);
    try {
      const updated = await apiFetch<SalesRequestDetail>(`/sales-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ workflow_status: nextStatus })
      });
      setDetail(updated);
      setStatusDraft(updated.status);
      setStatusNotice(`Workflow updated to ${updated.status.replace(/_/g, " ")}.`);
    } catch (err) {
      setStatusError((err as Error).message || "Unable to update status.");
    } finally {
      setStatusUpdating(false);
    }
  };


  /* --- render states --- */

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="app-skeleton h-4 w-48" />
          <div className="app-skeleton h-8 w-64" />
          <div className="app-skeleton h-4 w-56" />
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="app-card p-5">
              <div className="app-skeleton h-4 w-24" />
              <div className="mt-4 app-skeleton h-6 w-32" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!detail || error) {
    return (
      <section className="space-y-6">
        <div className="app-card p-6">
          <h1 className="text-xl font-semibold">Sales request not found</h1>
          <p className="mt-2 text-sm text-muted">
            {error || "Unable to load this sales request."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="app-button" onClick={loadDetail}>
              Retry
            </button>
            <Link className="app-button-ghost" to="/sales-requests">
              Back to sales requests
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const isClosed = detail.status === "CLOSED";
  const isTerminal = detail.status === "CLOSED" || detail.status === "LOST" || detail.status === "CANCELLED";
  const canGenerateInvoice = detail.status === "CONFIRMED";
  const hasLinkedInvoice = !!detail.linked_invoice_id;

  const primaryTransitionCta: { label: string; target: SalesRequestDetail["status"] } | null =
    detail.status === "NEW"
      ? { label: "Mark as Quoted", target: "QUOTED" }
      : detail.status === "QUOTED"
        ? { label: "Confirm & Reserve Inventory", target: "CONFIRMED" }
        : detail.status === "CONFIRMED"
          ? { label: "Generate Invoice", target: "INVOICED" }
          : detail.status === "INVOICED"
            ? { label: "Mark Shipped", target: "SHIPPED" }
            : detail.status === "SHIPPED"
              ? { label: "Close", target: "CLOSED" }
              : null;

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <nav className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            <Link to="/sales" className="hover:text-foreground">
              Sales
            </Link>{" "}
            /{" "}
            <Link to="/sales-requests" className="hover:text-foreground">
              Sales Requests
            </Link>{" "}
            /{" "}
            <span className="text-foreground">{detail.request_number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{detail.request_number}</h1>
            <span
              className={`app-badge ${statusStyles[detail.status] ?? "border-border bg-secondary"}`}
            >
              {detail.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-muted">
            {detail.customer_name ?? "Walk-in customer"}
            {detail.requested_fulfillment_date
              ? ` \u00B7 Fulfillment: ${detail.requested_fulfillment_date}`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {(detail.status === "NEW" || detail.status === "QUOTED") && !hasLinkedInvoice ? (
            <button className="app-button-secondary" type="button" onClick={() => navigate(`/sales-requests/${detail.id}/edit`)}>
              Update
            </button>
          ) : null}
          <Link className="app-button-ghost" to="/sales-requests">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </div>

      {notice ? <section className="app-card p-4 text-sm text-success">{notice}</section> : null}

      <section className="app-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium">Workflow status</label>
            <select
              className="app-select w-64"
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as SalesRequestDetail["status"])}
              disabled={statusUpdating || isTerminal || detail.allowed_transitions.length === 0}
            >
              <option value={detail.status}>{detail.status.replace(/_/g, " ")}</option>
              {detail.allowed_transitions.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button
              className="app-button-secondary"
              type="button"
              disabled={statusUpdating || !statusDraft || statusDraft === detail.status}
              onClick={() => void handleStatusTransition(statusDraft as SalesRequestDetail["status"])}
            >
              Update Status
            </button>
            {statusUpdating ? <span className="text-xs text-muted">Updating…</span> : null}
          </div>
          {primaryTransitionCta && detail.allowed_transitions.includes(primaryTransitionCta.target) ? (
            <button
              className="app-button"
              type="button"
              disabled={statusUpdating}
              onClick={() => void handleStatusTransition(primaryTransitionCta.target)}
            >
              {primaryTransitionCta.label}
            </button>
          ) : null}
        </div>
        {statusNotice ? <p className="text-sm text-success">{statusNotice}</p> : null}
        {statusError ? <p className="text-sm text-danger">{statusError}</p> : null}
      </section>

      {/* Stat cards */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Requested Total
          </p>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {currency(detail.total_amount)}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Line Items
          </p>
          <p className="mt-3 text-2xl font-semibold">{detail.lines.length}</p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Status
          </p>
          <p className="mt-3 text-2xl font-semibold">
            {detail.status.replace(/_/g, " ")}
          </p>
        </div>
        <div className="app-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Customer
          </p>
          <p className="mt-3 text-lg font-semibold">
            {detail.customer_name ?? "Walk-in"}
          </p>
        </div>
      </div>

      {/* Notes */}
      {detail.notes && (
        <div className="app-card p-4 text-sm text-muted">
          <span className="font-semibold text-foreground">Notes:</span>{" "}
          {detail.notes}
        </div>
      )}

      {/* Linked invoice banner */}
      {hasLinkedInvoice && (
        <div className="app-card border-success/40 bg-success/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="font-semibold">Invoice generated</p>
                <p className="text-sm text-muted">
                  {detail.linked_invoice_number}
                </p>
                {detail.linked_invoice_status && (
                  <p className="mt-1 text-xs text-muted">
                    Invoice status: {detail.linked_invoice_status.replace(/_/g, " ")}
                    {detail.linked_invoice_shipped_at
                      ? ` · Shipped ${formatDate(detail.linked_invoice_shipped_at)}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
            <button
              className="app-button"
              type="button"
              onClick={handleViewInvoice}
              disabled={!detail.invoice_id && !detail.invoice_number}
            >
              <FileText className="h-4 w-4" /> View Invoice
            </button>
          </div>
        </div>
      )}

      {generateResult && !hasLinkedInvoice && (
        <div className="app-card border-success/40 bg-success/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="font-semibold">Invoice created</p>
                <p className="text-sm text-muted">
                  {generateResult.invoice_number} &mdash; Total:{" "}
                  {currency(Number(generateResult.total))}
                </p>
              </div>
            </div>
            <Link
              className="app-button"
              to={`/invoices/${generateResult.invoice_id}`}
            >
              <FileText className="h-4 w-4" /> View Invoice
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
      {/* Line items with inventory + supplier selection */}
      <div className="app-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Order lines</p>
            <p className="text-xs text-muted">
              Inventory availability and supplier pricing
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Req. Price</th>
                <th className="px-3 py-3">Inventory</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Landed Cost</th>
                <th className="px-3 py-3">Sale Price</th>
                <th className="px-3 py-3">MWB</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => {
                const sel = lineSelections.find((s) => s.lineId === line.id);
                const markup = num(markupPercent);
                const unitCost = sel ? num(sel.unitCost) : 0;
                let computedSalePrice: number;
                if (isTerminal && hasLinkedInvoice && line.invoice_unit_price != null) {
                  computedSalePrice = line.invoice_unit_price;
                } else if (
                  sel?.unitPriceOverride &&
                  num(sel.unitPriceOverride) > 0
                ) {
                  computedSalePrice = num(sel.unitPriceOverride);
                } else if (unitCost > 0) {
                  computedSalePrice = unitCost * (1 + markup / 100);
                } else {
                  computedSalePrice = line.unit_price;
                }

                return (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-3 font-medium">{line.item_name}</td>
                    <td className="px-3 py-3 tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {currency(line.unit_price)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <AvailabilityBadge
                          available={line.available_qty}
                          needed={line.quantity}
                        />
                        <div className="text-xs text-muted">
                          <Package className="mr-1 inline h-3 w-3" />
                          On hand: {line.on_hand_qty} | Reserved:{" "}
                          {line.reserved_qty}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {line.supplier_options.length > 0 ? (
                        <select
                          className="app-select text-sm"
                          value={sel?.supplierId ?? ""}
                          onChange={(e) =>
                            handleSupplierChange(line.id, e.target.value)
                          }
                          disabled={isTerminal}
                        >
                          <option value="">-- Select --</option>
                          {line.supplier_options.map((so) => (
                            <option
                              key={so.supplier_id}
                              value={so.supplier_id}
                            >
                              {so.supplier_name} ({currency(so.landed_cost)})
                              {so.is_preferred ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted">
                          No suppliers
                        </span>
                      )}
                      {sel?.supplierId && (
                        <div className="mt-1 text-xs text-muted">
                          <Truck className="mr-1 inline h-3 w-3" />
                          Lead:{" "}
                          {line.supplier_options.find(
                            (s) => s.supplier_id === sel.supplierId
                          )?.lead_time_days ?? "\u2014"}{" "}
                          days
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {sel?.unitCost ? currency(num(sel.unitCost)) : "\u2014"}
                    </td>
                    <td className="px-3 py-3">
                      {!isTerminal ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium tabular-nums">
                            {currency(computedSalePrice)}
                          </div>
                          <input
                            className="app-input w-24 text-xs"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Override"
                            value={sel?.unitPriceOverride ?? ""}
                            onChange={(e) =>
                              updateSelection(line.id, {
                                unitPriceOverride: e.target.value,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <span className="tabular-nums">
                          {currency(computedSalePrice)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {line.mwb_unit_price != null ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-xs font-medium tabular-nums text-primary underline decoration-dotted hover:decoration-solid disabled:opacity-50 disabled:no-underline"
                            onClick={() => {
                              updateSelection(line.id, { unitPriceOverride: String(line.mwb_unit_price) });
                            }}
                            disabled={isTerminal}
                            title={`Click to apply MWB price. Confidence: ${line.mwb_confidence ?? "—"}`}
                          >
                            {currency(line.mwb_unit_price)}
                          </button>
                          <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            line.mwb_confidence === "High"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : line.mwb_confidence === "Medium"
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-red-500/15 text-red-600"
                          }`}>
                            {line.mwb_confidence ?? "?"}
                          </span>
                          {(() => {
                            const uplift = line.mwb_unit_price! - computedSalePrice;
                            if (Math.abs(uplift) < 0.01) return null;
                            const pct = computedSalePrice > 0 ? ((uplift / computedSalePrice) * 100).toFixed(1) : "0.0";
                            return (
                              <div className={`text-[10px] ${uplift > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {uplift > 0 ? "+" : ""}{currency(uplift)} ({uplift > 0 ? "+" : ""}{pct}%)
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost summary + markup */}
      <div className="app-card p-6 space-y-4">
          <p className="text-sm font-semibold">Cost & Pricing Summary</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted">Markup %</span>
              <input
                className="app-input"
                type="number"
                min="0"
                step="1"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                disabled={isTerminal}
              />
            </label>
          </div>
          <div className="space-y-2 rounded-xl border bg-surface p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Total Landed Cost</span>
              <span className="font-semibold tabular-nums">
                {currency(totals.totalCost)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                Total Sales Price (with {markupPercent}% markup)
              </span>
              <span className="font-semibold tabular-nums">
                {currency(totals.totalSales)}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-muted">Profit</span>
              <span
                className={`font-semibold tabular-nums ${totals.profit >= 0 ? "text-success" : "text-danger"}`}
              >
                {currency(totals.profit)}
                {totals.totalCost > 0 && (
                  <span className="ml-1 text-xs text-muted">
                    ({((totals.profit / totals.totalSales) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
        </div>

        <aside className="space-y-6">
          <SalesRequestTimeline timeline={detail.timeline} formatDate={formatDate} />
          <CustomerInsightsPanel customerId={detail.customer_id} mode="full" />
          <div className="app-card p-6 space-y-4">
          {hasLinkedInvoice ? (
            <>
              <p className="text-sm font-semibold">Invoice</p>
              <div className="flex items-center gap-3 rounded-xl border bg-surface p-4">
                <CheckCircle className="h-5 w-5 text-success" />
                <div>
                  <p className="font-semibold">
                    {detail.linked_invoice_number}
                  </p>
                  <p className="text-xs text-muted">
                    Invoice: {detail.linked_invoice_status?.replace(/_/g, " ") ?? "Created"}
                    {detail.linked_invoice_shipped_at
                      ? ` · Shipped ${formatDate(detail.linked_invoice_shipped_at)}`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                className="app-button w-full justify-center"
                type="button"
                onClick={handleViewInvoice}
                disabled={!detail.invoice_id && !detail.invoice_number}
              >
                <FileText className="h-4 w-4" /> View Invoice
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Generate Invoice</p>
              <p className="text-xs text-muted">Invoice generation is available once request is CONFIRMED.</p>
              {!detail.customer_id && (
                <p className="text-sm text-warning">
                  Walk-in customers require a linked customer record to generate
                  an invoice.
                </p>
              )}
              {generateError && (
                <p className="text-sm text-danger">{generateError}</p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted">Issue Date</span>
                  <input
                    className="app-input"
                    type="date"
                    value={invoiceForm.issue_date}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        issue_date: e.target.value,
                      })
                    }
                    disabled={!canGenerateInvoice}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted">Due Date</span>
                  <input
                    className="app-input"
                    type="date"
                    value={invoiceForm.due_date}
                    onChange={(e) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        due_date: e.target.value,
                      })
                    }
                    disabled={!canGenerateInvoice}
                  />
                </label>
              </div>
              <input
                className="app-input"
                placeholder="Terms (e.g. Net 30)"
                value={invoiceForm.terms}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, terms: e.target.value })
                }
                disabled={!canGenerateInvoice}
              />
              <input
                className="app-input"
                placeholder="Notes"
                value={invoiceForm.notes}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, notes: e.target.value })
                }
                disabled={!canGenerateInvoice}
              />
              <button
                className="app-button w-full justify-center"
                onClick={handleGenerateInvoice}
                disabled={generating || !canGenerateInvoice || !detail.customer_id}
              >
                <FileText className="h-4 w-4" />{" "}
                {generating ? "Generating..." : "Generate Invoice"}
              </button>
            </>
          )}
          </div>
        </aside>
      </div>
    </section>
  );
}
