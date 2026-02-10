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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="app-card w-full max-w-xl space-y-4 p-6 shadow-glow">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{subtitle}</p>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            className="app-select md:col-span-2"
            value={form.related_id}
            onChange={(event) => onChange({ ...form, related_id: event.target.value })}
            disabled={disableSelection}
          >
            <option value="">Select {entityLabel.toLowerCase()}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.description ? `${option.label} · ${option.description}` : option.label}
              </option>
            ))}
          </select>
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Supplier cost"
            value={form.supplier_cost}
            onChange={(event) => onChange({ ...form, supplier_cost: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Freight cost"
            value={form.freight_cost}
            onChange={(event) => onChange({ ...form, freight_cost: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Tariff cost"
            value={form.tariff_cost}
            onChange={(event) => onChange({ ...form, tariff_cost: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Supplier SKU"
            value={form.supplier_sku}
            onChange={(event) => onChange({ ...form, supplier_sku: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            placeholder="Lead time (days)"
            value={form.lead_time_days}
            onChange={(event) => onChange({ ...form, lead_time_days: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Min order qty"
            value={form.min_order_qty}
            onChange={(event) => onChange({ ...form, min_order_qty: event.target.value })}
          />
          <input
            className="app-input md:col-span-2"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
          />
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
          <button className="app-button" onClick={onSubmit}>
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
