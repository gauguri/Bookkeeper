import { useEffect, useRef } from "react";
import { Entry } from "./types";

type Props = {
  entry: Entry | null;
  onClose: () => void;
};

export default function ExpenseDetailsDrawer({ entry, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Expense details"
        ref={drawerRef}
        className="bedrock-surface absolute right-0 top-0 h-full w-full max-w-md rounded-none border-l border-[var(--bedrock-border)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold">Expense #{entry.id}</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div><dt className="text-[var(--bedrock-muted)]">Date</dt><dd>{entry.date}</dd></div>
          <div><dt className="text-[var(--bedrock-muted)]">Memo</dt><dd>{entry.memo || "—"}</dd></div>
          <div><dt className="text-[var(--bedrock-muted)]">Debit</dt><dd>{entry.debit_account}</dd></div>
          <div><dt className="text-[var(--bedrock-muted)]">Credit</dt><dd>{entry.credit_account}</dd></div>
          <div><dt className="text-[var(--bedrock-muted)]">Amount</dt><dd>${Number(entry.amount).toFixed(2)}</dd></div>
        </dl>
        <div className="mt-6 flex gap-2">
          <button className="app-button-secondary">Edit</button>
          <button className="app-button-secondary">Duplicate</button>
          <button className="app-button-secondary !text-[var(--bedrock-danger)]">Delete</button>
        </div>
        <button className="mt-3 text-sm underline" onClick={onClose}>Close</button>
      </aside>
    </div>
  );
}
