import { useMemo, useState } from "react";
import ReconciliationWorkspacePanel from "../../components/banking/ReconciliationWorkspace";
import {
  useBankAccounts,
  useCloseReconciliationSession,
  useCreateMatch,
  useCreateReconciliationSession,
  useReconciliationSessions,
  useReconciliationWorkspace,
} from "../../hooks/useBanking";

export default function BankingReconciliationPage() {
  const { data: accounts } = useBankAccounts();
  const { data: sessions } = useReconciliationSessions();
  const [accountId, setAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [endingBalance, setEndingBalance] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | undefined>();

  const createSession = useCreateReconciliationSession();
  const closeSession = useCloseReconciliationSession();
  const match = useCreateMatch();

  const openSessionId = useMemo(() => activeSessionId || sessions?.find((session) => session.status === "open")?.id, [activeSessionId, sessions]);
  const workspace = useReconciliationWorkspace(openSessionId);

  return (
    <section className="space-y-4">
      <header className="app-card p-4">
        <h1 className="text-2xl font-semibold">Reconciliation</h1>
        <p className="text-sm text-muted">Guided match-and-clear workflow for statement periods.</p>

        <form className="mt-3 grid gap-2 md:grid-cols-5" onSubmit={async (event) => {
          event.preventDefault();
          const session = await createSession.mutateAsync({ bank_account_id: Number(accountId), period_start: periodStart, period_end: periodEnd, statement_ending_balance: Number(endingBalance) });
          setActiveSessionId(session.id);
        }}>
          <select className="app-select" required value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Select account</option>{accounts?.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
          <input className="app-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
          <input className="app-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
          <input className="app-input" type="number" step="0.01" value={endingBalance} onChange={(event) => setEndingBalance(event.target.value)} placeholder="Statement ending balance" required />
          <button className="app-button" type="submit">Start session</button>
        </form>
      </header>

      <ReconciliationWorkspacePanel
        workspace={workspace.data}
        loading={workspace.isLoading}
        onMatch={(transactionId, entityType, entityId, confidence) => match.mutate({ bank_transaction_id: transactionId, linked_entity_type: entityType, linked_entity_id: entityId, match_type: "manual", match_confidence: confidence })}
        onClose={(force) => openSessionId && closeSession.mutate({ sessionId: openSessionId, force })}
      />

      <section className="app-card p-4">
        <h3 className="text-sm font-semibold">Needs review queue</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {(workspace.data?.needs_review_transactions || []).slice(0, 10).map((transaction) => <li key={transaction.id} className="rounded-lg border px-3 py-2">{transaction.posted_date} • {transaction.description}</li>)}
          {!workspace.data?.needs_review_transactions?.length ? <li className="text-muted">No transactions need review.</li> : null}
        </ul>
      </section>
    </section>
  );
}
