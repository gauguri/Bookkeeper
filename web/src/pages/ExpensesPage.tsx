import { useEffect, useMemo, useState } from "react";
import { createJournalEntry, listJournalEntries, apiFetch } from "../api";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COGS" | "OTHER";

type Account = {
  id: number;
  code?: string | null;
  name: string;
  type: AccountType;
  is_active: boolean;
  balance: number;
};

type Entry = {
  id: number;
  date: string;
  memo?: string | null;
  amount: number;
  source_type: string;
  debit_account: string;
  credit_account: string;
};

const typeOptions: Array<AccountType | "ALL"> = ["ALL", "ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS", "OTHER"];

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "ALL">("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [error, setError] = useState("");
  const [dragAccountId, setDragAccountId] = useState<number | null>(null);
  const [moveModal, setMoveModal] = useState<{ from: Account; to: Account } | null>(null);
  const [amount, setAmount] = useState("0");
  const [memo, setMemo] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    try {
      const [accountData, entryData] = await Promise.all([apiFetch<Account[]>("/chart-of-accounts"), listJournalEntries<Entry[]>("limit=50")]);
      setAccounts(accountData);
      setEntries(entryData);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (activeOnly && !account.is_active) return false;
        if (typeFilter !== "ALL" && account.type !== typeFilter) return false;
        if (search.trim()) {
          const term = search.toLowerCase();
          return account.name.toLowerCase().includes(term) || (account.code || "").toLowerCase().includes(term);
        }
        return true;
      }),
    [accounts, activeOnly, search, typeFilter]
  );

  const startMove = (fromId: number, toId: number) => {
    const from = accounts.find((account) => account.id === fromId);
    const to = accounts.find((account) => account.id === toId);
    if (!from || !to) return;
    if (from.id === to.id) {
      setError("Please drop onto a different account.");
      return;
    }
    setMoveModal({ from, to });
    setAmount("0");
    setMemo("");
    setEntryDate(new Date().toISOString().slice(0, 10));
  };

  const postMove = async () => {
    if (!moveModal) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    try {
      await createJournalEntry({
        date: entryDate,
        memo: memo || `Move from ${moveModal.from.name} to ${moveModal.to.name}`,
        source_type: "MANUAL",
        lines: [
          { account_id: moveModal.to.id, direction: "DEBIT", amount: parsedAmount },
          { account_id: moveModal.from.id, direction: "CREDIT", amount: parsedAmount }
        ]
      });
      setMoveModal(null);
      setError("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <p className="text-muted">Record and reclassify entries using double-entry accounting.</p>
        </div>
        <button className="app-button" onClick={() => setMoveModal(accounts.length > 1 ? { from: accounts[0], to: accounts[1] } : null)}>New entry</button>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="app-card space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input className="app-input" placeholder="Search accounts" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="app-input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as AccountType | "ALL")}>{typeOptions.map((option) => <option key={option} value={option}>{option === "ALL" ? "All" : option}</option>)}</select>
          <button className="app-button-secondary" onClick={() => setActiveOnly((prev) => !prev)}>{activeOnly ? "Active only" : "All"}</button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[90px_1fr_120px_130px] px-3 text-xs uppercase tracking-wide text-muted">
            <span>Code</span><span>Name</span><span>Type</span><span className="text-right">Balance</span>
          </div>
          {filteredAccounts.map((account) => (
            <div
              key={account.id}
              draggable
              onDragStart={() => setDragAccountId(account.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dragAccountId && startMove(dragAccountId, account.id)}
              className="grid cursor-grab grid-cols-[90px_1fr_120px_130px] items-center rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/40"
            >
              <span className="text-muted">{account.code || "—"}</span>
              <span className="font-medium">{account.name}</span>
              <span className="text-muted">{account.type}</span>
              <span className="text-right font-semibold">${Number(account.balance || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Memo</th><th className="px-3 py-2 text-left">Debit account</th><th className="px-3 py-2 text-left">Credit account</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border/70">
                  <td className="px-3 py-2">{entry.date}</td>
                  <td className="px-3 py-2">{entry.memo || "—"}</td>
                  <td className="px-3 py-2">{entry.debit_account}</td>
                  <td className="px-3 py-2">{entry.credit_account}</td>
                  <td className="px-3 py-2 text-right">${Number(entry.amount).toFixed(2)}</td>
                  <td className="px-3 py-2">{entry.source_type === "PURCHASE_ORDER" ? "PO" : "Manual"}</td>
                  <td className="px-3 py-2">View</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {moveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="text-xl font-semibold">Move funds</h2>
            <p className="text-sm text-muted">From: {moveModal.from.name} → To: {moveModal.to.name}</p>
            <label className="block text-sm text-muted">Amount<input className="app-input mt-1" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label className="block text-sm text-muted">Date<input className="app-input mt-1" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
            <label className="block text-sm text-muted">Memo<input className="app-input mt-1" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Optional notes" /></label>
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <p>Debit {moveModal.to.name} +${Number(amount || 0).toFixed(2)}</p>
              <p>Credit {moveModal.from.name} -${Number(amount || 0).toFixed(2)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="app-button-secondary" onClick={() => setMoveModal(null)}>Cancel</button>
              <button className="app-button" onClick={postMove}>Post entry</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
