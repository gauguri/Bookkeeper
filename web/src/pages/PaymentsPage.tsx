import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Upload
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { currency } from "../utils/format";

const PALETTE = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#06b6d4", "#eab308", "#ef4444"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Payment = {
  id: number;
  invoice_id: number;
  invoice_number?: string;
  customer_id: number;
  amount: number | string;
  payment_date: string;
  method?: string;
  notes?: string;
  applications: { invoice_id: number; applied_amount: number | string }[];
};

type PaymentDetail = {
  id: number;
  payment_number: string;
  customer_id: number;
  customer_name?: string;
  amount: number | string;
  applied_amount: number | string;
  unapplied_amount: number | string;
  payment_date: string;
  method?: string;
  reference?: string;
  status: string;
  notes?: string;
  allocations: { invoice_id: number; applied_amount: number | string }[];
};

type SummaryPayload = {
  summary: {
    payments_received: number | string;
    unapplied_payments: number | string;
    exceptions_count: number;
    avg_days_to_pay?: number;
    refunds_reversals: number | string;
    cash_forecast_impact: number | string;
  };
  method_mix: { method: string; amount: number | string }[];
  monthly_trend: { month: string; received: number | string; applied: number | string; unapplied: number | string }[];
  top_customers: { customer_id: number; customer_name: string; amount: number | string }[];
};

type InvoiceOption = {
  id: number;
  invoice_number: string;
  due_date: string;
  amount_due: number | string;
  status: string;
};

const toNum = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(searchParams.get("range") ?? "mtd");
  const [activeTile, setActiveTile] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "amount" | "method">("date");
  const [compact, setCompact] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [paymentDetail, setPaymentDetail] = useState<PaymentDetail | null>(null);
  const [openInvoices, setOpenInvoices] = useState<InvoiceOption[]>([]);
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [isApplySaving, setIsApplySaving] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [form, setForm] = useState({ invoice_id: "", amount: "", payment_date: todayISO(), method: "", notes: "" });
  const queue = searchParams.get("queue") ?? "needs-attention";

  const load = async () => {
    try {
      setLoading(true);
      const query = `?queue=${encodeURIComponent(queue)}&date_range=${encodeURIComponent(period)}&page=1&page_size=250`;
      const [rows, overview, universe] = await Promise.all([
        apiFetch<Payment[]>(`/payments${query}`),
        apiFetch<SummaryPayload>(`/payments/summary?range=${encodeURIComponent(period)}`),
        apiFetch<Payment[]>(`/payments?queue=all&date_range=${encodeURIComponent(period)}&page=1&page_size=500`)
      ]);
      setPayments(rows);
      setSummary(overview);
      setAllPayments(universe);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("range", period);
    if (!next.get("queue")) next.set("queue", "needs-attention");
    setSearchParams(next, { replace: true });
  }, [period]);

  useEffect(() => {
    load();
  }, [queue, period]);

  useEffect(() => {
    if (!selectedPaymentId) {
      setPaymentDetail(null);
      return;
    }
    apiFetch<PaymentDetail>(`/payments/${selectedPaymentId}`)
      .then(async (detail) => {
        setPaymentDetail(detail);
        const invoices = await apiFetch<InvoiceOption[]>(`/customers/${detail.customer_id}/open-invoices`);
        setOpenInvoices(invoices);
        let remaining = toNum(detail.unapplied_amount);
        const suggestion: Record<number, string> = {};
        for (const invoice of invoices) {
          if (remaining <= 0) break;
          const suggested = Math.min(remaining, toNum(invoice.amount_due));
          suggestion[invoice.id] = suggested.toFixed(2);
          remaining -= suggested;
        }
        setAllocations(suggestion);
      })
      .catch((err) => setError((err as Error).message));
  }, [selectedPaymentId]);

  const queueCounts = useMemo(() => {
    const classify = (payment: Payment) => {
      const amount = toNum(payment.amount);
      const applied = payment.applications.reduce((sum, app) => sum + toNum(app.applied_amount), 0);
      const unapplied = Math.max(amount - applied, 0);
      if (unapplied <= 0) return "applied";
      if (applied > 0) return "needs-attention";
      return "unapplied";
    };
    const base = { "needs-attention": 0, unapplied: 0, exceptions: 0, applied: 0, "refunds-reversals": 0, all: allPayments.length };
    for (const payment of allPayments) {
      const status = classify(payment);
      if (status === "applied") base.applied += 1;
      if (status === "unapplied") base.unapplied += 1;
      if (status === "needs-attention") base["needs-attention"] += 1;
    }
    base["needs-attention"] += base.exceptions;
    return base;
  }, [allPayments]);

  const sorted = useMemo(() => {
    const rows = [...payments];
    rows.sort((a, b) => {
      if (sortBy === "amount") return toNum(b.amount) - toNum(a.amount);
      if (sortBy === "method") return (a.method ?? "").localeCompare(b.method ?? "");
      return String(b.payment_date).localeCompare(String(a.payment_date));
    });
    return rows;
  }, [payments, sortBy]);

  const methodMix = summary?.method_mix.map((d) => ({ ...d, amount: toNum(d.amount) })) ?? [];
  const trend = summary?.monthly_trend.map((d) => ({ ...d, received: toNum(d.received), applied: toNum(d.applied), unapplied: toNum(d.unapplied), label: MONTHS[Number(d.month.slice(5, 7)) - 1] })) ?? [];
  const topCustomers = summary?.top_customers.map((d) => ({ ...d, amount: toNum(d.amount) })) ?? [];

  const setQueue = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("queue", value);
    next.set("range", period);
    setSearchParams(next, { replace: true });
  };

  const submitPayment = async () => {
    if (!form.invoice_id || !form.amount || !form.payment_date) {
      setError("Invoice, amount, and payment date are required.");
      return;
    }
    await apiFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        invoice_id: Number(form.invoice_id),
        amount: Number(form.amount),
        payment_date: form.payment_date,
        method: form.method || null,
        notes: form.notes || null
      })
    });
    setForm({ invoice_id: "", amount: "", payment_date: todayISO(), method: "", notes: "" });
    setShowRecord(false);
    await load();
  };

  const applyPayment = async () => {
    if (!paymentDetail) return;
    const payload = Object.entries(allocations)
      .map(([invoiceId, amount]) => ({ invoice_id: Number(invoiceId), applied_amount: Number(amount || 0) }))
      .filter((row) => row.applied_amount > 0);
    try {
      setIsApplySaving(true);
      await apiFetch(`/payments/${paymentDetail.id}/apply`, { method: "POST", body: JSON.stringify({ allocations: payload }) });
      await load();
      setSelectedPaymentId(paymentDetail.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplySaving(false);
    }
  };

  const remainingUnapplied = useMemo(() => {
    if (!paymentDetail) return 0;
    const allocated = Object.values(allocations).reduce((sum, value) => sum + toNum(value), 0);
    return Math.max(toNum(paymentDetail.amount) - allocated, 0);
  }, [allocations, paymentDetail]);

  const queueItems = [
    { key: "needs-attention", label: "Needs Attention" },
    { key: "unapplied", label: "Unapplied" },
    { key: "exceptions", label: "Exceptions" },
    { key: "applied", label: "Applied" },
    { key: "refunds-reversals", label: "Refunds/Reversals" },
    { key: "all", label: "All Payments" }
  ];

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="app-card h-24 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="app-card h-28 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, idx) => <div key={idx} className="app-card h-72 animate-pulse" />)}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Payments</p>
          <h1 className="text-3xl font-semibold">Payments Workbench</h1>
          <p className="text-muted">Record, reconcile, and monitor customer payments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["mtd", "qtd", "ytd", "12m"] as const).map((value) => (
            <button key={value} className={`app-button-ghost text-xs uppercase ${period === value ? "border-primary text-primary" : ""}`} onClick={() => setPeriod(value)}>
              {value}
            </button>
          ))}
          <button className="app-button" onClick={() => setShowRecord(true)}><Plus className="h-4 w-4" /> Record Payment</button>
          <button className="app-button-ghost"><Upload className="h-4 w-4" /> Import</button>
          <button className="app-button-ghost"><Download className="h-4 w-4" /> Export</button>
        </div>
      </header>

      {error && <div className="app-card border-danger/40 p-4 text-sm text-danger"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { key: "received", label: "Payments Received", value: currency(toNum(summary?.summary.payments_received)), queueKey: "all", icon: CreditCard },
          { key: "unapplied", label: "Unapplied Payments", value: currency(toNum(summary?.summary.unapplied_payments)), queueKey: "unapplied", icon: AlertTriangle },
          { key: "exceptions", label: "Exceptions", value: String(summary?.summary.exceptions_count ?? 0), queueKey: "exceptions", icon: AlertTriangle },
          { key: "forecast", label: "Cash Forecast Impact", value: currency(toNum(summary?.summary.cash_forecast_impact)), queueKey: "needs-attention", icon: BarChart3 }
        ].map((tile) => (
          <button
            key={tile.key}
            onClick={() => {
              setActiveTile(tile.key);
              setQueue(tile.queueKey);
            }}
            className={`app-card p-4 text-left transition hover:-translate-y-0.5 ${activeTile === tile.key ? "ring-2 ring-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between text-muted"><span className="text-xs uppercase tracking-widest">{tile.label}</span><tile.icon className="h-4 w-4" /></div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{tile.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="app-card p-4">
          <p className="mb-3 text-sm font-semibold">Payments Trend (12 months)</p>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis dataKey="label" /><YAxis tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Line dataKey="received" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="app-card p-4">
          <p className="mb-3 text-sm font-semibold">Payment Methods Mix</p>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={methodMix} dataKey="amount" nameKey="method" innerRadius={55} outerRadius={90}>
                  {methodMix.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => currency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="app-card p-4">
          <p className="mb-3 text-sm font-semibold">Applied vs Unapplied</p>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis dataKey="label" /><YAxis tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Bar dataKey="applied" stackId="a" fill="#22c55e" />
                <Bar dataKey="unapplied" stackId="a" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="app-card p-4">
          <p className="mb-3 text-sm font-semibold">Top Customers by Payments</p>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={topCustomers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis dataKey="customer_name" hide /><YAxis tickFormatter={(value) => currency(value)} />
                <Tooltip formatter={(value: number) => currency(value)} />
                <Bar dataKey="amount">
                  {topCustomers.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="app-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          <div className="space-y-1">
            {queueItems.map((item) => (
              <button key={item.key} onClick={() => setQueue(item.key)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${queue === item.key ? "bg-primary/10 text-primary" : "hover:bg-slate-100"}`}>
                <span>{item.label}</span><span className="tabular-nums text-xs">{queueCounts[item.key as keyof typeof queueCounts] ?? 0}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="app-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <div className="flex items-center gap-2">
              <button className="app-button-ghost text-xs"><Filter className="h-4 w-4" /> Filters</button>
              <button className="app-button-ghost text-xs" onClick={() => setShowColumns((v) => !v)}><ChevronDown className="h-4 w-4" /> Columns</button>
              <select className="app-select py-1 text-xs" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
                <option value="date">Sort: Date</option>
                <option value="amount">Sort: Amount</option>
                <option value="method">Sort: Method</option>
              </select>
              <button className="app-button-ghost text-xs" onClick={() => setCompact((v) => !v)}>{compact ? "Comfortable" : "Compact"}</button>
            </div>
            <div className="flex items-center gap-2">
              <button className="app-button-ghost text-xs">Apply to invoices</button>
              <button className="app-button-ghost text-xs">Mark as verified</button>
              <button className="app-button-ghost text-xs">Export</button>
              <button className="app-button-ghost text-xs">Reverse</button>
            </div>
          </div>
          {showColumns && <div className="border-b bg-slate-50 px-3 py-2 text-xs text-muted">Columns: Payment #, Date, Customer, Method, Amount, Applied, Unapplied, Status, Reference, Updated, Actions</div>}
          <div className="max-h-[540px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === sorted.length} onChange={(event) => setSelectedIds(event.target.checked ? sorted.map((row) => row.id) : [])} /></th>
                  <th className="px-3 py-2">Payment #</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Applied</th><th className="px-3 py-2 text-right">Unapplied</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((payment) => {
                  const applied = payment.applications.reduce((sum, item) => sum + toNum(item.applied_amount), 0);
                  const unapplied = Math.max(toNum(payment.amount) - applied, 0);
                  const status = unapplied === 0 ? "Applied" : applied > 0 ? "Partially applied" : "Unapplied";
                  return (
                    <tr key={payment.id} className={`border-t hover:bg-slate-50 ${compact ? "" : "h-12"}`} onClick={() => setSelectedPaymentId(payment.id)}>
                      <td className="px-3"><input type="checkbox" checked={selectedIds.includes(payment.id)} onChange={(event) => {
                        event.stopPropagation();
                        setSelectedIds((prev) => event.target.checked ? [...prev, payment.id] : prev.filter((id) => id !== payment.id));
                      }} /></td>
                      <td className="px-3 font-medium">PMT-{String(payment.id).padStart(6, "0")}</td>
                      <td className="px-3">{payment.payment_date}</td>
                      <td className="px-3">Customer #{payment.customer_id}</td>
                      <td className="px-3">{payment.method ?? "-"}</td>
                      <td className="px-3 text-right tabular-nums">{currency(toNum(payment.amount))}</td>
                      <td className="px-3 text-right tabular-nums">{currency(applied)}</td>
                      <td className="px-3 text-right tabular-nums">{currency(unapplied)}</td>
                      <td className="px-3"><span className={`app-badge ${status === "Applied" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{status}</span></td>
                      <td className="px-3">{payment.invoice_number ?? `Invoice #${payment.invoice_id}`}</td>
                      <td className="px-3">{payment.payment_date}</td>
                      <td className="px-3 text-right"><button className="app-button-ghost" onClick={(event) => event.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></button></td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && <tr><td colSpan={12} className="px-3 py-20 text-center text-muted">No payments in this queue. Try another queue or date range.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedPaymentId && paymentDetail && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Payment Detail</p>
              <h2 className="text-lg font-semibold">{paymentDetail.payment_number}</h2>
            </div>
            <button className="app-button-ghost" onClick={() => setSelectedPaymentId(null)}>Close</button>
          </div>
          <div className="space-y-4 overflow-auto p-4">
            <div className="app-card p-4">
              <p className="text-xs uppercase tracking-widest text-muted">Summary</p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted">Customer</p><p className="font-medium">{paymentDetail.customer_name ?? `Customer #${paymentDetail.customer_id}`}</p></div>
                <div><p className="text-muted">Date</p><p className="font-medium">{paymentDetail.payment_date}</p></div>
                <div><p className="text-muted">Amount</p><p className="font-medium">{currency(toNum(paymentDetail.amount))}</p></div>
                <div><p className="text-muted">Status</p><p><span className="app-badge bg-sky-100 text-sky-700">{paymentDetail.status}</span></p></div>
              </div>
            </div>

            <div className="app-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Match & Apply</p>
                <p className="text-xs text-muted">Remaining Unapplied: <span className="font-semibold text-amber-700">{currency(remainingUnapplied)}</span></p>
              </div>
              <div className="mt-3 space-y-2">
                {openInvoices.map((invoice) => (
                  <div key={invoice.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border p-2 text-sm">
                    <div>
                      <p className="font-medium">{invoice.invoice_number}</p>
                      <p className="text-xs text-muted">Due {invoice.due_date} · Balance {currency(toNum(invoice.amount_due))}</p>
                    </div>
                    <input className="app-input w-28 py-1" value={allocations[invoice.id] ?? ""} onChange={(event) => setAllocations((prev) => ({ ...prev, [invoice.id]: event.target.value }))} />
                    <button className="app-button-ghost text-xs" onClick={() => setAllocations((prev) => ({ ...prev, [invoice.id]: "" }))}>Clear</button>
                  </div>
                ))}
                {openInvoices.length === 0 && <p className="text-sm text-muted">No open invoices available for this customer.</p>}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button className="app-button-ghost"><Download className="h-4 w-4" /> Export receipt</button>
                <button className="app-button" onClick={applyPayment} disabled={isApplySaving}><CheckCircle2 className="h-4 w-4" /> {isApplySaving ? "Applying..." : "Confirm Apply"}</button>
              </div>
            </div>

            <div className="app-card p-4">
              <p className="text-sm font-semibold">Audit Timeline</p>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted"><RefreshCw className="h-4 w-4" /> Payment recorded on {paymentDetail.payment_date}</div>
                <div className="flex items-center gap-2 text-muted"><CheckCircle2 className="h-4 w-4" /> Allocation updated from workbench</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="app-card w-full max-w-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">+ Record Payment</h2>
              <button className="app-button-ghost" onClick={() => setShowRecord(false)}>Close</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input className="app-input" placeholder="Invoice ID" value={form.invoice_id} onChange={(event) => setForm({ ...form, invoice_id: event.target.value })} />
              <input className="app-input" placeholder="Amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              <input className="app-input" type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} />
              <input className="app-input" placeholder="Method" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} />
              <input className="app-input md:col-span-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="mt-4 flex justify-end"><button className="app-button" onClick={submitPayment}><Plus className="h-4 w-4" /> Record payment</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
