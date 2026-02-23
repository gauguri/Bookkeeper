import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createJournalEntry, listJournalEntries, apiFetch } from "../api";
import ExpensesRail from "../components/expenses/ExpensesRail";
import ExpensesHeaderBar from "../components/expenses/ExpensesHeaderBar";
import ExpensesCharts from "../components/expenses/ExpensesCharts";
import ExpensesTable from "../components/expenses/ExpensesTable";
import ExpenseDetailsDrawer from "../components/expenses/ExpenseDetailsDrawer";
import { Account, DateRange, Density, Entry } from "../components/expenses/types";
import "../styles/bedrockSurface.css";

const defaultColumns = { date: true, memo: true, debit: true, credit: true, amount: true, source: true };

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [columns, setColumns] = useState(defaultColumns);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");

  const search = searchParams.get("q") ?? "";
  const view = searchParams.get("view") ?? "all";
  const dateRange = (searchParams.get("range") as DateRange) ?? "mtd";
  const density = (searchParams.get("density") as Density) ?? "comfortable";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  const setParam = (key: string, value: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!value) next.delete(key);
      else next.set(key, value);
      if (key !== "page") next.set("page", "1");
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setParam("q", searchDraft), 320);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const load = async () => {
    try {
      setIsLoading(true);
      const [accountData, entryData] = await Promise.all([apiFetch<Account[]>("/chart-of-accounts"), listJournalEntries<Entry[]>("limit=200")]);
      setAccounts(accountData);
      setEntries(entryData);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const expenseAccounts = useMemo(() => accounts.filter((account) => account.type === "EXPENSE" && account.is_active), [accounts]);
  const fundingAccounts = useMemo(() => accounts.filter((account) => ["ASSET", "LIABILITY"].includes(account.type) && account.is_active), [accounts]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (!expenseAccountId && expenseAccounts.length > 0) setExpenseAccountId(String(expenseAccounts[0].id));
    if (!fundingAccountId && fundingAccounts.length > 0) setFundingAccountId(String((fundingAccounts.find((a) => a.name.toLowerCase().includes("cash")) ?? fundingAccounts[0]).id));
  }, [isModalOpen, expenseAccountId, fundingAccountId, expenseAccounts, fundingAccounts]);

  const resetModal = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setAmount("");
    setExpenseAccountId("");
    setFundingAccountId("");
    setIsModalOpen(false);
  };

  const saveExpense = async () => {
    const parsedAmount = Number(amount);
    if (!expenseAccountId || !fundingAccountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Please complete all fields with a valid amount.");
      return;
    }
    try {
      await createJournalEntry({
        date,
        memo: memo || null,
        source_type: "MANUAL",
        lines: [
          { account_id: Number(expenseAccountId), direction: "DEBIT", amount: parsedAmount },
          { account_id: Number(fundingAccountId), direction: "CREDIT", amount: parsedAmount }
        ]
      });
      resetModal();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filteredEntries = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const matchesDateRange = (entryDate: string) => {
      const value = new Date(entryDate);
      if (dateRange === "qtd") return value >= startOfQuarter;
      if (dateRange === "ytd") return value >= startOfYear;
      return value >= startOfMonth;
    };

    return entries.filter((entry) => {
      if (!matchesDateRange(entry.date)) return false;
      const isExpenseEntry = entry.debit_account_type === "EXPENSE" || entry.credit_account_type === "EXPENSE";
      if (view === "manual" && entry.source_type !== "MANUAL") return false;
      if (view === "purchase" && entry.source_type !== "PURCHASE_ORDER") return false;
      if (view === "unreviewed" && entry.memo) return false;
      if (view === "all" && !isExpenseEntry) return false;

      if (!search.trim()) return true;
      const needle = search.toLowerCase();
      return [entry.memo ?? "", entry.debit_account, entry.credit_account, entry.source_type].join(" ").toLowerCase().includes(needle);
    });
  }, [entries, search, view, dateRange]);

  const handleQuickAction = (action: "new" | "export" | "import") => {
    if (action === "new") setIsModalOpen(true);
    if (action === "export") {
      const rows = filteredEntries.map((item) => `${item.date},${JSON.stringify(item.memo || "")},${item.amount},${item.source_type}`).join("\n");
      const blob = new Blob([`date,memo,amount,source\n${rows}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "expenses-export.csv";
      link.click();
      URL.revokeObjectURL(url);
    }
    if (action === "import") setError("Import is not yet available in this module.");
  };

  return (
    <section className="bedrock-expenses-shell min-h-[80vh] p-3 sm:p-4 lg:p-5">
      <div className="relative z-10 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ExpensesRail
          entries={entries}
          currentView={view}
          onViewChange={(next) => setParam("view", next)}
          onQuickAction={handleQuickAction}
          onApplyFilter={(filter) => {
            if (filter === "advanced") setShowAdvancedFilters((value) => !value);
            if (filter === "manual") setParam("view", "manual");
            if (filter === "mtd") setParam("range", "mtd");
            if (filter === "qtd") setParam("range", "qtd");
          }}
        />

        <main className="space-y-4">

          <div className="bedrock-surface rounded-2xl p-3 lg:hidden">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--bedrock-muted)]">Expenses command center</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="app-button !bg-[var(--bedrock-accent)]" onClick={() => handleQuickAction("new")}>New expense</button>
              <button className="app-button-secondary !border-[var(--bedrock-border)] !bg-transparent !text-[var(--bedrock-text)] hover:!bg-[var(--pl-hover)]" onClick={() => setParam("view", "all")}>All entries</button>
              <button className="app-button-secondary !border-[var(--bedrock-border)] !bg-transparent !text-[var(--bedrock-text)] hover:!bg-[var(--pl-hover)]" onClick={() => setShowAdvancedFilters((v) => !v)}>Advanced filters</button>
            </div>
          </div>

          <ExpensesHeaderBar
            search={searchDraft}
            dateRange={dateRange}
            density={density}
            onSearch={setSearchDraft}
            onDateRange={(next) => setParam("range", next)}
            onDensity={(next) => setParam("density", next)}
            onToggleColumns={() => setColumns((current) => ({ ...current, memo: !current.memo }))}
          />

          {showAdvancedFilters ? <div className="bedrock-surface rounded-xl p-3 text-sm">Advanced filters coming next: source, account, amount ranges.</div> : null}
          {error ? <div className="rounded-xl border border-[var(--bedrock-danger)]/45 bg-[var(--bedrock-danger)]/15 px-4 py-3 text-sm">{error}</div> : null}

          <ExpensesCharts
            entries={filteredEntries}
            loading={isLoading}
            onFilter={(type, value) => {
              if (type === "source") setParam("view", value.startsWith("Manual") ? "manual" : "purchase");
              else setSearchDraft(value);
            }}
          />

          {selectedRows.length > 0 ? (
            <div className="bedrock-surface flex items-center justify-between rounded-xl px-3 py-2 text-sm">
              <span>{selectedRows.length} selected</span>
              <div className="flex gap-2"><button className="app-button-secondary">Export selected</button><button className="app-button-secondary">Tag selected</button></div>
            </div>
          ) : null}

          <ExpensesTable
            entries={filteredEntries}
            density={density}
            page={page}
            pageSize={pageSize}
            onPage={(next) => setParam("page", String(next))}
            onPageSize={(next) => setParam("pageSize", String(next))}
            visibleColumns={columns}
            selected={selectedRows}
            onSelect={(id, checked) => setSelectedRows((rows) => checked ? [...rows, id] : rows.filter((rowId) => rowId !== id))}
            onSelectAll={(checked) => setSelectedRows(checked ? filteredEntries.map((row) => row.id) : [])}
            onOpenDetails={setOpenEntry}
          />
        </main>
      </div>

      <ExpenseDetailsDrawer entry={openEntry} onClose={() => setOpenEntry(null)} />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="text-xl font-semibold">New expense</h2>
            <label className="block text-sm text-muted">Date<input className="app-input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className="block text-sm text-muted">Payee / Memo<input className="app-input mt-1" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Who or what is this expense for?" /></label>
            <label className="block text-sm text-muted">Expense account<select className="app-input mt-1" value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}><option value="">Select expense account</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-sm text-muted">Funding account<select className="app-input mt-1" value={fundingAccountId} onChange={(event) => setFundingAccountId(event.target.value)}><option value="">Select funding account</option>{fundingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-sm text-muted">Amount<input className="app-input mt-1" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <div className="flex justify-end gap-2"><button className="app-button-secondary" onClick={resetModal}>Cancel</button><button className="app-button" onClick={saveExpense}>Save</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
