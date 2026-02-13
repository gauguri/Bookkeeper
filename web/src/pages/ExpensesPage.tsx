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
};

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [amount, setAmount] = useState("");

  const load = async () => {
    try {
      const [accountData, entryData] = await Promise.all([
        apiFetch<Account[]>("/chart-of-accounts"),
        listJournalEntries<Entry[]>("limit=50&type=EXPENSE")
      ]);
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

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

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

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Expenses</h1>
          <p className="text-muted">Record and review expense transactions.</p>
        </div>
        <button className="app-button" onClick={() => setIsModalOpen(true)}>New expense</button>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <div className="app-card space-y-4 p-6">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Payee / Memo</th>
                <th className="px-3 py-2 text-left">Expense Account</th>
                <th className="px-3 py-2 text-left">Funding Account</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted" colSpan={7}>No expenses yet. Create your first expense.</td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const debitAccount = accountById.get(entry.debit_account_id);
                  const creditAccount = accountById.get(entry.credit_account_id);
                  const expenseSide = debitAccount?.type === "EXPENSE" ? entry.debit_account : creditAccount?.type === "EXPENSE" ? entry.credit_account : "—";
                  const fundingSide = debitAccount?.type === "EXPENSE" ? entry.credit_account : entry.debit_account;
                  return (
                    <tr key={entry.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{entry.date}</td>
                      <td className="px-3 py-2">{entry.memo || "—"}</td>
                      <td className="px-3 py-2">{expenseSide}</td>
                      <td className="px-3 py-2">{fundingSide}</td>
                      <td className="px-3 py-2 text-right">${Number(entry.amount).toFixed(2)}</td>
                      <td className="px-3 py-2">{entry.source_type === "PURCHASE_ORDER" ? "PO" : "Manual"}</td>
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
