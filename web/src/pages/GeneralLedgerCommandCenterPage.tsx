import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { AlertTriangle, ChevronDown, Search, Settings2, X } from "lucide-react";
import { apiFetch } from "../api";
import DashboardFilter from "../components/analytics/DashboardFilter";
import { CHART_COLORS } from "../utils/colorScales";
import { AXIS_STYLE, CHART_MARGIN, GRID_STYLE, TOOLTIP_STYLE } from "../utils/chartHelpers";

type SummaryResponse = {
  unposted_count: number;
  exceptions_count: number;
  trial_balance_balanced: boolean;
  trial_balance_imbalance_amount: number;
  current_period_label: string;
  current_period_open: boolean;
  ytd_net_income: number;
  cash_balance: number;
  posted_volume_series: { period: string; value: number }[];
  net_income_series: { period: string; value: number }[];
  revenue_series: { period: string; value: number }[];
  expense_series: { period: string; value: number }[];
  account_balance_composition: { category: string; value: number }[];
};

type Journal = {
  id: number;
  document_number: string;
  posting_date: string;
  document_type: string;
  source_module: string;
  reference?: string | null;
  description?: string | null;
  debits: number;
  credits: number;
  status: "DRAFT" | "POSTED" | "REVERSED" | "VOID";
  period_label: string;
  updated_at: string;
};

type JournalDetail = {
  id: number;
  document_number: string;
  status: "DRAFT" | "POSTED" | "REVERSED" | "VOID";
  posting_date: string;
  period_number: number;
  fiscal_year: number;
  source_module: string;
  reference?: string;
  header_text?: string;
  created_by?: string;
  created_at?: string;
  posted_by?: string;
  posted_at?: string;
  reversed_by?: string;
  reversed_at?: string;
  lines: { gl_account_id: number; description?: string; debit_amount: number; credit_amount: number }[];
};

type Account = {
  id: number;
  account_number: string;
  name: string;
  account_type: string;
  normal_balance: string;
  is_active: boolean;
  is_postable: boolean;
  parent_id?: number | null;
};

type Ledger = {
  id: number;
  name: string;
  company_code_id: number;
};

type QueueKey = "needs_attention" | "draft" | "ready" | "posted" | "reversed" | "all";

const QUEUES: { key: QueueKey; label: string }[] = [
  { key: "needs_attention", label: "Needs Attention" },
  { key: "draft", label: "Draft Journals" },
  { key: "ready", label: "Ready to Post" },
  { key: "posted", label: "Posted" },
  { key: "reversed", label: "Reversed" },
  { key: "all", label: "All Journals" },
];

function money(value: number | undefined | null) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(safe);
}

function numberSafe(value: number | undefined | null) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return safe.toLocaleString();
}

export default function GeneralLedgerCommandCenterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [period, setPeriod] = useState(searchParams.get("range") || "current_month");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [glAccounts, setGlAccounts] = useState<Account[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [glAccountsLoading, setGlAccountsLoading] = useState(false);
  const [glAccountsFailed, setGlAccountsFailed] = useState(false);
  const [lineAccountErrors, setLineAccountErrors] = useState<Record<number, string>>({});
  const [lineAccountSearch, setLineAccountSearch] = useState<Record<number, string>>({});
  const [selectedJournal, setSelectedJournal] = useState<JournalDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [toast, setToast] = useState("");

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [source, setSource] = useState(searchParams.get("source") || "");
  const [periodFilter, setPeriodFilter] = useState(searchParams.get("period") || "");
  const [queue, setQueue] = useState<QueueKey>((searchParams.get("queue") as QueueKey) || "all");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [pageSize] = useState(15);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState<Record<string, boolean>>({
    source: true,
    reference: true,
    updated: true,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_code_id: 1,
    ledger_id: 1,
    posting_date: new Date().toISOString().slice(0, 10),
    document_date: new Date().toISOString().slice(0, 10),
    reference: "",
    header_text: "",
  });
  const [lines, setLines] = useState([
    { gl_account_id: 0, description: "", debit_amount: "", credit_amount: "" },
    { gl_account_id: 0, description: "", debit_amount: "", credit_amount: "" },
  ]);

  const dateRangeApi = useMemo(() => {
    if (period === "current_month") return "MTD";
    if (period === "current_quarter") return "QTD";
    if (period === "ytd") return "YTD";
    return "12M";
  }, [period]);

  const loadSummary = async () => {
    const res = await apiFetch<SummaryResponse>(`/gl/command-center/summary?range=${dateRangeApi}`);
    setSummary(res);
  };

  const loadJournals = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), page_size: String(pageSize), date_range: dateRangeApi });
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      if (source) query.set("source", source);
      if (periodFilter) query.set("period", periodFilter);
      if (queue && queue !== "all") query.set("queue", queue);
      const res = await apiFetch<{ total: number; items: Journal[] }>(`/gl/journals?${query.toString()}`);
      setTotal(res.total);
      setJournals(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void apiFetch<{ company_code_id: number; ledger_id: number }>("/gl/bootstrap").then((boot) => {
      setForm((prev) => ({ ...prev, company_code_id: boot.company_code_id, ledger_id: boot.ledger_id }));
    });
    void apiFetch<Ledger[]>("/gl/ledgers").then(setLedgers);
    void apiFetch<Account[]>("/gl/accounts?active=true").then(setAccounts);
  }, []);

  useEffect(() => {
    if (!createOpen || !form.company_code_id) return;
    let active = true;
    setGlAccountsLoading(true);
    setGlAccountsFailed(false);
    void apiFetch<Account[]>(`/gl/accounts?active=true&postable_only=true&company_code_id=${form.company_code_id}`)
      .then((data) => {
        if (!active) return;
        setGlAccounts(data);
      })
      .catch((error) => {
        console.error("[GL] Failed to load chart of accounts", error);
        if (!active) return;
        setGlAccounts([]);
        setGlAccountsFailed(true);
        setToast("Failed to load Chart of Accounts");
      })
      .finally(() => {
        if (active) setGlAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [createOpen, form.company_code_id]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("range", period);
    next.set("page", String(page));
    queue === "all" ? next.delete("queue") : next.set("queue", queue);
    search ? next.set("search", search) : next.delete("search");
    status ? next.set("status", status) : next.delete("status");
    source ? next.set("source", source) : next.delete("source");
    periodFilter ? next.set("period", periodFilter) : next.delete("period");
    setSearchParams(next, { replace: true });
  }, [period, page, queue, search, status, source, periodFilter]);

  useEffect(() => {
    void loadSummary();
    void loadJournals();
  }, [page, queue, period, status, source, periodFilter]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const debitTotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0), [lines]);
  const creditTotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0), [lines]);
  const balanceGap = Number((debitTotal - creditTotal).toFixed(2));
  const periodMatchesCurrent = form.posting_date.startsWith(summary?.current_period_label ?? "");
  const hasMissingAccounts = lines.some((line) => line.gl_account_id <= 0);
  const canPost = balanceGap === 0 && Boolean(summary?.current_period_open) && periodMatchesCurrent && !hasMissingAccounts && !glAccountsFailed;

  const sortedGlAccounts = useMemo(() => [...glAccounts].sort((a, b) => a.account_number.localeCompare(b.account_number, undefined, { numeric: true })), [glAccounts]);
  const selectedLedgerId = String(form.ledger_id);

  const filteredQueueCounts = useMemo(() => {
    const posted = journals.filter((j) => j.status === "POSTED").length;
    const draft = journals.filter((j) => j.status === "DRAFT").length;
    const reversed = journals.filter((j) => j.status === "REVERSED").length;
    const ready = journals.filter((j) => j.status === "DRAFT" && Number(j.debits) === Number(j.credits)).length;
    const needsAttention = (summary?.exceptions_count ?? 0) + (summary?.current_period_open ? 0 : 1);
    return { posted, draft, reversed, ready, needsAttention, all: total };
  }, [journals, summary, total]);

  const openJournal = async (journalId: number) => {
    setDrawerLoading(true);
    try {
      const detail = await apiFetch<JournalDetail>(`/gl/journals/${journalId}`);
      setSelectedJournal(detail);
    } finally {
      setDrawerLoading(false);
    }
  };

  const runJournalAction = async (journalId: number, action: "post" | "reverse") => {
    try {
      await apiFetch(`/gl/journals/${journalId}/${action}`, { method: "POST" });
      setToast(action === "post" ? "Journal posted." : "Journal reversed.");
      void loadSummary();
      void loadJournals();
      if (selectedJournal?.id === journalId) {
        void openJournal(journalId);
      }
    } catch (error) {
      console.error(`[GL] Failed to ${action} journal`, error);
      setToast(`Unable to ${action} journal.`);
    }
  };

  const createJournal = async (shouldPost: boolean) => {
    setSaving(true);
    setCreateError("");
    try {
      if (shouldPost) {
        const errors: Record<number, string> = {};
        lines.forEach((line, idx) => {
          if (line.gl_account_id <= 0) errors[idx] = "Account is required.";
        });
        setLineAccountErrors(errors);
        if (Object.keys(errors).length > 0) {
          setCreateError("Select an account for every journal entry line before posting.");
          setSaving(false);
          return;
        }
      }

      const payload = {
        company_code_id: form.company_code_id,
        ledger_id: form.ledger_id,
        posting_date: form.posting_date,
        document_date: form.document_date,
        reference: form.reference || null,
        header_text: form.header_text || null,
        source_module: "MANUAL",
        lines: lines
          .filter((line) => line.gl_account_id > 0)
          .map((line) => ({
            gl_account_id: line.gl_account_id,
            description: line.description || null,
            debit_amount: Number(line.debit_amount || 0),
            credit_amount: Number(line.credit_amount || 0),
          })),
      };
      const created = await apiFetch<{ id: number }>("/gl/journals", { method: "POST", body: JSON.stringify(payload) });
      if (shouldPost) {
        await apiFetch(`/gl/journals/${created.id}/post`, { method: "POST" });
      }
      setCreateOpen(false);
      setToast(shouldPost ? "Journal posted successfully." : "Draft saved successfully.");
      void loadSummary();
      void loadJournals();
    } catch (error: any) {
      console.error("[GL] Failed to create journal", error);
      setCreateError(error?.message || "Unable to save journal.");
      setToast("Failed to save journal.");
    } finally {
      setSaving(false);
    }
  };

  const kpis = [
    { label: "Draft / Unposted Journals", value: numberSafe(summary?.unposted_count), onClick: () => setQueue("draft") },
    { label: "Posting Exceptions", value: numberSafe(summary?.exceptions_count), onClick: () => setQueue("needs_attention") },
    {
      label: "Trial Balance Status",
      value: summary?.trial_balance_balanced ? "Balanced" : `Out by ${money(summary?.trial_balance_imbalance_amount)}`,
      sub: `Last refresh: ${new Date().toLocaleTimeString()}`,
      onClick: () => navigate("/accounting/gl/reports"),
    },
    {
      label: "Current Period Status",
      value: summary?.current_period_open ? "Open" : "Closed",
      sub: summary?.current_period_label ?? "—",
      onClick: () => setPeriodFilter(summary?.current_period_label ?? ""),
    },
    { label: "YTD Net Income", value: money(summary?.ytd_net_income), onClick: () => setPeriod("ytd") },
    { label: "Cash Balance", value: money(summary?.cash_balance), onClick: () => setSource("MANUAL") },
  ];

  const accountNameMap = useMemo(() => new Map(accounts.map((a) => [a.id, `${a.account_number} · ${a.name}`])), [accounts]);

  const getLineOptions = (index: number) => {
    const term = (lineAccountSearch[index] || "").trim().toLowerCase();
    const filtered = sortedGlAccounts.filter((account) => account.is_postable && (`${account.account_number} ${account.name}`).toLowerCase().includes(term));
    if (sortedGlAccounts.length > 200) {
      return filtered.slice(0, 100);
    }
    return filtered;
  };

  return (
    <div className="space-y-6">
      {toast ? <div className="fixed right-4 top-4 z-[70] rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow">{toast}</div> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting</p>
          <h1 className="text-2xl font-bold">General Ledger Command Center</h1>
          <p className="text-sm text-muted">SAP-grade cockpit for journals, close health, and financial movement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-button" onClick={() => setCreateOpen(true)}>+ New Journal Entry</button>
          <Link className="app-button-secondary" to="/accounting/gl/reports">Trial Balance</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "dashboard", label: "Dashboard", to: "/accounting/gl" },
          { key: "journals", label: "Journals", to: "/accounting/gl/journals" },
          { key: "trial", label: "Trial Balance", to: "/accounting/gl/reports" },
          { key: "close", label: "Close", to: "/accounting/gl/close" },
          { key: "reports", label: "Reports", to: "/accounting/gl/reports" },
        ].map((tab) => (
          <Link key={tab.key} to={tab.to} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab.key === "dashboard" ? "bg-primary text-primary-foreground shadow-glow" : "bg-gray-100 text-muted hover:bg-gray-200"}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="app-card p-4">
        <DashboardFilter period={period} onPeriodChange={(next) => setPeriod(next)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <button key={kpi.label} type="button" className="app-card border-l-4 border-l-primary p-4 text-left hover:shadow-lg" onClick={kpi.onClick}>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
            {kpi.sub ? <p className="mt-1 text-xs text-muted">{kpi.sub}</p> : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="app-card p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Net Income Trend (12 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={summary?.net_income_series ?? []} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="period" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} tickFormatter={(v) => money(v)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => money(v)} />
              <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="app-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Posting Volume</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary?.posted_volume_series ?? []} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="period" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="app-card p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Revenue vs Expenses (12 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={(summary?.revenue_series ?? []).map((item, index) => ({
                period: item.period,
                revenue: item.value,
                expenses: summary?.expense_series?.[index]?.value ?? 0,
              }))}
              margin={CHART_MARGIN}
            >
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="period" {...AXIS_STYLE} />
              <YAxis {...AXIS_STYLE} tickFormatter={(v) => money(v)} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => money(v)} />
              <Legend />
              <Bar dataKey="revenue" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="app-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Account Balance Composition</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={summary?.account_balance_composition ?? []} dataKey="value" nameKey="category" innerRadius={56} outerRadius={90} paddingAngle={2}>
                {(summary?.account_balance_composition ?? []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="app-card p-4 xl:col-span-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          <div className="space-y-2">
            {QUEUES.map((item) => {
              const count =
                item.key === "all"
                  ? filteredQueueCounts.all
                  : item.key === "needs_attention"
                    ? filteredQueueCounts.needsAttention
                    : item.key === "draft"
                      ? filteredQueueCounts.draft
                      : item.key === "ready"
                        ? filteredQueueCounts.ready
                        : item.key === "posted"
                          ? filteredQueueCounts.posted
                          : filteredQueueCounts.reversed;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setQueue(item.key);
                    setPage(1);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${queue === item.key ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <span>{item.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{numberSafe(count)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="app-card overflow-hidden xl:col-span-3">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="app-input w-full pl-9" placeholder="Search journals" />
              </div>
              <select className="app-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All status</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
              <select className="app-select" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">All source</option>
                <option value="MANUAL">Manual</option>
                <option value="AR">AR</option>
                <option value="PAYMENTS">Payments</option>
                <option value="PURCHASING">Purchasing</option>
              </select>
              <input className="app-input" placeholder="Period (YYYY-MM)" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} />
              <select className="app-select" value={density} onChange={(e) => setDensity(e.target.value as "comfortable" | "compact")}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
              <div className="relative">
                <button type="button" className="app-button-ghost" onClick={() => setColumnsOpen((p) => !p)}><Settings2 className="h-4 w-4" /> Columns <ChevronDown className="h-3 w-3" /></button>
                {columnsOpen ? (
                  <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border bg-surface p-2 shadow-xl">
                    {Object.keys(columns).map((key) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1 text-sm">
                        <input type="checkbox" checked={columns[key]} onChange={(e) => setColumns((prev) => ({ ...prev, [key]: e.target.checked }))} />
                        {key}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" className="app-button-secondary" onClick={() => void loadJournals()}>Apply</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="px-4 py-3 text-left">Doc #</th>
                  <th className="px-4 py-3 text-left">Posting Date</th>
                  <th className="px-4 py-3 text-left">Doc Type</th>
                  {columns.source && <th className="px-4 py-3 text-left">Source</th>}
                  {columns.reference && <th className="px-4 py-3 text-left">Reference</th>}
                  <th className="px-4 py-3 text-right">Debits</th>
                  <th className="px-4 py-3 text-right">Credits</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {columns.updated && <th className="px-4 py-3 text-left">Updated</th>}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-4 py-8 text-center text-muted" colSpan={10}>Loading journals…</td></tr>
                ) : journals.length === 0 ? (
                  <tr><td className="px-4 py-8 text-center text-muted" colSpan={10}>No journals found.</td></tr>
                ) : (
                  journals.map((row) => (
                    <tr key={row.id} className={`border-t hover:bg-muted/30 ${density === "compact" ? "h-9" : "h-12"}`}>
                      <td className="px-4 py-2"><button type="button" className="font-medium text-primary underline" onClick={() => void openJournal(row.id)}>{row.document_number}</button></td>
                      <td className="px-4 py-2">{row.posting_date}</td>
                      <td className="px-4 py-2">{row.document_type}</td>
                      {columns.source && <td className="px-4 py-2">{row.source_module}</td>}
                      {columns.reference && <td className="px-4 py-2">{row.reference || "—"}</td>}
                      <td className="px-4 py-2 text-right">{money(row.debits)}</td>
                      <td className="px-4 py-2 text-right">{money(row.credits)}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${row.status === "POSTED" ? "bg-emerald-100 text-emerald-700" : row.status === "REVERSED" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{row.status}</span></td>
                      {columns.updated && <td className="px-4 py-2">{new Date(row.updated_at).toLocaleString()}</td>}
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" className="text-primary underline" onClick={() => void openJournal(row.id)}>View</button>
                          {row.status === "DRAFT" ? <button type="button" className="text-primary underline" onClick={() => void runJournalAction(row.id, "post")}>Post</button> : null}
                          {row.status === "POSTED" ? <button type="button" className="text-primary underline" onClick={() => void runJournalAction(row.id, "reverse")}>Reverse</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <p>Total: {total}</p>
            <div className="flex items-center gap-2">
              <button type="button" className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span>Page {page}</span>
              <button type="button" className="app-button-secondary" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      </div>

      {selectedJournal ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedJournal(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            {drawerLoading ? <p>Loading…</p> : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted">Journal Detail</p>
                    <h2 className="text-xl font-semibold">{selectedJournal.document_number}</h2>
                    <p className="text-sm text-muted">{selectedJournal.fiscal_year}-{String(selectedJournal.period_number).padStart(2, "0")} · {selectedJournal.source_module}</p>
                  </div>
                  <button type="button" className="app-button-ghost" onClick={() => setSelectedJournal(null)}><X className="h-4 w-4" /></button>
                </div>
                <div className="mb-4 rounded-lg border p-3 text-sm">
                  <p>Status: <span className="font-semibold">{selectedJournal.status}</span></p>
                  <p>Posting Date: {selectedJournal.posting_date}</p>
                  <p>Reference: {selectedJournal.reference || "—"}</p>
                </div>
                <div className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold">Line Items</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="py-2 text-left">Account</th><th className="py-2 text-left">Description</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th></tr></thead>
                    <tbody>
                      {selectedJournal.lines.map((line, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="py-2">{accountNameMap.get(line.gl_account_id) || line.gl_account_id}</td>
                          <td className="py-2">{line.description || "—"}</td>
                          <td className="py-2 text-right">{money(line.debit_amount)}</td>
                          <td className="py-2 text-right">{money(line.credit_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mb-4 rounded-lg border p-3 text-sm">
                  <p className="font-semibold">Validation</p>
                  <p className="mt-1">{selectedJournal.lines.reduce((s, l) => s + Number(l.debit_amount || 0), 0) === selectedJournal.lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0) ? "Balanced" : "Out of balance"}</p>
                  <p>{summary?.current_period_open ? "Period open" : "Period closed"}</p>
                  <p>{selectedJournal.lines.some((l) => !l.gl_account_id) ? "Missing account mapping" : "Accounts mapped"}</p>
                </div>
                <div className="mb-6 rounded-lg border p-3 text-sm">
                  <p className="font-semibold">Audit Trail</p>
                  <p>Created by: {selectedJournal.created_by || "system"}</p>
                  <p>Created: {selectedJournal.created_at ? new Date(selectedJournal.created_at).toLocaleString() : "—"}</p>
                  <p>Posted by: {selectedJournal.posted_by || "—"}</p>
                  <p>Posted: {selectedJournal.posted_at ? new Date(selectedJournal.posted_at).toLocaleString() : "—"}</p>
                </div>
                <div className="flex gap-2">
                  {selectedJournal.status === "DRAFT" ? <button type="button" className="app-button" onClick={() => void runJournalAction(selectedJournal.id, "post")}>Post</button> : null}
                  {selectedJournal.status === "POSTED" ? <button type="button" className="app-button-secondary" onClick={() => void runJournalAction(selectedJournal.id, "reverse")}>Reverse</button> : null}
                  <button type="button" className="app-button-secondary" onClick={() => setToast("PDF export stub triggered.")}>Export PDF</button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setCreateOpen(false)}>
          <div className="app-card flex max-h-[90vh] w-[min(1100px,96vw)] flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-semibold">Create Journal Entry</h2>
                <p className="text-sm text-muted">Manual GL entry with posting validation.</p>
              </div>
              <button type="button" className="app-button-ghost" onClick={() => setCreateOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              {createError ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div> : null}
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm">Ledger / Company
                  <select
                    className="app-input mt-1"
                    value={selectedLedgerId}
                    onChange={(e) => {
                      const nextLedger = ledgers.find((ledger) => ledger.id === Number(e.target.value));
                      if (!nextLedger) return;
                      setForm((prev) => ({ ...prev, ledger_id: nextLedger.id, company_code_id: nextLedger.company_code_id }));
                    }}
                  >
                    {ledgers.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>{`${ledger.name} / ${ledger.company_code_id}`}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">Posting Date
                  <input type="date" className="app-input mt-1" value={form.posting_date} onChange={(e) => setForm((p) => ({ ...p, posting_date: e.target.value }))} />
                </label>
                <label className="text-sm">Document Date
                  <input type="date" className="app-input mt-1" value={form.document_date} onChange={(e) => setForm((p) => ({ ...p, document_date: e.target.value }))} />
                </label>
                <label className="text-sm md:col-span-1">Reference
                  <input className="app-input mt-1" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
                </label>
                <label className="text-sm md:col-span-2">Description
                  <input className="app-input mt-1" value={form.header_text} onChange={(e) => setForm((p) => ({ ...p, header_text: e.target.value }))} />
                </label>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Line Editor</h3>
                  <button type="button" className="app-button-secondary" onClick={() => setLines((prev) => [...prev, { gl_account_id: 0, description: "", debit_amount: "", credit_amount: "" }])}>Add Line</button>
                </div>
                {glAccountsLoading ? <p className="mb-2 text-xs text-muted">Loading Chart of Accounts…</p> : null}
                {!glAccountsLoading && glAccounts.length === 0 ? (
                  <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    No GL accounts found. Please create Chart of Accounts first. <Link to="/accounts" className="font-semibold underline">Go to Chart of Accounts</Link>
                  </div>
                ) : null}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b bg-gray-50"><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2" /></tr></thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-1">
                              <input
                                className="app-input w-full"
                                placeholder="Search account"
                                value={lineAccountSearch[idx] ?? (line.gl_account_id > 0 ? `${sortedGlAccounts.find((a) => a.id === line.gl_account_id)?.account_number || ""} — ${sortedGlAccounts.find((a) => a.id === line.gl_account_id)?.name || ""}` : "")}
                                onChange={(e) => setLineAccountSearch((prev) => ({ ...prev, [idx]: e.target.value }))}
                                onFocus={() => setLineAccountSearch((prev) => ({ ...prev, [idx]: prev[idx] ?? "" }))}
                              />
                              <div className="max-h-36 overflow-y-auto rounded-md border bg-surface">
                                {getLineOptions(idx).map((account) => (
                                  <button
                                    type="button"
                                    key={account.id}
                                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                                    onClick={() => {
                                      setLines((prev) => prev.map((l, i) => i === idx ? { ...l, gl_account_id: account.id } : l));
                                      setLineAccountSearch((prev) => ({ ...prev, [idx]: `${account.account_number} — ${account.name}` }));
                                      setLineAccountErrors((prev) => {
                                        const next = { ...prev };
                                        delete next[idx];
                                        return next;
                                      });
                                    }}
                                  >
                                    {account.account_number} — {account.name}
                                  </button>
                                ))}
                              </div>
                              {sortedGlAccounts.length > 200 ? <p className="text-[11px] text-muted">Showing up to 100 results. Keep typing to refine search.</p> : null}
                              {lineAccountErrors[idx] ? <p className="text-xs text-red-600">{lineAccountErrors[idx]}</p> : null}
                            </div>
                          </td>
                          <td className="px-3 py-2"><input className="app-input" value={line.description} onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))} /></td>
                          <td className="px-3 py-2"><input inputMode="decimal" className="app-input text-right" value={line.debit_amount} onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, debit_amount: e.target.value, credit_amount: e.target.value ? "" : l.credit_amount } : l))} /></td>
                          <td className="px-3 py-2"><input inputMode="decimal" className="app-input text-right" value={line.credit_amount} onChange={(e) => setLines((prev) => prev.map((l, i) => i === idx ? { ...l, credit_amount: e.target.value, debit_amount: e.target.value ? "" : l.debit_amount } : l))} /></td>
                          <td className="px-3 py-2 text-right"><button type="button" className="app-button-ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={`rounded-lg border px-4 py-3 text-sm ${balanceGap === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                {balanceGap === 0 ? "Balanced and ready to post." : `Out of balance: ${money(Math.abs(balanceGap))}`}
              </div>
              {!summary?.current_period_open ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" /> Posting period is closed for {summary?.current_period_label}.
                </div>
              ) : null}
            </div>
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-surface p-4">
              <button type="button" className="app-button-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="button" className="app-button-secondary" disabled={saving} onClick={() => void createJournal(false)}>Save Draft</button>
              <button type="button" className="app-button" disabled={saving || !canPost} onClick={() => void createJournal(true)}>Post</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
