import { useEffect, useRef, useState } from "react";
import { Search, Command } from "lucide-react";
import { listPurchaseOrders } from "../../api";

type PORow = {
  id: number;
  po_number: string;
  supplier_name: string;
  status: string;
};

type Props = { onSelectPO?: (poId: number) => void };

const statusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "draft") return "app-badge border-slate-300 bg-slate-100 text-slate-600";
  if (s === "sent") return "app-badge border-blue-300 bg-blue-50 text-blue-700";
  if (s === "received") return "app-badge border-green-300 bg-green-50 text-green-700";
  if (s === "cancelled") return "app-badge border-red-300 bg-red-50 text-red-600";
  if (s === "partially_received") return "app-badge border-amber-300 bg-amber-50 text-amber-700";
  return "app-badge border-slate-300 bg-slate-100 text-slate-600";
};

export default function POGlobalSearch({ onSelectPO }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allPOs, setAllPOs] = useState<PORow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      listPurchaseOrders<PORow[]>().then(setAllPOs).catch(() => {});
    }
    if (!open) setQuery("");
  }, [open]);

  const q = query.toLowerCase();
  const results = q
    ? allPOs
        .filter(
          (po) =>
            po.po_number.toLowerCase().includes(q) ||
            po.supplier_name.toLowerCase().includes(q) ||
            po.status.toLowerCase().includes(q)
        )
        .slice(0, 8)
    : [];

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="app-input flex items-center gap-2 text-left"
        style={{ maxWidth: 360 }}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <span className="text-muted">Search POs, suppliers...</span>
        <kbd className="ml-auto flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs text-muted">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 pt-[15vh]" onClick={() => setOpen(false)}>
          <div
            className="app-card w-full max-w-lg overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search purchase orders..."
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <kbd className="rounded border px-1.5 py-0.5 text-xs text-muted">ESC</kbd>
            </div>

            {results.length > 0 && (
              <ul className="max-h-64 overflow-y-auto p-2">
                {results.map((po) => (
                  <li key={po.id}>
                    <button
                      className="app-table-row flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm"
                      onClick={() => {
                        onSelectPO?.(po.id);
                        setOpen(false);
                      }}
                    >
                      <span className="font-semibold text-primary">{po.po_number}</span>
                      <span className="text-muted">{po.supplier_name}</span>
                      <span className={statusBadge(po.status)} style={{ marginLeft: "auto" }}>{po.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query && results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No results found.</p>
            )}

            {!query && (
              <p className="px-4 py-6 text-center text-sm text-muted">Start typing to search...</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
