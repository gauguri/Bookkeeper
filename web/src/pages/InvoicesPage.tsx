import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type Customer = {
  id: number;
  name: string;
};

type Item = {
  id: number;
  name: string;
  unit_price: number;
  preferred_supplier_id?: number | null;
  preferred_supplier_name?: string | null;
  preferred_landed_cost?: number | null;
};

type InvoiceList = {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: number;
  amount_due: number;
};

type LineItem = {
  item_id?: number;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  supplier_id?: number;
  override_cost: boolean;
  discount: string;
  tax_rate: string;
  landed_unit_cost: string;
  margin_threshold_percent: number;
};

type SupplierLink = {
  supplier_id: number;
  item_id: number;
  supplier_name: string;
  landed_cost: number;
  is_preferred: boolean;
};

const emptyLine: LineItem = {
  item_id: undefined,
  description: "",
  quantity: "1",
  unit_price: "",
  unit_cost: "",
  supplier_id: undefined,
  override_cost: false,
  discount: "0",
  tax_rate: "0",
  landed_unit_cost: "0",
  margin_threshold_percent: 20
};

type PricingContextResponse = {
  landed_unit_cost: number;
  available_qty: number;
  recommended_price: number;
  margin_threshold_percent: number;
};

const statusStyles: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-muted",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
  SHIPPED: "border-info/30 bg-info/10 text-info",
  PAID: "border-success/30 bg-success/10 text-success",
  VOID: "border-danger/30 bg-danger/10 text-danger"
};

const formatNumber = (value: string) => (value === "" ? 0 : Number(value));

const parseTermsDays = (terms: string) => {
  if (!terms.trim()) {
    return null;
  }
  const normalized = terms.trim().toLowerCase();
  if (normalized === "due on receipt") {
    return 0;
  }
  const netMatch = normalized.match(/net\s*(\d+)/);
  if (netMatch) {
    return Number(netMatch[1]);
  }
  return null;
};

const formatDateForInput = (date: Date) => {
  const timezoneAdjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return timezoneAdjusted.toISOString().slice(0, 10);
};

const addDaysToDateString = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) {
    return dateString;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [invoices, setInvoices] = useState<InvoiceList[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    customer_id: "",
    start_date: "",
    end_date: "",
    min_total: "",
    max_total: ""
  });
  const [form, setForm] = useState({
    customer_id: "",
    issue_date: formatDateForInput(new Date()),
    due_date: "",
    notes: "",
    terms: ""
  });
  const [dueDateWasAuto, setDueDateWasAuto] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([{ ...emptyLine }]);
  const [supplierOptions, setSupplierOptions] = useState<Record<number, SupplierLink[]>>({});

  const loadInvoices = async (filtersOverride = filters) => {
    const params = new URLSearchParams();
    if (filtersOverride.status) {
      params.append("status", filtersOverride.status);
    }
    if (filtersOverride.customer_id) {
      params.append("customer_id", filtersOverride.customer_id);
    }
    if (filtersOverride.start_date) {
      params.append("start_date", filtersOverride.start_date);
    }
    if (filtersOverride.end_date) {
      params.append("end_date", filtersOverride.end_date);
    }
    if (filtersOverride.min_total) {
      params.append("min_total", filtersOverride.min_total);
    }
    if (filtersOverride.max_total) {
      params.append("max_total", filtersOverride.max_total);
    }
    return apiFetch<InvoiceList[]>(`/invoices?${params.toString()}`);
  };

  const loadData = async () => {
    setError("");
    try {
      const invoicesData = await loadInvoices();
      setInvoices(invoicesData);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    const [customersResult, itemsResult] = await Promise.allSettled([apiFetch<Customer[]>("/customers"), apiFetch<Item[]>("/items")]);

    if (customersResult.status === "fulfilled") {
      setCustomers(customersResult.value);
    } else if (!(customersResult.reason as Error).message.toLowerCase().includes("not authorized")) {
      setError((customersResult.reason as Error).message);
    }

    if (itemsResult.status === "fulfilled") {
      setItems(itemsResult.value);
    } else if (!(itemsResult.reason as Error).message.toLowerCase().includes("not authorized")) {
      setError((itemsResult.reason as Error).message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredInvoices = useMemo(() => invoices, [invoices]);

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateLine = (index: number, updated: Partial<LineItem>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...updated } : line)));
  };

  const loadSuppliersForItem = async (itemId: number) => {
    if (supplierOptions[itemId]) {
      return supplierOptions[itemId];
    }
    const data = await apiFetch<SupplierLink[]>(`/items/${itemId}/suppliers`);
    setSupplierOptions((prev) => ({ ...prev, [itemId]: data }));
    return data;
  };

  const resolveLineCost = (itemId: number, supplierId?: number) => {
    const suppliers = supplierOptions[itemId] ?? [];
    const matched = suppliers.find((link) => link.supplier_id === supplierId);
    if (matched) {
      return matched.landed_cost.toString();
    }
    const preferred = suppliers.find((link) => link.is_preferred);
    if (preferred) {
      return preferred.landed_cost.toString();
    }
    const item = items.find((entry) => entry.id === itemId);
    if (item?.preferred_landed_cost != null) {
      return item.preferred_landed_cost.toString();
    }
    return "";
  };

  const handleItemChange = async (index: number, itemId: string) => {
    const item = items.find((entry) => entry.id === Number(itemId));
    if (!item) {
      updateLine(index, {
        item_id: undefined,
        description: "",
        unit_price: "",
        unit_cost: "",
        supplier_id: undefined,
        override_cost: false,
        landed_unit_cost: "0",
        margin_threshold_percent: 20
      });
      return;
    }
    updateLine(index, {
      item_id: item.id,
      description: item.name,
      unit_price: item.unit_price.toString(),
      supplier_id: item.preferred_supplier_id ?? undefined,
      unit_cost: item.preferred_landed_cost != null ? item.preferred_landed_cost.toString() : "",
      landed_unit_cost: item.preferred_landed_cost != null ? item.preferred_landed_cost.toString() : "0",
      override_cost: false
    });
    try {
      const customerIdParam = form.customer_id ? `?customer_id=${form.customer_id}` : "";
      const pricingContext = await apiFetch<PricingContextResponse>(`/items/${item.id}/pricing-context${customerIdParam}`);
      updateLine(index, {
        landed_unit_cost: String(pricingContext.landed_unit_cost),
        margin_threshold_percent: pricingContext.margin_threshold_percent,
        unit_price: String(pricingContext.recommended_price),
        unit_cost: String(pricingContext.landed_unit_cost)
      });

      const suppliersForItem = await loadSuppliersForItem(item.id);
      if (suppliersForItem.length > 0) {
        const preferred = suppliersForItem.find((link) => link.is_preferred);
        const supplierId = item.preferred_supplier_id ?? preferred?.supplier_id;
        if (supplierId) {
          const selectedSupplierCost = suppliersForItem.find((link) => link.supplier_id === supplierId)?.landed_cost.toString();
          updateLine(index, {
            supplier_id: supplierId,
            unit_cost: selectedSupplierCost ?? "",
            landed_unit_cost: selectedSupplierCost ?? "0"
          });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const quantity = formatNumber(line.quantity);
        const unitPrice = formatNumber(line.unit_price);
        const discount = formatNumber(line.discount);
        const taxRate = formatNumber(line.tax_rate);
        const lineSubtotal = quantity * unitPrice - discount;
        const lineTax = lineSubtotal * taxRate;
        const lineTotal = lineSubtotal + lineTax;
        acc.subtotal += lineSubtotal;
        acc.tax += lineTax;
        acc.total += lineTotal;
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 }
    );
  }, [lines]);

  const dueDateInvalid =
    Boolean(form.issue_date) && Boolean(form.due_date) && form.due_date < form.issue_date;

  const handleIssueDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextIssueDate = event.target.value;
    const termsDays = parseTermsDays(form.terms);
    let nextDueDate = form.due_date;
    let nextDueAuto = dueDateWasAuto;

    if (nextIssueDate && termsDays !== null && (dueDateWasAuto || !form.due_date)) {
      nextDueDate = addDaysToDateString(nextIssueDate, termsDays);
      nextDueAuto = true;
    }

    setForm({ ...form, issue_date: nextIssueDate, due_date: nextDueDate });
    setDueDateWasAuto(nextDueAuto);
  };

  const handleDueDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, due_date: event.target.value });
    setDueDateWasAuto(false);
  };

  const handleTermsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTerms = event.target.value;
    const termsDays = parseTermsDays(nextTerms);
    let nextDueDate = form.due_date;
    let nextDueAuto = dueDateWasAuto;

    if (!nextTerms.trim()) {
      nextDueAuto = false;
    } else if (termsDays !== null && form.issue_date && (dueDateWasAuto || !form.due_date)) {
      nextDueDate = addDaysToDateString(form.issue_date, termsDays);
      nextDueAuto = true;
    }

    setForm({ ...form, terms: nextTerms, due_date: nextDueDate });
    setDueDateWasAuto(nextDueAuto);
  };

  const createInvoice = async () => {
    if (!form.customer_id || !form.issue_date || !form.due_date) {
      setError("Customer, issue date, and due date are required.");
      return;
    }
    if (dueDateInvalid) {
      setError("Due date cannot be earlier than the invoice date.");
      return;
    }
    const payload = {
      customer_id: Number(form.customer_id),
      issue_date: form.issue_date,
      due_date: form.due_date,
      notes: form.notes || null,
      terms: form.terms || null,
      line_items: lines.map((line) => ({
        item_id: line.item_id ?? null,
        description: line.description || null,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        unit_cost: line.unit_cost ? Number(line.unit_cost) : null,
        supplier_id: line.supplier_id ?? null,
        landed_unit_cost: Number(line.landed_unit_cost || 0),
        discount: Number(line.discount || 0),
        tax_rate: Number(line.tax_rate || 0)
      }))
    };
    try {
      await apiFetch<InvoiceList>("/invoices", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({
        customer_id: "",
        issue_date: formatDateForInput(new Date()),
        due_date: "",
        notes: "",
        terms: ""
      });
      setDueDateWasAuto(false);
      setLines([{ ...emptyLine }]);
      setError("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Invoices</p>
          <h1 className="text-3xl font-semibold">Invoice workflow</h1>
          <p className="text-muted">Create, send, and monitor every invoice lifecycle.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("invoice-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> New invoice
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="app-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Invoice list</h2>
          <button className="app-button-ghost text-xs">Export</button>
        </div>
        <div className="sticky top-0 z-10 mt-4 grid gap-3 bg-surface/95 pb-4 backdrop-blur md:grid-cols-3">
          <select
            className="app-select"
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="SHIPPED">Shipped</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
          <select
            className="app-select"
            value={filters.customer_id}
            onChange={(event) => setFilters({ ...filters, customer_id: event.target.value })}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <input
            className="app-input"
            type="date"
            value={filters.start_date}
            onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
          />
          <input
            className="app-input"
            type="date"
            value={filters.end_date}
            onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Min total"
            value={filters.min_total}
            onChange={(event) => setFilters({ ...filters, min_total: event.target.value })}
          />
          <input
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Max total"
            value={filters.max_total}
            onChange={(event) => setFilters({ ...filters, max_total: event.target.value })}
          />
          <button
            className="app-button"
            onClick={async () => {
              try {
                const data = await loadInvoices();
                setInvoices(data);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Apply filters
          </button>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="py-3">Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Balance</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="app-table-row border-t cursor-pointer hover:bg-secondary/40"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <td className="py-3 font-medium">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/invoices/${invoice.id}`);
                      }}
                    >
                      {invoice.invoice_number}
                    </button>
                  </td>
                  <td className="text-muted">{invoice.customer_name}</td>
                  <td>
                    <span className={`app-badge ${statusStyles[invoice.status] ?? "border-border bg-secondary"}`}>
                      {invoice.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="text-muted tabular-nums">{currency(invoice.total)}</td>
                  <td className="text-muted tabular-nums">{currency(invoice.amount_due)}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="app-button-ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/invoices/${invoice.id}`);
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="app-button-ghost"
                        aria-label="More actions"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-secondary" />
                      <p className="font-semibold">No invoices found</p>
                      <p className="text-sm text-muted">Try adjusting your filters or create a new invoice.</p>
                      <button
                        className="app-button"
                        onClick={() => document.getElementById("invoice-form")?.scrollIntoView()}
                      >
                        Create invoice
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="invoice-form" className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Create invoice</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">New document</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="app-select"
            value={form.customer_id}
            onChange={(event) => setForm({ ...form, customer_id: event.target.value })}
          >
            <option value="">Select customer *</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <label className="space-y-2 text-sm font-medium">
            <span className="text-muted">Invoice date</span>
            <input
              className="app-input"
              type="date"
              value={form.issue_date}
              onChange={handleIssueDateChange}
              placeholder="Invoice date"
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span className="text-muted">Due date</span>
            <input
              className="app-input"
              type="date"
              value={form.due_date}
              onChange={handleDueDateChange}
              placeholder="Due date"
            />
            {dueDateInvalid && <span className="text-xs text-danger">Due date must be on or after invoice date.</span>}
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="app-input"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Terms"
            value={form.terms}
            onChange={handleTermsChange}
          />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1.1fr_1fr_1.1fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2 text-xs uppercase tracking-widest text-muted">
            <span>Item</span>
            <span>Supplier</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Cost</span>
            <span>Discount</span>
            <span>Tax rate</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.1fr_1fr_1.1fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2"
            >
              <select
                className="app-select"
                value={line.item_id ?? ""}
                onChange={(event) => handleItemChange(index, event.target.value)}
              >
                <option value="">Custom</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                className="app-select"
                value={line.supplier_id ?? ""}
                onChange={(event) => {
                  const supplierId = event.target.value ? Number(event.target.value) : undefined;
                  if (!line.item_id) {
                    return;
                  }
                  const nextCost = line.override_cost
                    ? line.unit_cost
                    : resolveLineCost(line.item_id, supplierId);
                  updateLine(index, {
                    supplier_id: supplierId,
                    unit_cost: nextCost
                  });
                }}
                disabled={!line.item_id || (supplierOptions[line.item_id]?.length ?? 0) === 0}
              >
                <option value="">Preferred</option>
                {(line.item_id ? supplierOptions[line.item_id] ?? [] : []).map((supplier) => (
                  <option key={supplier.supplier_id} value={supplier.supplier_id}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
              <input
                className="app-input"
                placeholder="Description"
                value={line.description}
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                value={line.unit_price}
                onChange={(event) => updateLine(index, { unit_price: event.target.value })}
              />
              <div className="space-y-1">
                <input
                  className="app-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_cost}
                  disabled={!line.override_cost}
                  onChange={(event) => updateLine(index, { unit_cost: event.target.value })}
                />
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={line.override_cost}
                    onChange={(event) => {
                      const override = event.target.checked;
                      const nextCost =
                        !override && line.item_id
                          ? resolveLineCost(line.item_id, line.supplier_id)
                          : line.unit_cost;
                      updateLine(index, {
                        override_cost: override,
                        unit_cost: nextCost
                      });
                    }}
                  />
                  Override
                </label>
              </div>
              <input
                className="app-input"
                type="number"
                min="0"
                step="0.01"
                value={line.discount}
                onChange={(event) => updateLine(index, { discount: event.target.value })}
              />
              <input
                className="app-input"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={line.tax_rate}
                onChange={(event) => updateLine(index, { tax_rate: event.target.value })}
              />
              <button className="app-button-ghost text-danger" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                Remove
              </button>
              <div className="col-span-full text-xs text-muted">
                {(() => {
                  const qty = Number(line.quantity || 0);
                  const sell = Number(line.unit_price || 0);
                  const landed = Number(line.landed_unit_cost || 0);
                  const marginDollars = (sell - landed) * qty;
                  const marginPercent = sell > 0 ? ((sell - landed) / sell) * 100 : 0;
                  return (
                    <span className={marginPercent < line.margin_threshold_percent ? "text-danger" : ""}>
                      Landed unit cost: {currency(landed)} • Margin: {currency(marginDollars)} ({marginPercent.toFixed(1)}%)
                      {marginPercent < line.margin_threshold_percent ? ` • Below ${line.margin_threshold_percent}% target` : ""}
                    </span>
                  );
                })()}
              </div>
            </div>
          ))}
          <div>
            <button className="app-button-ghost text-sm" onClick={addLine}>
              + Add line
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4">
          <div className="text-sm text-muted">
            <div>Subtotal: {currency(totals.subtotal)}</div>
            <div>Tax: {currency(totals.tax)}</div>
            <div className="font-semibold text-foreground">Total: {currency(totals.total)}</div>
          </div>
          <button className="app-button" onClick={createInvoice} disabled={dueDateInvalid}>
            Create invoice
          </button>
        </div>
      </div>

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("invoice-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}
