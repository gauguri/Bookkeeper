import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Invoices</h1>
        <p className="text-slate-600">Create invoices and track balances.</p>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Invoice list</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="border border-slate-300 rounded px-3 py-2 text-sm"
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
            className="border border-slate-300 rounded px-3 py-2 text-sm"
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
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={filters.start_date}
            onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={filters.end_date}
            onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="number"
            min="0"
            step="0.01"
            placeholder="Min total"
            value={filters.min_total}
            onChange={(event) => setFilters({ ...filters, min_total: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="number"
            min="0"
            step="0.01"
            placeholder="Max total"
            value={filters.max_total}
            onChange={(event) => setFilters({ ...filters, max_total: event.target.value })}
          />
          <button
            className="bg-slate-900 text-white rounded px-3 py-2 text-sm"
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
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Balance</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="py-2">{invoice.invoice_number}</td>
                  <td>{invoice.customer_name}</td>
                  <td>{invoice.status}</td>
                  <td>{currency(invoice.total)}</td>
                  <td>{currency(invoice.amount_due)}</td>
                  <td className="text-right">
                    <Link className="text-slate-700" to={`/sales/invoices/${invoice.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Create invoice</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="border border-slate-300 rounded px-3 py-2 text-sm"
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
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={form.issue_date}
            onChange={(event) => setForm({ ...form, issue_date: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            type="date"
            value={form.due_date}
            onChange={(event) => setForm({ ...form, due_date: event.target.value })}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <input
            className="border border-slate-300 rounded px-3 py-2 text-sm"
            placeholder="Terms"
            value={form.terms}
            onChange={(event) => setForm({ ...form, terms: event.target.value })}
          />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1.2fr_1.2fr_0.6fr_0.7fr_0.7fr_0.6fr_auto] gap-2 text-xs text-slate-500">
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
                className="border border-slate-300 rounded px-2 py-1 text-sm"
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
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                placeholder="Description"
                value={line.description}
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
              <input
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                type="number"
                min="0"
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
              />
              <input
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={line.unit_price}
                onChange={(event) => updateLine(index, { unit_price: event.target.value })}
              />
              <input
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={line.discount}
                onChange={(event) => updateLine(index, { discount: event.target.value })}
              />
              <input
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={line.tax_rate}
                onChange={(event) => updateLine(index, { tax_rate: event.target.value })}
              />
              <button className="text-rose-600 text-sm" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                Remove
              </button>
            </div>
          ))}
          <div>
            <button className="text-sm text-slate-700" onClick={addLine}>
              + Add line
            </button>
          </div>
        </div>

        <div className="flex justify-between flex-wrap gap-4">
          <div className="text-sm text-slate-600">
            <div>Subtotal: {currency(totals.subtotal)}</div>
            <div>Tax: {currency(totals.tax)}</div>
            <div className="font-semibold text-slate-900">Total: {currency(totals.total)}</div>
          </div>
          <button className="bg-slate-900 text-white rounded px-4 py-2 text-sm" onClick={createInvoice}>
            Create invoice
          </button>
        </div>
      </div>
    </section>
  );
}
