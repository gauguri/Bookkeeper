import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  XCircle
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

type Customer = { id: number; name: string; terms?: string | null };
type Item = {
  id: number;
  name: string;
  unit_price: number;
  preferred_supplier_id?: number | null;
  preferred_landed_cost?: number | null;
};
type SupplierLink = {
  supplier_id: number;
  item_id: number;
  supplier_name: string;
  landed_cost: number;
  is_preferred: boolean;
};

type Invoice = {
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

type InvoiceLine = {
  id: number;
  description?: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  line_total: number;
};

type InvoiceDetail = {
  id: number;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: number;
  amount_due: number;
  customer?: { id: number; name: string };
  customer_name?: string;
  notes?: string;
  terms?: string;
  updated_at?: string;
  created_at?: string;
  line_items?: InvoiceLine[];
  lines?: InvoiceLine[];
  payments?: Array<{ payment_id: number; payment_date: string; applied_amount: number }>;
};

type LineItemForm = {
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

type PricingContextResponse = {
  landed_unit_cost: number;
  recommended_price: number;
  margin_threshold_percent: number;
};

type QueueKey = "needs-attention" | "drafts" | "overdue" | "sent-unpaid" | "paid" | "void" | "all";
type Density = "comfortable" | "compact";

type KpiTile = {
  key: QueueKey;
  label: string;
  value: string;
  meta: string;
};

const todayISO = new Date().toISOString().slice(0, 10);
const emptyLine: LineItemForm = {
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

const statusStyles: Record<string, string> = {
  DRAFT: "border-border bg-secondary text-muted",
  SENT: "border-primary/30 bg-primary/10 text-primary",
  PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
  SHIPPED: "border-info/30 bg-info/10 text-info",
  PAID: "border-success/30 bg-success/10 text-success",
  VOID: "border-danger/30 bg-danger/10 text-danger"
};

const COLUMNS = [
  "invoice_number",
  "customer",
  "status",
  "issue_date",
  "due_date",
  "total",
  "balance",
  "updated"
] as const;

type ColumnKey = (typeof COLUMNS)[number];

const parseTermsDays = (terms: string) => {
  if (!terms.trim()) return null;
  const normalized = terms.trim().toLowerCase();
  if (normalized === "due on receipt") return 0;
  const match = normalized.match(/net\s*(\d+)/);
  return match ? Number(match[1]) : null;
};

const addDays = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return dateString;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMonth = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });

export default function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queue = (searchParams.get("queue") as QueueKey) || "needs-attention";
  const q = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const density = (searchParams.get("density") as Density) || "comfortable";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Record<number, SupplierLink[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);

  const [selected, setSelected] = useState<number[]>([]);
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>([...COLUMNS]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [infoBanner, setInfoBanner] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customer_id: "", issue_date: todayISO, due_date: "", notes: "", terms: "" });
  const [dueDateWasAuto, setDueDateWasAuto] = useState(false);
  const [lines, setLines] = useState<LineItemForm[]>([{ ...emptyLine }]);

  const setParam = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    setSearchParams(params, { replace: true });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [invoiceData, customerData, itemData] = await Promise.all([
        apiFetch<Invoice[]>("/invoices"),
        apiFetch<Customer[]>("/customers"),
        apiFetch<Item[]>("/items")
      ]);
      setInvoices(invoiceData);
      setCustomers(customerData);
      setItems(itemData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isOverdue = (invoice: Invoice) => invoice.amount_due > 0 && invoice.status !== "VOID" && invoice.status !== "PAID" && invoice.due_date < todayISO;
  const isSentUnpaid = (invoice: Invoice) => ["SENT", "PARTIALLY_PAID", "SHIPPED"].includes(invoice.status) && invoice.amount_due > 0;
  const isPaid = (invoice: Invoice) => invoice.status === "PAID" || (invoice.amount_due === 0 && invoice.status !== "VOID");

  const queueBuckets = useMemo(() => {
    const drafts = invoices.filter((inv) => inv.status === "DRAFT");
    const overdue = invoices.filter(isOverdue);
    const sentUnpaid = invoices.filter(isSentUnpaid);
    const paid = invoices.filter(isPaid);
    const voidInvoices = invoices.filter((inv) => inv.status === "VOID");
    const needsAttention = invoices.filter((inv) => inv.status === "DRAFT" || isOverdue(inv));
    return { drafts, overdue, sentUnpaid, paid, voidInvoices, needsAttention, all: invoices };
  }, [invoices]);

  const kpis = useMemo(() => {
    const openBalance = invoices.filter((inv) => inv.status !== "VOID").reduce((sum, inv) => sum + inv.amount_due, 0);
    const overdueBalance = queueBuckets.overdue.reduce((sum, inv) => sum + inv.amount_due, 0);
    const sentUnpaidBalance = queueBuckets.sentUnpaid.reduce((sum, inv) => sum + inv.amount_due, 0);
    const paidMtd = queueBuckets.paid.filter((inv) => inv.issue_date.slice(0, 7) === todayISO.slice(0, 7));
    const paidMtdAmount = paidMtd.reduce((sum, inv) => sum + inv.total, 0);

    return [
      { key: "all", label: "Open Balance", value: currency(openBalance), meta: `${invoices.filter((i) => i.amount_due > 0).length} open` },
      { key: "overdue", label: "Overdue", value: currency(overdueBalance), meta: `${queueBuckets.overdue.length} invoices` },
      { key: "drafts", label: "Drafts", value: String(queueBuckets.drafts.length), meta: "Needs review" },
      { key: "sent-unpaid", label: "Sent / Unpaid", value: currency(sentUnpaidBalance), meta: `${queueBuckets.sentUnpaid.length} invoices` },
      { key: "paid", label: "Paid (MTD)", value: currency(paidMtdAmount), meta: `${paidMtd.length} invoices` },
      { key: "void", label: "Void", value: String(queueBuckets.voidInvoices.length), meta: "Cancelled" }
    ] as KpiTile[];
  }, [invoices, queueBuckets]);

  const filtered = useMemo(() => {
    let source: Invoice[] = [];
    if (queue === "drafts") source = queueBuckets.drafts;
    else if (queue === "overdue") source = queueBuckets.overdue;
    else if (queue === "sent-unpaid") source = queueBuckets.sentUnpaid;
    else if (queue === "paid") source = queueBuckets.paid;
    else if (queue === "void") source = queueBuckets.voidInvoices;
    else if (queue === "all") source = queueBuckets.all;
    else source = queueBuckets.needsAttention;

    if (statusFilter) source = source.filter((inv) => inv.status === statusFilter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      source = source.filter((inv) => inv.invoice_number.toLowerCase().includes(needle) || inv.customer_name.toLowerCase().includes(needle));
    }

    return source.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }, [queue, queueBuckets, q, statusFilter]);

  const trendData = useMemo(() => {
    const monthBuckets: Record<string, { month: string; amount: number; count: number }> = {};
    const today = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthBuckets[key] = { month: fmtMonth(d), amount: 0, count: 0 };
    }
    invoices.forEach((inv) => {
      const key = inv.issue_date.slice(0, 7);
      if (monthBuckets[key]) {
        monthBuckets[key].amount += inv.total;
        monthBuckets[key].count += 1;
      }
    });
    return Object.values(monthBuckets);
  }, [invoices]);

  const arAging = useMemo(() => {
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    invoices.forEach((inv) => {
      if (inv.amount_due <= 0 || inv.status === "VOID") return;
      const diff = Math.floor((new Date(todayISO).getTime() - new Date(inv.due_date).getTime()) / 86400000);
      if (diff <= 0) buckets.current += inv.amount_due;
      else if (diff <= 30) buckets.d1_30 += inv.amount_due;
      else if (diff <= 60) buckets.d31_60 += inv.amount_due;
      else if (diff <= 90) buckets.d61_90 += inv.amount_due;
      else buckets.d90p += inv.amount_due;
    });
    return [
      { label: "Current", value: buckets.current },
      { label: "1-30", value: buckets.d1_30 },
      { label: "31-60", value: buckets.d31_60 },
      { label: "61-90", value: buckets.d61_90 },
      { label: "90+", value: buckets.d90p }
    ];
  }, [invoices]);

  const queueMeta = [
    { key: "needs-attention", label: "Needs Attention", count: queueBuckets.needsAttention.length },
    { key: "drafts", label: "Drafts", count: queueBuckets.drafts.length },
    { key: "overdue", label: "Overdue", count: queueBuckets.overdue.length },
    { key: "sent-unpaid", label: "Sent / Unpaid", count: queueBuckets.sentUnpaid.length },
    { key: "paid", label: "Paid", count: queueBuckets.paid.length },
    { key: "void", label: "Void", count: queueBuckets.voidInvoices.length },
    { key: "all", label: "All Invoices", count: queueBuckets.all.length }
  ] as const;

  const openDetail = async (invoiceId: number) => {
    try {
      setDetailLoading(true);
      const data = await apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`);
      setDetail(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportSelectionCsv = () => {
    const targets = invoices.filter((inv) => selected.includes(inv.id));
    const rows = [["Invoice #", "Customer", "Status", "Issue Date", "Due Date", "Total", "Balance"], ...targets.map((inv) => [inv.invoice_number, inv.customer_name, inv.status, inv.issue_date, inv.due_date, String(inv.total), String(inv.amount_due)])];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runBulk = async (action: "send" | "void" | "paid" | "reminder" | "export") => {
    if (selected.length === 0) return;
    if (action === "export") {
      exportSelectionCsv();
      return;
    }
    if (action === "reminder") {
      setInfoBanner("Send Reminder is ready for integration (placeholder).");
      return;
    }

    try {
      setBulkBusy(true);
      setInfoBanner("");
      await Promise.all(
        selected.map(async (id) => {
          const invoice = invoices.find((entry) => entry.id === id);
          if (!invoice) return;
          if (action === "send" && invoice.status === "DRAFT") {
            await apiFetch(`/invoices/${id}/send`, { method: "POST" });
          }
          if (action === "void" && !["PAID", "PARTIALLY_PAID", "SHIPPED"].includes(invoice.status)) {
            await apiFetch(`/invoices/${id}/void`, { method: "POST" });
          }
          if (action === "paid" && invoice.amount_due > 0) {
            await apiFetch(`/payments`, {
              method: "POST",
              body: JSON.stringify({
                invoice_id: invoice.id,
                amount: invoice.amount_due,
                payment_date: todayISO,
                method: "Workbench",
                notes: "Bulk Mark Paid"
              })
            });
          }
        })
      );
      setSelected([]);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const updateLine = (index: number, updated: Partial<LineItemForm>) => setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...updated } : line)));

  const loadSuppliersForItem = async (itemId: number) => {
    if (supplierOptions[itemId]) return supplierOptions[itemId];
    const links = await apiFetch<SupplierLink[]>(`/items/${itemId}/suppliers`);
    setSupplierOptions((prev) => ({ ...prev, [itemId]: links }));
    return links;
  };

  const handleItemChange = async (index: number, itemIdRaw: string) => {
    const itemId = Number(itemIdRaw);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    updateLine(index, {
      item_id: item.id,
      description: item.name,
      unit_price: String(item.unit_price),
      supplier_id: item.preferred_supplier_id ?? undefined,
      unit_cost: item.preferred_landed_cost != null ? String(item.preferred_landed_cost) : "",
      landed_unit_cost: item.preferred_landed_cost != null ? String(item.preferred_landed_cost) : "0"
    });
    try {
      const customerIdParam = form.customer_id ? `?customer_id=${form.customer_id}` : "";
      const pricing = await apiFetch<PricingContextResponse>(`/items/${item.id}/pricing-context${customerIdParam}`);
      updateLine(index, {
        unit_price: String(pricing.recommended_price),
        unit_cost: String(pricing.landed_unit_cost),
        landed_unit_cost: String(pricing.landed_unit_cost),
        margin_threshold_percent: pricing.margin_threshold_percent
      });
      const suppliers = await loadSuppliersForItem(item.id);
      const preferred = suppliers.find((s) => s.is_preferred);
      if (preferred) {
        updateLine(index, {
          supplier_id: preferred.supplier_id,
          unit_cost: String(preferred.landed_cost),
          landed_unit_cost: String(preferred.landed_cost)
        });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createInvoice = async () => {
    if (!form.customer_id || !form.issue_date || !form.due_date) {
      setError("Customer, issue date, and due date are required.");
      return;
    }
    try {
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

      const created = await apiFetch<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) });
      setCreateOpen(false);
      setForm({ customer_id: "", issue_date: todayISO, due_date: "", notes: "", terms: "" });
      setLines([{ ...emptyLine }]);
      setDueDateWasAuto(false);
      setParam({ queue: "drafts", q: created.invoice_number });
      await loadData();
      await openDetail(created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const totals = useMemo(
    () => lines.reduce((acc, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unit_price || 0);
      const discount = Number(line.discount || 0);
      const taxRate = Number(line.tax_rate || 0);
      const sub = qty * price - discount;
      const tax = sub * taxRate;
      return { subtotal: acc.subtotal + sub, tax: acc.tax + tax, total: acc.total + sub + tax };
    }, { subtotal: 0, tax: 0, total: 0 }),
    [lines]
  );

  const dueDateInvalid = form.issue_date && form.due_date && form.due_date < form.issue_date;

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="app-card p-6 animate-pulse h-24" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="app-card h-24 animate-pulse" />)}
        </div>
        <div className="app-card h-80 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Invoices</p>
          <h1 className="text-3xl font-semibold">Invoice Workbench</h1>
          <p className="text-muted">Create, send, and manage the invoice lifecycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="app-button-ghost"><Download className="h-4 w-4" /> Export</button>
          <button className="app-button" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Invoice</button>
        </div>
      </div>

      {error && <div className="app-card border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>}
      {infoBanner && <div className="app-card border-warning/30 bg-warning/5 p-3 text-sm text-warning">{infoBanner}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((tile) => (
          <button key={tile.label} className={`app-card p-4 text-left ${queue === tile.key ? "ring-2 ring-primary/40" : ""}`} onClick={() => setParam({ queue: tile.key })}>
            <p className="text-xs uppercase tracking-wide text-muted">{tile.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{tile.value}</p>
            <p className="text-xs text-muted">{tile.meta}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="app-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Invoice trend (12 months)</p>
            <p className="text-xs text-muted">Amount billed</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="app-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">A/R Aging</p>
            <p className="text-xs text-muted">Outstanding balance</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={arAging}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="app-card p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          <div className="space-y-1">
            {queueMeta.map((entry) => (
              <button key={entry.key} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${queue === entry.key ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`} onClick={() => setParam({ queue: entry.key })}>
                <span className="font-medium">{entry.label}</span>
                <span className="ml-2 text-muted">{entry.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="app-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="app-input pl-9" value={q} placeholder="Search invoice # or customer" onChange={(e) => setParam({ q: e.target.value || null })} />
            </div>
            <select className="app-select w-44" value={statusFilter} onChange={(e) => setParam({ status: e.target.value || null })}>
              <option value="">All statuses</option>
              {["DRAFT", "SENT", "PARTIALLY_PAID", "SHIPPED", "PAID", "VOID"].map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
            </select>
            <button className="app-button-ghost" onClick={() => setParam({ density: density === "compact" ? "comfortable" : "compact" })}>{density === "compact" ? "Comfortable" : "Compact"}</button>
            <div className="relative">
              <button className="app-button-ghost" onClick={() => setIsColumnsOpen((s) => !s)}>Columns <ChevronDown className="h-4 w-4" /></button>
              {isColumnsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-border bg-surface p-2 shadow-glow">
                  {COLUMNS.map((column) => (
                    <label key={column} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-secondary">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column)}
                        onChange={() => setVisibleColumns((prev) => prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column])}
                      />
                      <span>{column.replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="font-medium">{selected.length} selected</span>
              <button className="app-button-ghost" disabled={bulkBusy} onClick={() => runBulk("send")}><Send className="h-4 w-4" /> Mark Sent</button>
              <button className="app-button-ghost" disabled={bulkBusy} onClick={() => runBulk("paid")}><CheckCircle2 className="h-4 w-4" /> Mark Paid</button>
              <button className="app-button-ghost" disabled={bulkBusy} onClick={() => runBulk("void")}><XCircle className="h-4 w-4" /> Void</button>
              <button className="app-button-ghost" onClick={() => runBulk("export")}><Download className="h-4 w-4" /> Export</button>
              <button className="app-button-ghost" onClick={() => runBulk("reminder")}><AlertTriangle className="h-4 w-4" /> Send Reminder</button>
            </div>
          )}

          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="py-2"><input type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length} onChange={(e) => setSelected(e.target.checked ? filtered.map((inv) => inv.id) : [])} /></th>
                  {visibleColumns.includes("invoice_number") && <th className="py-2">Invoice #</th>}
                  {visibleColumns.includes("customer") && <th>Customer</th>}
                  {visibleColumns.includes("status") && <th>Status</th>}
                  {visibleColumns.includes("issue_date") && <th>Invoice Date</th>}
                  {visibleColumns.includes("due_date") && <th>Due Date</th>}
                  {visibleColumns.includes("total") && <th>Total</th>}
                  {visibleColumns.includes("balance") && <th>Balance</th>}
                  {visibleColumns.includes("updated") && <th>Updated</th>}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr key={invoice.id} className={`border-t ${density === "compact" ? "h-10" : "h-14"} hover:bg-secondary/40`}>
                    <td><input type="checkbox" checked={selected.includes(invoice.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...new Set([...prev, invoice.id])] : prev.filter((id) => id !== invoice.id))} /></td>
                    {visibleColumns.includes("invoice_number") && <td className="font-medium"><button className="hover:underline" onClick={() => openDetail(invoice.id)}>{invoice.invoice_number}</button></td>}
                    {visibleColumns.includes("customer") && <td>{invoice.customer_name}</td>}
                    {visibleColumns.includes("status") && <td><span className={`app-badge ${statusStyles[invoice.status] ?? "border-border bg-secondary"}`}>{invoice.status.replace(/_/g, " ")}</span></td>}
                    {visibleColumns.includes("issue_date") && <td>{formatDate(invoice.issue_date)}</td>}
                    {visibleColumns.includes("due_date") && <td className={isOverdue(invoice) ? "text-danger" : ""}>{formatDate(invoice.due_date)}</td>}
                    {visibleColumns.includes("total") && <td className="tabular-nums">{currency(invoice.total)}</td>}
                    {visibleColumns.includes("balance") && <td className="tabular-nums">{currency(invoice.amount_due)}</td>}
                    {visibleColumns.includes("updated") && <td className="text-muted">{formatDate(invoice.issue_date)}</td>}
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="app-button-ghost" onClick={() => openDetail(invoice.id)}>View</button>
                        <Link className="app-button-ghost" to={`/invoices/${invoice.id}`}>Edit</Link>
                        <button className="app-button-ghost" onClick={() => setInfoBanner("Duplicate action will be wired in next iteration.")}>Duplicate</button>
                        <Link className="app-button-ghost" to={`/payments?invoiceId=${invoice.id}`}>Record Payment</Link>
                        <button className="app-button-ghost" onClick={() => runBulk("void")}><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filtered.length && (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                <p className="text-lg font-semibold">No invoices in this queue</p>
                <p className="text-sm text-muted">Adjust filters or create a new invoice to get started.</p>
                <button className="app-button mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Invoice</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-5 shadow-glow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Invoice Detail</p>
                <h2 className="text-xl font-semibold">{detail?.invoice_number ?? "Loading..."}</h2>
              </div>
              <button className="app-button-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
            {detailLoading && <div className="mt-4 h-40 animate-pulse rounded-xl bg-secondary" />}
            {detail && !detailLoading && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="app-card p-3"><p className="text-xs text-muted">Customer</p><p className="font-medium">{detail.customer_name ?? detail.customer?.name ?? "—"}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Balance</p><p className="font-medium tabular-nums">{currency(detail.amount_due)}</p></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Status</p><span className={`app-badge ${statusStyles[detail.status] ?? "border-border bg-secondary"}`}>{detail.status.replace(/_/g, " ")}</span></div>
                  <div className="app-card p-3"><p className="text-xs text-muted">Due Date</p><p className="font-medium">{formatDate(detail.due_date)}</p></div>
                </div>

                <div className="mt-4">
                  <h3 className="font-semibold">Line items</h3>
                  <div className="mt-2 space-y-2">
                    {(detail.line_items ?? detail.lines ?? []).slice(0, 5).map((line) => (
                      <div key={line.id} className="rounded-xl border border-border p-3 text-sm">
                        <p className="font-medium">{line.description || "Line item"}</p>
                        <p className="text-xs text-muted">Qty {line.quantity} × {currency(line.unit_price)} · {currency(line.line_total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="font-semibold">Activity timeline</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    <li className="rounded-lg bg-secondary p-2">Created · {formatDate(detail.issue_date)}</li>
                    {["SENT", "PARTIALLY_PAID", "SHIPPED", "PAID"].includes(detail.status) && <li className="rounded-lg bg-secondary p-2">Sent · lifecycle progressed</li>}
                    {detail.payments && detail.payments.length > 0 && <li className="rounded-lg bg-secondary p-2">Paid · {detail.payments.length} payment(s)</li>}
                  </ul>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link className="app-button-ghost" to={`/invoices/${detail.id}`}><ExternalLink className="h-4 w-4" /> View full</Link>
                  <Link className="app-button-ghost" to={`/invoices/${detail.id}`}>Edit</Link>
                  <Link className="app-button-ghost" to={`/payments?invoiceId=${detail.id}`}>Record payment</Link>
                  <button className="app-button-ghost" onClick={() => runBulk("send")}>Send</button>
                  <button className="app-button-ghost" onClick={() => runBulk("void")}>Void</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-4xl overflow-y-auto border-l border-border bg-surface p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Create</p>
                <h2 className="text-2xl font-semibold">New Invoice</h2>
              </div>
              <button className="app-button-ghost" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select className="app-select" value={form.customer_id} onChange={(e) => setForm((prev) => ({ ...prev, customer_id: e.target.value }))}>
                <option value="">Select customer *</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
              <input className="app-input" type="date" value={form.issue_date} onChange={(e) => {
                const nextIssue = e.target.value;
                const termsDays = parseTermsDays(form.terms);
                if (termsDays !== null && (dueDateWasAuto || !form.due_date)) {
                  setForm((prev) => ({ ...prev, issue_date: nextIssue, due_date: addDays(nextIssue, termsDays) }));
                  setDueDateWasAuto(true);
                  return;
                }
                setForm((prev) => ({ ...prev, issue_date: nextIssue }));
              }} />
              <input className="app-input" type="date" value={form.due_date} onChange={(e) => {
                setForm((prev) => ({ ...prev, due_date: e.target.value }));
                setDueDateWasAuto(false);
              }} />
              <input className="app-input" placeholder="Terms (e.g., Net 30)" value={form.terms} onChange={(e) => {
                const nextTerms = e.target.value;
                const termsDays = parseTermsDays(nextTerms);
                if (termsDays !== null && form.issue_date && (dueDateWasAuto || !form.due_date)) {
                  setForm((prev) => ({ ...prev, terms: nextTerms, due_date: addDays(form.issue_date, termsDays) }));
                  setDueDateWasAuto(true);
                  return;
                }
                setForm((prev) => ({ ...prev, terms: nextTerms }));
              }} />
              <input className="app-input md:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>

            {dueDateInvalid && <p className="mt-2 text-sm text-danger">Due date must be on or after invoice date.</p>}

            <div className="mt-5 space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3">
                  <div className="grid gap-2 md:grid-cols-6">
                    <select className="app-select" value={line.item_id ?? ""} onChange={(e) => handleItemChange(idx, e.target.value)}>
                      <option value="">Item</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input className="app-input" placeholder="Description" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                    <input className="app-input" type="number" min="0" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                    <input className="app-input" type="number" min="0" step="0.01" placeholder="Unit price" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                    <input className="app-input" type="number" min="0" step="0.01" placeholder="Discount" value={line.discount} onChange={(e) => updateLine(idx, { discount: e.target.value })} />
                    <div className="flex gap-2">
                      <input className="app-input" type="number" min="0" step="0.01" placeholder="Tax" value={line.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: e.target.value })} />
                      <button className="app-button-ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
              <button className="app-button-ghost" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}>+ Add line item</button>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-xl bg-secondary p-4">
              <div className="text-sm text-muted">Subtotal {currency(totals.subtotal)} · Tax {currency(totals.tax)}</div>
              <div className="text-lg font-semibold">Total {currency(totals.total)}</div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="app-button-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="app-button" onClick={createInvoice}>Create invoice</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
