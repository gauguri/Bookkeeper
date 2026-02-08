import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  discount: string;
  tax_rate: string;
};

const emptyLine: LineItem = {
  item_id: undefined,
  description: "",
  quantity: "1",
  unit_price: "",
  discount: "0",
  tax_rate: "0"
};

const statusStyles: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-muted",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
  PAID: "border-success/30 bg-success/10 text-success",
  VOID: "border-danger/30 bg-danger/10 text-danger"
};

const formatNumber = (value: string) => (value === "" ? 0 : Number(value));

export default function InvoicesPage() {
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
    issue_date: "",
    due_date: "",
    notes: "",
    terms: ""
  });
  const [lines, setLines] = useState<LineItem[]>([{ ...emptyLine }]);

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
    try {
      const [customersData, itemsData, invoicesData] = await Promise.all([
        apiFetch<Customer[]>("/customers"),
        apiFetch<Item[]>("/items"),
        loadInvoices()
      ]);
      setCustomers(customersData);
      setItems(itemsData);
      setInvoices(invoicesData);
    } catch (err) {
      setError((err as Error).message);
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

  const handleItemChange = (index: number, itemId: string) => {
    const item = items.find((entry) => entry.id === Number(itemId));
    updateLine(index, {
      item_id: item ? item.id : undefined,
      description: item ? item.name : "",
      unit_price: item ? item.unit_price.toString() : ""
    });
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

  const createInvoice = async () => {
    if (!form.customer_id || !form.issue_date || !form.due_date) {
      setError("Customer, issue date, and due date are required.");
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
        discount: Number(line.discount || 0),
        tax_rate: Number(line.tax_rate || 0)
      }))
    };
    try {
      await apiFetch<InvoiceList>("/invoices", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({ customer_id: "", issue_date: "", due_date: "", notes: "", terms: "" });
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
                <tr key={invoice.id} className="app-table-row border-t">
                  <td className="py-3 font-medium">{invoice.invoice_number}</td>
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
                      <Link className="app-button-ghost" to={`/sales/invoices/${invoice.id}`}>
                        View
                      </Link>
                      <button className="app-button-ghost" aria-label="More actions">
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
          <input
            className="app-input"
            type="date"
            value={form.issue_date}
            onChange={(event) => setForm({ ...form, issue_date: event.target.value })}
          />
          <input
            className="app-input"
            type="date"
            value={form.due_date}
            onChange={(event) => setForm({ ...form, due_date: event.target.value })}
          />
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
            onChange={(event) => setForm({ ...form, terms: event.target.value })}
          />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1.2fr_1.2fr_0.6fr_0.7fr_0.7fr_0.6fr_auto] gap-2 text-xs uppercase tracking-widest text-muted">
            <span>Item</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Discount</span>
            <span>Tax rate</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.2fr_1.2fr_0.6fr_0.7fr_0.7fr_0.6fr_auto] gap-2"
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
          <button className="app-button" onClick={createInvoice}>
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
