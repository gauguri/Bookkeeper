import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { apiFetch } from "../api";
import { formatCurrency } from "../utils/formatters";
import CustomerInsightsPanel from "../components/CustomerInsightsPanel";
import SalesOrderStatusBadge from "../components/sales-orders/SalesOrderStatusBadge";
import SalesOrderKpiRow from "../components/sales-orders/SalesOrderKpiRow";
import SalesOrderLineItemsTable, {
  type LineSelection,
} from "../components/sales-orders/SalesOrderLineItemsTable";
import SalesOrderPricingSummary from "../components/sales-orders/SalesOrderPricingSummary";
import SalesOrderFulfillmentCard from "../components/sales-orders/SalesOrderFulfillmentCard";
import SalesOrderActivityTimeline from "../components/sales-orders/SalesOrderActivityTimeline";
import {
  useSalesRequest360,
  type SalesRequest360Data,
  type SalesRequestDetail,
} from "../hooks/useSalesRequests";

/* ---------- helpers ---------- */

const formatDate = (value?: string | null) => {
  if (!value) return "\u2014";
  if (!value.includes("T")) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

const formatDateForInput = (d: Date) => {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

const num = (v: string) => (v === "" ? 0 : Number(v));

type Tab = "overview" | "line-items" | "pricing" | "fulfillment" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "line-items", label: "Line Items" },
  { key: "pricing", label: "Pricing & Margins" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "activity", label: "Activity" },
];

type GenerateResult = {
  invoice_id: number;
  invoice_number: string;
  total: string;
  status: string;
};

/* ---------- main component ---------- */

export default function SalesRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const salesRequestId = id ? Number(id) : undefined;

  const {
    data: detail,
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useSalesRequest360(salesRequestId);

  const [tab, setTab] = useState<Tab>("overview");

  // Local mutable state for interactivity
  const [lineSelections, setLineSelections] = useState<LineSelection[]>([]);
  const [markupPercent, setMarkupPercent] = useState("20");

  // Invoice form
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

  // Status transition
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusDraft, setStatusDraft] = useState<SalesRequestDetail["status"] | "">("");
  const [statusNotice, setStatusNotice] = useState("");
  const [converting, setConverting] = useState(false);

  const notice = (location.state as { notice?: string } | null)?.notice || "";

  // Clear location state notice on mount
  useEffect(() => {
    if (!location.state?.notice) return;
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  // Init line selections when detail loads
  useEffect(() => {
    if (!detail) return;
    setLineSelections(
      detail.lines.map((line) => {
        const preferred = line.supplier_options.find((s) => s.is_preferred);
        return {
          lineId: line.id,
          supplierId: preferred?.supplier_id ?? null,
          unitCost: preferred ? String(Number(preferred.landed_cost)) : "",
          unitPriceOverride: "",
          discount: "0",
          taxRate: "0",
        };
      })
    );
    setStatusDraft(detail.status);
  }, [detail]);

  /* ── selection handlers ── */

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
      unitCost: supplier ? String(Number(supplier.landed_cost)) : "",
    });
  };

  /* ── computed totals ── */

  const totals = useMemo(() => {
    if (!detail) return { totalCost: 0, totalSales: 0, profit: 0 };
    const useInvoiceTotals =
      detail.status === "CLOSED" && !!detail.linked_invoice_id;
    const markup = num(markupPercent);
    let totalCost = 0;
    let totalSales = 0;

    for (const line of detail.lines) {
      const sel = lineSelections.find((s) => s.lineId === line.id);
      const unitCost = sel ? num(sel.unitCost) : 0;
      totalCost += unitCost * Number(line.quantity);

      let lineSalePrice: number;
      if (useInvoiceTotals && line.invoice_line_total != null) {
        lineSalePrice = Number(line.invoice_line_total);
      } else if (sel?.unitPriceOverride && num(sel.unitPriceOverride) > 0) {
        lineSalePrice = num(sel.unitPriceOverride) * Number(line.quantity);
      } else if (unitCost > 0) {
        lineSalePrice = unitCost * (1 + markup / 100) * Number(line.quantity);
      } else {
        lineSalePrice = Number(line.unit_price) * Number(line.quantity);
      }
      const discount = sel ? num(sel.discount) : 0;
      const taxRate = sel ? num(sel.taxRate) : 0;
      const afterDiscount = lineSalePrice - discount;
      const afterTax = afterDiscount * (1 + taxRate);
      totalSales += afterTax;
    }

    const finalTotalSales = useInvoiceTotals
      ? Number(detail.total_amount)
      : totalSales;

    return {
      totalCost,
      totalSales: finalTotalSales,
      profit: finalTotalSales - totalCost,
    };
  }, [detail, lineSelections, markupPercent]);

  /* ── status transition ── */

  const handleStatusTransition = async (
    nextStatus: SalesRequestDetail["status"]
  ) => {
    if (!detail || !id || nextStatus === detail.status) return;
    setStatusError("");
    setStatusNotice("");
    setStatusUpdating(true);
    try {
      await apiFetch(`/sales-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ workflow_status: nextStatus }),
      });
      await refetch();
      setStatusNotice(
        `Workflow updated to ${nextStatus.replace(/_/g, " ")}.`
      );
    } catch (err) {
      setStatusError(
        (err as Error).message || "Unable to update status."
      );
    } finally {
      setStatusUpdating(false);
    }
  };


  const handleConvertToOpportunity = async () => {
    if (!id) return;
    setConverting(true);
    setStatusError("");
    try {
      await apiFetch(`/sales/sales-requests/${id}/convert-to-opportunity`, { method: "POST" });
      setStatusNotice("Sales request converted to opportunity in Sales Command Center.");
    } catch (err) {
      setStatusError((err as Error).message || "Unable to convert sales request.");
    } finally {
      setConverting(false);
    }
  };

  /* ── generate invoice ── */

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
      await refetch();
    } catch (err) {
      setGenerateError(
        (err as Error).message || "Failed to generate invoice."
      );
    } finally {
      setGenerating(false);
    }
  };

  /* ── render states ── */

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="app-skeleton h-4 w-48" />
          <div className="app-skeleton h-8 w-64" />
          <div className="app-skeleton h-4 w-56" />
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card p-4">
              <div className="app-skeleton h-4 w-20" />
              <div className="mt-3 app-skeleton h-6 w-28" />
            </div>
          ))}
        </div>
        <div className="app-skeleton h-64 rounded-xl" />
      </section>
    );
  }

  if (!detail || fetchError) {
    return (
      <section className="space-y-6">
        <div className="app-card p-6">
          <h1 className="text-xl font-semibold">Sales order not found</h1>
          <p className="mt-2 text-sm text-muted">
            {fetchError
              ? (fetchError as Error).message
              : "Unable to load this sales order."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="app-button" onClick={() => refetch()}>
              Retry
            </button>
            <Link className="app-button-ghost" to="/sales-requests">
              Back to sales orders
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const isTerminal =
    detail.status === "CLOSED" ||
    detail.status === "LOST" ||
    detail.status === "CANCELLED";
  const canGenerateInvoice = detail.status === "CONFIRMED";
  const hasLinkedInvoice = !!detail.linked_invoice_id;

  const primaryTransitionCta:
    | { label: string; target: SalesRequestDetail["status"] }
    | null =
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
    <section className="space-y-6">
      {/* Back link */}
      <Link
        to="/sales-requests"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Sales Orders
      </Link>

      {/* Header Card */}
      <div className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold">
                  {detail.request_number}
                </h1>
                <SalesOrderStatusBadge status={detail.status} size="md" />
              </div>
              <p className="text-sm text-muted">
                {detail.customer_id ? (
                  <Link
                    to={`/sales/customers/${detail.customer_id}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {detail.customer_name}
                  </Link>
                ) : (
                  detail.customer_name ?? "Walk-in customer"
                )}
                {detail.requested_fulfillment_date &&
                  ` \u00B7 Fulfillment: ${detail.requested_fulfillment_date}`}
                {" \u00B7 Created: "}
                {formatDate(detail.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(detail.status === "NEW" || detail.status === "QUOTED") &&
              !hasLinkedInvoice && (
                <button
                  className="app-button-secondary"
                  onClick={() =>
                    navigate(`/sales-requests/${detail.id}/edit`)
                  }
                >
                  Edit
                </button>
              )}
            <button className="app-button-secondary" onClick={handleConvertToOpportunity} disabled={converting}>
              {converting ? "Converting…" : "Convert to Opportunity"}
            </button>
          </div>
        </div>

        {/* Workflow controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <select
            className="app-select w-56"
            value={statusDraft}
            onChange={(e) =>
              setStatusDraft(
                e.target.value as SalesRequestDetail["status"]
              )
            }
            disabled={
              statusUpdating ||
              isTerminal ||
              detail.allowed_transitions.length === 0
            }
          >
            <option value={detail.status}>
              {detail.status.replace(/_/g, " ")}
            </option>
            {detail.allowed_transitions.map((st) => (
              <option key={st} value={st}>
                {st.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button
            className="app-button-secondary"
            disabled={
              statusUpdating ||
              !statusDraft ||
              statusDraft === detail.status
            }
            onClick={() =>
              handleStatusTransition(
                statusDraft as SalesRequestDetail["status"]
              )
            }
          >
            Update Status
          </button>
          {primaryTransitionCta &&
            detail.allowed_transitions.includes(
              primaryTransitionCta.target
            ) && (
              <button
                className="app-button"
                disabled={statusUpdating}
                onClick={() =>
                  handleStatusTransition(primaryTransitionCta.target)
                }
              >
                {primaryTransitionCta.label}
              </button>
            )}
          {statusUpdating && (
            <span className="text-xs text-muted">Updating\u2026</span>
          )}
        </div>
        {statusNotice && (
          <p className="mt-2 text-sm text-success">{statusNotice}</p>
        )}
        {statusError && (
          <p className="mt-2 text-sm text-danger">{statusError}</p>
        )}
      </div>

      {notice && (
        <section className="app-card p-4 text-sm text-success">
          {notice}
        </section>
      )}

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
                  {detail.linked_invoice_status &&
                    ` \u00B7 ${detail.linked_invoice_status.replace(/_/g, " ")}`}
                </p>
              </div>
            </div>
            <button
              className="app-button"
              onClick={() =>
                navigate(`/invoices/${detail.invoice_id ?? detail.invoice_number}`)
              }
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
                  {formatCurrency(Number(generateResult.total), true)}
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

      {/* KPI Row */}
      {detail.kpis && <SalesOrderKpiRow kpis={detail.kpis} />}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main layout: content + sidebar */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          {/* ── Overview Tab ── */}
          {tab === "overview" && (
            <>
              {/* Quick summary */}
              <div className="app-card p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Order Summary</p>
                    <p className="text-xs text-muted">
                      {detail.lines.length} line items \u00B7{" "}
                      {formatCurrency(Number(detail.total_amount), true)} total
                    </p>
                  </div>
                </div>

                {/* Preview first 5 lines */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-widest text-muted">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit Price</th>
                        <th className="px-3 py-2">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.slice(0, 5).map((line) => (
                        <tr
                          key={line.id}
                          className="border-t border-border/60"
                        >
                          <td className="px-3 py-2 font-medium">
                            {line.item_name}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {Number(line.quantity)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatCurrency(Number(line.unit_price), true)}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-medium">
                            {formatCurrency(Number(line.line_total), true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.lines.length > 5 && (
                    <button
                      className="mt-2 text-xs text-primary hover:underline"
                      onClick={() => setTab("line-items")}
                    >
                      View all {detail.lines.length} line items \u2192
                    </button>
                  )}
                </div>
              </div>

              {/* Cost summary */}
              <SalesOrderPricingSummary
                totals={totals}
                markupPercent={markupPercent}
                onMarkupChange={setMarkupPercent}
                isTerminal={isTerminal}
              />
            </>
          )}

          {/* ── Line Items Tab ── */}
          {tab === "line-items" && (
            <div className="app-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Order Lines</p>
                  <p className="text-xs text-muted">
                    Inventory availability and supplier pricing
                  </p>
                </div>
              </div>
              <SalesOrderLineItemsTable
                lines={detail.lines}
                lineSelections={lineSelections}
                markupPercent={markupPercent}
                isTerminal={isTerminal}
                hasLinkedInvoice={hasLinkedInvoice}
                onSupplierChange={handleSupplierChange}
                onSelectionUpdate={updateSelection}
              />
            </div>
          )}

          {/* ── Pricing & Margins Tab ── */}
          {tab === "pricing" && (
            <>
              <SalesOrderPricingSummary
                totals={totals}
                markupPercent={markupPercent}
                onMarkupChange={setMarkupPercent}
                isTerminal={isTerminal}
              />
              {/* Per-line margin breakdown */}
              <div className="app-card p-6 space-y-4">
                <p className="text-sm font-semibold">Per-Line Margin Breakdown</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-widest text-muted">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Landed Cost</th>
                        <th className="px-3 py-2">Sale Price</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Line Cost</th>
                        <th className="px-3 py-2">Line Revenue</th>
                        <th className="px-3 py-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((line) => {
                        const sel = lineSelections.find(
                          (s) => s.lineId === line.id
                        );
                        const unitCost = sel ? num(sel.unitCost) : 0;
                        const markup = num(markupPercent);
                        let salePrice: number;
                        if (
                          isTerminal &&
                          hasLinkedInvoice &&
                          line.invoice_unit_price != null
                        ) {
                          salePrice = Number(line.invoice_unit_price);
                        } else if (
                          sel?.unitPriceOverride &&
                          num(sel.unitPriceOverride) > 0
                        ) {
                          salePrice = num(sel.unitPriceOverride);
                        } else if (unitCost > 0) {
                          salePrice = unitCost * (1 + markup / 100);
                        } else {
                          salePrice = Number(line.unit_price);
                        }
                        const qty = Number(line.quantity);
                        const lineCost = unitCost * qty;
                        const lineRev = salePrice * qty;
                        const marginPct =
                          lineRev > 0
                            ? ((lineRev - lineCost) / lineRev) * 100
                            : null;
                        return (
                          <tr
                            key={line.id}
                            className="border-t border-border/60"
                          >
                            <td className="px-3 py-2 font-medium">
                              {line.item_name}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {unitCost > 0
                                ? formatCurrency(unitCost, true)
                                : "\u2014"}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatCurrency(salePrice, true)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{qty}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {unitCost > 0
                                ? formatCurrency(lineCost, true)
                                : "\u2014"}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-medium">
                              {formatCurrency(lineRev, true)}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {marginPct != null ? (
                                <span
                                  className={`font-semibold ${
                                    marginPct >= 0
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {marginPct.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-muted">{"\u2014"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MWB comparison */}
              {detail.lines.some((l) => l.mwb_unit_price != null) && (
                <div className="app-card p-6 space-y-4">
                  <p className="text-sm font-semibold">
                    MWB Price Comparison
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-widest text-muted">
                        <tr>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2">Quoted Price</th>
                          <th className="px-3 py-2">MWB Price</th>
                          <th className="px-3 py-2">Confidence</th>
                          <th className="px-3 py-2">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines
                          .filter((l) => l.mwb_unit_price != null)
                          .map((line) => {
                            const diff =
                              Number(line.mwb_unit_price!) -
                              Number(line.unit_price);
                            const pct =
                              Number(line.unit_price) > 0
                                ? (diff / Number(line.unit_price)) * 100
                                : 0;
                            return (
                              <tr
                                key={line.id}
                                className="border-t border-border/60"
                              >
                                <td className="px-3 py-2 font-medium">
                                  {line.item_name}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  {formatCurrency(
                                    Number(line.unit_price),
                                    true
                                  )}
                                </td>
                                <td className="px-3 py-2 tabular-nums font-medium">
                                  {formatCurrency(
                                    Number(line.mwb_unit_price),
                                    true
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      line.mwb_confidence === "High"
                                        ? "bg-emerald-500/15 text-emerald-600"
                                        : line.mwb_confidence === "Medium"
                                          ? "bg-amber-500/15 text-amber-600"
                                          : "bg-red-500/15 text-red-600"
                                    }`}
                                  >
                                    {line.mwb_confidence}
                                  </span>
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  <span
                                    className={
                                      diff > 0
                                        ? "text-emerald-600"
                                        : diff < 0
                                          ? "text-red-600"
                                          : "text-muted"
                                    }
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {formatCurrency(diff, true)} (
                                    {pct.toFixed(1)}%)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Fulfillment Tab ── */}
          {tab === "fulfillment" && (
            <SalesOrderFulfillmentCard
              lines={detail.lines}
              fulfillmentDate={detail.requested_fulfillment_date}
              linkedInvoiceId={detail.linked_invoice_id}
              linkedInvoiceNumber={detail.linked_invoice_number}
              linkedInvoiceStatus={detail.linked_invoice_status}
              linkedInvoiceShippedAt={detail.linked_invoice_shipped_at}
              status={detail.status}
            />
          )}

          {/* ── Activity Tab ── */}
          {tab === "activity" && (
            <SalesOrderActivityTimeline
              timeline={detail.timeline}
              formatDate={formatDate}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Timeline (compact, always visible) */}
          {tab !== "activity" && (
            <SalesOrderActivityTimeline
              timeline={detail.timeline}
              formatDate={formatDate}
            />
          )}

          {/* Customer insights */}
          <CustomerInsightsPanel
            customerId={detail.customer_id}
            mode="full"
          />

          {/* Customer's recent orders */}
          {detail.customer_recent_orders &&
            detail.customer_recent_orders.length > 0 && (
              <div className="app-card p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  Recent Orders from Customer
                </p>
                <div className="space-y-2">
                  {detail.customer_recent_orders.map((o) => (
                    <Link
                      key={o.id}
                      to={`/sales-requests/${o.id}`}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
                    >
                      <div>
                        <span className="font-medium text-primary">
                          {o.request_number}
                        </span>
                        <SalesOrderStatusBadge
                          status={o.status}
                          size="sm"
                        />
                      </div>
                      <span className="tabular-nums text-muted">
                        {formatCurrency(Number(o.total_amount), true)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          {/* Invoice panel */}
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
                      Invoice:{" "}
                      {detail.linked_invoice_status?.replace(/_/g, " ") ??
                        "Created"}
                      {detail.linked_invoice_shipped_at &&
                        ` \u00B7 Shipped ${formatDate(detail.linked_invoice_shipped_at)}`}
                    </p>
                  </div>
                </div>
                <button
                  className="app-button w-full justify-center"
                  onClick={() =>
                    navigate(
                      `/invoices/${detail.invoice_id ?? detail.invoice_number}`
                    )
                  }
                >
                  <FileText className="h-4 w-4" /> View Invoice
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Generate Invoice</p>
                <p className="text-xs text-muted">
                  Available once request is CONFIRMED.
                </p>
                {!detail.customer_id && (
                  <p className="text-sm text-warning">
                    Walk-in customers require a linked customer record.
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
                    setInvoiceForm({
                      ...invoiceForm,
                      terms: e.target.value,
                    })
                  }
                  disabled={!canGenerateInvoice}
                />
                <input
                  className="app-input"
                  placeholder="Notes"
                  value={invoiceForm.notes}
                  onChange={(e) =>
                    setInvoiceForm({
                      ...invoiceForm,
                      notes: e.target.value,
                    })
                  }
                  disabled={!canGenerateInvoice}
                />
                <button
                  className="app-button w-full justify-center"
                  onClick={handleGenerateInvoice}
                  disabled={
                    generating ||
                    !canGenerateInvoice ||
                    !detail.customer_id
                  }
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
