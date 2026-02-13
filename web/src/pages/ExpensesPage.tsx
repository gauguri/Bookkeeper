import { useEffect, useMemo, useState } from "react";
import { createJournalEntry, listJournalEntries, apiFetch } from "../api";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COGS" | "OTHER";

type Account = {
  id: number;
  code?: string | null;
  name: string;
  type: AccountType;
  is_active: boolean;
};

type Entry = {
  id: number;
  date: string;
  memo?: string | null;
  amount: number;
  source_type: string;
  debit_account_id: number;
  credit_account_id: number;
  debit_account: string;
  credit_account: string;
  debit_account_code?: string | null;
  credit_account_code?: string | null;
  debit_account_type?: AccountType | null;
  credit_account_type?: AccountType | null;
};

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "expense">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [amount, setAmount] = useState("");

  const load = async () => {
    try {
      const [accountData, entryData] = await Promise.all([apiFetch<Account[]>("/chart-of-accounts"), listJournalEntries<Entry[]>("limit=100")]);
      setAccounts(accountData);
      setEntries(entryData);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const expenseAccounts = useMemo(() => accounts.filter((account) => account.type === "EXPENSE" && account.is_active), [accounts]);
  const fundingAccounts = useMemo(
    () => accounts.filter((account) => ["ASSET", "LIABILITY"].includes(account.type) && account.is_active),
    [accounts]
  );

  useEffect(() => {
    if (!isModalOpen) return;
    if (!expenseAccountId && expenseAccounts.length > 0) {
      setExpenseAccountId(String(expenseAccounts[0].id));
    }
    if (!fundingAccountId && fundingAccounts.length > 0) {
      const cashAccount = fundingAccounts.find((account) => account.name.toLowerCase().includes("cash"));
      setFundingAccountId(String((cashAccount ?? fundingAccounts[0]).id));
    }
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
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const isExpenseEntry = entry.debit_account_type === "EXPENSE" || entry.credit_account_type === "EXPENSE";
      if (view === "expense" && !isExpenseEntry) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [
        entry.memo ?? "",
        entry.debit_account,
        entry.credit_account,
        entry.debit_account_code ?? "",
        entry.credit_account_code ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, search, view]);

  const formatAccountLabel = (name: string, code?: string | null) => (code ? `${name} (${code})` : name);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <p className="text-muted">Record and review accounting entries.</p>
        </div>
        <button className="app-button" onClick={() => setIsModalOpen(true)}>New expense</button>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="app-card space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-[1fr,220px]">
          <input
            className="app-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search memo, payee, or account"
          />
          <label className="text-sm text-muted">
            View
            <select className="app-input mt-1" value={view} onChange={(event) => setView(event.target.value as "all" | "expense")}>
              <option value="all">All entries</option>
              <option value="expense">Expense entries only</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Memo/Payee</th>
                <th className="px-3 py-2 text-left">Debit account</th>
                <th className="px-3 py-2 text-left">Credit account</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted" colSpan={8}>No entries yet. Create your first expense.</td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted" colSpan={8}>
                    No expense entries yet. Switch to All entries or create an expense.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isExpenseEntry = entry.debit_account_type === "EXPENSE" || entry.credit_account_type === "EXPENSE";
                  return (
                    <tr key={entry.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{entry.date}</td>
                      <td className="px-3 py-2">{entry.memo || "—"}</td>
                      <td className="px-3 py-2">{formatAccountLabel(entry.debit_account, entry.debit_account_code)}</td>
                      <td className="px-3 py-2">{formatAccountLabel(entry.credit_account, entry.credit_account_code)}</td>
                      <td className="px-3 py-2 text-right">${Number(entry.amount).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {isExpenseEntry ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Expense</span> : "—"}
                      </td>
                      <td className="px-3 py-2">{entry.source_type === "PURCHASE_ORDER" ? "Purchase Order" : "Manual"}</td>
                      <td className="px-3 py-2">View</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="text-xl font-semibold">New expense</h2>
            <label className="block text-sm text-muted">
              Date
              <input className="app-input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="block text-sm text-muted">
              Payee / Memo
              <input className="app-input mt-1" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Who or what is this expense for?" />
            </label>
            <label className="block text-sm text-muted">
              Expense account
              <select className="app-input mt-1" value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}>
                <option value="">Select expense account</option>
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              Funding account
              <select className="app-input mt-1" value={fundingAccountId} onChange={(event) => setFundingAccountId(event.target.value)}>
                <option value="">Select funding account</option>
                {fundingAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              Amount
              <input
                className="app-input mt-1"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="app-button-secondary" onClick={resetModal}>Cancel</button>
              <button className="app-button" onClick={saveExpense}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
