import { useEffect } from "react";
import { BankTransaction } from "../../hooks/useBanking";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  transaction: BankTransaction | null;
  onClose: () => void;
  onCategorize: (category: string) => void;
  onExclude: () => void;
};

export default function TransactionDetailsDrawer({ transaction, onClose, onCategorize, onExclude }: Props) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Transaction details" className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-surface p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{transaction.description}</h2>
            <p className="text-sm text-muted">{transaction.posted_date} • {transaction.reference || "No reference"}</p>
          </div>
          <button className="app-button-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <p><span className="text-muted">Amount:</span> <strong>{formatCurrency(transaction.amount)}</strong></p>
          <p><span className="text-muted">Vendor:</span> {transaction.vendor || "—"}</p>
          <p><span className="text-muted">Category:</span> {transaction.category || "Uncategorized"}</p>
          <p><span className="text-muted">Status:</span> {transaction.status}</p>
        </div>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">Activity timeline</h3>
          <ol className="mt-3 space-y-3 border-l pl-4 text-sm">
            <li>Imported via {transaction.source}</li>
            {transaction.category ? <li>Categorized as {transaction.category}</li> : null}
            {transaction.status === "matched" || transaction.status === "reconciled" ? <li>Matched for reconciliation</li> : null}
          </ol>
        </section>

        <section className="mt-6 space-y-2">
          <button className="app-button w-full" onClick={() => onCategorize("Operations")}>Categorize</button>
          <button className="app-button-secondary w-full" onClick={onExclude}>Mark excluded</button>
        </section>
      </aside>
    </div>
  );
}
