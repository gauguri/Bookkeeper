type LinkOption = {
  value: string;
  label: string;
  description?: string;
};

export type SupplierItemLinkForm = {
  related_id: string;
  supplier_cost: string;
  freight_cost: string;
  tariff_cost: string;
  supplier_sku: string;
  lead_time_days: string;
  min_order_qty: string;
  notes: string;
  is_preferred: boolean;
};

type SupplierItemLinkModalProps = {
  isOpen: boolean;
  title: string;
  subtitle: string;
  entityLabel: string;
  options: LinkOption[];
  form: SupplierItemLinkForm;
  itemSku?: string;
  unitPrice?: string;
  disableSelection?: boolean;
  primaryActionLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (next: SupplierItemLinkForm) => void;
};

export default function SupplierItemLinkModal({
  isOpen,
  title,
  subtitle,
  entityLabel,
  options,
  form,
  itemSku,
  unitPrice,
  disableSelection,
  primaryActionLabel,
  onClose,
  onSubmit,
  onChange
}: SupplierItemLinkModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={onClose}>
      <div className="app-card w-full max-w-2xl space-y-5 p-6 shadow-glow" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{subtitle}</p>
          <h3 className="text-xl font-semibold">{title}</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{entityLabel}</span>
            <select
              className="app-select w-full"
              value={form.related_id}
              onChange={(event) => onChange({ ...form, related_id: event.target.value })}
              disabled={disableSelection}
            >
              <option value="">Select {entityLabel.toLowerCase()}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.description ? `${option.label} - ${option.description}` : option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Item SKU</p>
            <p className="mt-1 text-sm font-medium">{itemSku || "-"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Unit Price</p>
            <p className="mt-1 text-sm font-medium">{unitPrice || "$0.00"}</p>
          </div>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Supplier Cost</span>
            <input
              className="app-input"
              type="number"
              min="0"
              step="0.01"
              value={form.supplier_cost}
              onChange={(event) => onChange({ ...form, supplier_cost: event.target.value })}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Supplier SKU</span>
            <input
              className="app-input"
              value={form.supplier_sku}
              onChange={(event) => onChange({ ...form, supplier_sku: event.target.value })}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Freight Cost</span>
            <input
              className="app-input"
              type="number"
              min="0"
              step="0.01"
              value={form.freight_cost}
              onChange={(event) => onChange({ ...form, freight_cost: event.target.value })}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Tariff Cost</span>
            <input
              className="app-input"
              type="number"
              min="0"
              step="0.01"
              value={form.tariff_cost}
              onChange={(event) => onChange({ ...form, tariff_cost: event.target.value })}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Lead Time (Days)</span>
            <input
              className="app-input"
              type="number"
              min="0"
              value={form.lead_time_days}
              onChange={(event) => onChange({ ...form, lead_time_days: event.target.value })}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Min Order Qty</span>
            <input
              className="app-input"
              type="number"
              min="0"
              step="0.01"
              value={form.min_order_qty}
              onChange={(event) => onChange({ ...form, min_order_qty: event.target.value })}
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Notes</span>
            <input
              className="app-input"
              value={form.notes}
              onChange={(event) => onChange({ ...form, notes: event.target.value })}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.is_preferred}
            onChange={(event) => onChange({ ...form, is_preferred: event.target.checked })}
          />
          Set as preferred for this item
        </label>

        <div className="flex justify-end gap-2">
          <button className="app-button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="app-button" onClick={onSubmit} disabled={!form.related_id}>
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
