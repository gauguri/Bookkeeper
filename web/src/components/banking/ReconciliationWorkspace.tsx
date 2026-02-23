import { ReconciliationWorkspace } from "../../hooks/useBanking";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  workspace?: ReconciliationWorkspace;
  loading?: boolean;
  onMatch: (transactionId: number, entityType: string, entityId: number, confidence: number) => void;
  onClose: (force?: boolean) => void;
};

export default function ReconciliationWorkspacePanel({ workspace, loading, onMatch, onClose }: Props) {
  if (loading) return <div className="app-card p-4"><div className="app-skeleton h-72" /></div>;
  if (!workspace) return <div className="app-card p-8 text-center text-muted">Start a reconciliation session to open the matching workspace.</div>;

  return (
    <div className="space-y-3">
      <header className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex gap-6 text-sm">
          <span><strong>{workspace.cleared_count}</strong> cleared</span>
          <span><strong>{workspace.uncleared_count}</strong> uncleared</span>
          <span>Difference: <strong className={workspace.difference === 0 ? "text-success" : "text-danger"}>{formatCurrency(workspace.difference)}</strong></span>
        </div>
        <div className="flex gap-2">
          <button className="app-button-secondary" onClick={() => onClose(true)}>Force close</button>
          <button className="app-button" disabled={workspace.difference !== 0} onClick={() => onClose(false)}>Finish reconciliation</button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="app-card p-4">
          <h3 className="text-sm font-semibold">Bank transactions (uncleared)</h3>
          <ul className="mt-3 space-y-2">
            {workspace.uncleared_transactions.map((txn) => (
              <li key={txn.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2"><p className="font-medium">{txn.description}</p><span className={txn.amount < 0 ? "text-danger" : "text-success"}>{formatCurrency(txn.amount)}</span></div>
                <p className="text-xs text-muted">{txn.posted_date}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="app-card p-4">
          <h3 className="text-sm font-semibold">Suggested matches</h3>
          <div className="mt-3 space-y-3">
            {workspace.uncleared_transactions.slice(0, 6).map((txn) => (
              <div key={txn.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium">{txn.description}</p>
                <div className="mt-2 space-y-1">
                  {(workspace.candidates[txn.id] || []).map((candidate) => (
                    <button key={`${candidate.entity_type}-${candidate.entity_id}`} className="flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left text-xs hover:bg-secondary" onClick={() => onMatch(txn.id, candidate.entity_type, candidate.entity_id, candidate.confidence)}>
                      <span>{candidate.description} • {candidate.date}</span>
                      <span>{candidate.confidence}%</span>
                    </button>
                  ))}
                  {!(workspace.candidates[txn.id] || []).length ? <p className="text-xs text-muted">No match suggestions. Use manual match in next iteration.</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
