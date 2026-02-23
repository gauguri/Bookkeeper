import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TransactionDetailsDrawer from "../../components/banking/TransactionDetailsDrawer";
import TransactionsTable from "../../components/banking/TransactionsTable";
import { BankTransaction, useBankAccounts, useBankTransactions, usePatchBankTransaction } from "../../hooks/useBanking";

const views = [
  { key: "", label: "All" },
  { key: "new", label: "Needs review" },
  { key: "uncategorized", label: "Uncategorized" },
  { key: "matched", label: "Unmatched" },
  { key: "reconciled", label: "Reconciled" },
];

export default function BankingTransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get("q") || "");
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState<BankTransaction | null>(null);
  const patch = usePatchBankTransaction();
  const { data: accounts } = useBankAccounts();

  useEffect(() => {
    const t = window.setTimeout(() => setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (draft) next.set("q", draft); else next.delete("q");
      return next;
    }, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [draft, setSearchParams]);

  const filters = useMemo(() => ({
    search: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    category: searchParams.get("category") || undefined,
    account_id: searchParams.get("account") || undefined,
    direction: searchParams.get("direction") || undefined,
    start_date: searchParams.get("start") || undefined,
    end_date: searchParams.get("end") || undefined,
    amount_min: searchParams.get("min") || undefined,
    amount_max: searchParams.get("max") || undefined,
  }), [searchParams]);

  const { data, isLoading } = useBankTransactions(filters);

  const bulkUpdate = async (updates: Record<string, unknown>) => {
    await Promise.all(selected.map((id) => patch.mutateAsync({ id, updates })));
    setSelected([]);
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="app-card p-3">
        <h2 className="text-sm font-semibold">Saved views</h2>
        <div className="mt-2 space-y-1">
          {views.map((view) => (
            <button key={view.label} className="app-button-ghost w-full justify-start" onClick={() => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (view.key === "uncategorized") {
                next.delete("status");
                next.delete("category");
              } else if (view.key) next.set("status", view.key); else next.delete("status");
              return next;
            })}>{view.label}</button>
          ))}
        </div>
      </aside>

      <main className="space-y-3">
        <header className="app-card p-4">
          <h1 className="text-2xl font-semibold">Bank transactions</h1>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input className="app-input md:col-span-2" placeholder="Search description, vendor, reference" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <select className="app-select" value={searchParams.get("account") || ""} onChange={(event) => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (event.target.value) next.set("account", event.target.value); else next.delete("account");
              return next;
            })}><option value="">All accounts</option>{accounts?.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
            <select className="app-select" value={searchParams.get("direction") || ""} onChange={(event) => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (event.target.value) next.set("direction", event.target.value); else next.delete("direction");
              return next;
            })}><option value="">Any direction</option><option value="debit">Debit</option><option value="credit">Credit</option></select>
          </div>
        </header>

        {selected.length ? <div className="app-card flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{selected.length} selected</span><div className="flex gap-2"><button className="app-button-secondary" onClick={() => bulkUpdate({ category: "Operations", status: "categorized" })}>Categorize</button><button className="app-button-secondary" onClick={() => bulkUpdate({ status: "excluded", excluded_reason: "user" })}>Mark excluded</button><button className="app-button-secondary" onClick={() => bulkUpdate({ status: "matched" })}>Match</button></div></div> : null}

        {isLoading ? <div className="app-card p-4"><div className="app-skeleton h-80" /></div> : <TransactionsTable rows={data?.items || []} selected={selected} onSelect={(id, checked) => setSelected((prev) => checked ? [...prev, id] : prev.filter((x) => x !== id))} onSelectAll={(checked) => setSelected(checked ? (data?.items || []).map((x) => x.id) : [])} onOpen={setOpen} />}
      </main>

      <TransactionDetailsDrawer
        transaction={open}
        onClose={() => setOpen(null)}
        onCategorize={(category) => open && patch.mutate({ id: open.id, updates: { category, status: "categorized" } })}
        onExclude={() => open && patch.mutate({ id: open.id, updates: { status: "excluded" } })}
      />
    </section>
  );
}
