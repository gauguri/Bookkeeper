import { Package, Truck } from "lucide-react";
import type { SalesRequestLineDetail } from "../../hooks/useSalesRequests";
import { formatCurrency } from "../../utils/formatters";

/* ── availability badge ── */

function AvailabilityBadge({ available, needed }: { available: number; needed: number }) {
  if (Number(available) >= Number(needed)) {
    return (
      <span className="app-badge border-success/30 bg-success/10 text-success">
        {Number(available)} avail
      </span>
    );
  }
  if (Number(available) > 0) {
    return (
      <span className="app-badge border-warning/30 bg-warning/10 text-warning">
        {Number(available)} avail (need {Number(needed)})
      </span>
    );
  }
  return (
    <span className="app-badge border-danger/30 bg-danger/10 text-danger">
      Out of stock
    </span>
  );
}

/* ── types ── */

export type LineSelection = {
  lineId: number;
  supplierId: number | null;
  unitCost: string;
  unitPriceOverride: string;
  discount: string;
  taxRate: string;
};

type Props = {
  lines: SalesRequestLineDetail[];
  lineSelections: LineSelection[];
  markupPercent: string;
  isTerminal: boolean;
  hasLinkedInvoice: boolean;
  onSupplierChange: (lineId: number, supplierId: string) => void;
  onSelectionUpdate: (lineId: number, patch: Partial<LineSelection>) => void;
};

const num = (v: string) => (v === "" ? 0 : Number(v));

export default function SalesOrderLineItemsTable({
  lines,
  lineSelections,
  markupPercent,
  isTerminal,
  hasLinkedInvoice,
  onSupplierChange,
  onSelectionUpdate,
}: Props) {
  return (
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
            <th className="px-3 py-3">Margin</th>
            <th className="px-3 py-3">MWB</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const sel = lineSelections.find((s) => s.lineId === line.id);
            const markup = num(markupPercent);
            const unitCost = sel ? num(sel.unitCost) : 0;

            let computedSalePrice: number;
            if (isTerminal && hasLinkedInvoice && line.invoice_unit_price != null) {
              computedSalePrice = Number(line.invoice_unit_price);
            } else if (sel?.unitPriceOverride && num(sel.unitPriceOverride) > 0) {
              computedSalePrice = num(sel.unitPriceOverride);
            } else if (unitCost > 0) {
              computedSalePrice = unitCost * (1 + markup / 100);
            } else {
              computedSalePrice = Number(line.unit_price);
            }

            const lineMargin =
              unitCost > 0
                ? ((computedSalePrice - unitCost) / computedSalePrice) * 100
                : null;

            return (
              <tr key={line.id} className="border-t border-border/60">
                <td className="px-3 py-3 font-medium">{line.item_name}</td>
                <td className="px-3 py-3 tabular-nums">{Number(line.quantity)}</td>
                <td className="px-3 py-3 tabular-nums">
                  {formatCurrency(Number(line.unit_price), true)}
                </td>
                <td className="px-3 py-3">
                  <div className="space-y-1">
                    <AvailabilityBadge
                      available={Number(line.available_qty)}
                      needed={Number(line.quantity)}
                    />
                    <div className="text-xs text-muted">
                      <Package className="mr-1 inline h-3 w-3" />
                      On hand: {Number(line.on_hand_qty)} | Reserved:{" "}
                      {Number(line.reserved_qty)}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {line.supplier_options.length > 0 ? (
                    <select
                      className="app-select text-sm"
                      value={sel?.supplierId ?? ""}
                      onChange={(e) => onSupplierChange(line.id, e.target.value)}
                      disabled={isTerminal}
                    >
                      <option value="">-- Select --</option>
                      {line.supplier_options.map((so) => (
                        <option key={so.supplier_id} value={so.supplier_id}>
                          {so.supplier_name} (
                          {formatCurrency(Number(so.landed_cost), true)})
                          {so.is_preferred ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted">No suppliers</span>
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
                  {sel?.unitCost
                    ? formatCurrency(num(sel.unitCost), true)
                    : "\u2014"}
                </td>
                <td className="px-3 py-3">
                  {!isTerminal ? (
                    <div className="space-y-1">
                      <div className="text-sm font-medium tabular-nums">
                        {formatCurrency(computedSalePrice, true)}
                      </div>
                      <input
                        className="app-input w-24 text-xs"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Override"
                        value={sel?.unitPriceOverride ?? ""}
                        onChange={(e) =>
                          onSelectionUpdate(line.id, {
                            unitPriceOverride: e.target.value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <span className="tabular-nums">
                      {formatCurrency(computedSalePrice, true)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {lineMargin != null ? (
                    <span
                      className={`text-sm font-semibold ${
                        lineMargin >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {lineMargin.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {line.mwb_unit_price != null ? (
                    <div className="space-y-1">
                      <button
                        type="button"
                        className="text-xs font-medium tabular-nums text-primary underline decoration-dotted hover:decoration-solid disabled:opacity-50 disabled:no-underline"
                        onClick={() =>
                          onSelectionUpdate(line.id, {
                            unitPriceOverride: String(line.mwb_unit_price),
                          })
                        }
                        disabled={isTerminal}
                        title={`Apply MWB price. Confidence: ${line.mwb_confidence ?? "\u2014"}`}
                      >
                        {formatCurrency(Number(line.mwb_unit_price), true)}
                      </button>
                      <span
                        className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          line.mwb_confidence === "High"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : line.mwb_confidence === "Medium"
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-red-500/15 text-red-600"
                        }`}
                      >
                        {line.mwb_confidence ?? "?"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
