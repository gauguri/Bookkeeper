import React from "react";
import { ArrowUpDown, Eye, Files, Pencil } from "lucide-react";
import { Entry } from "./types";

type ColumnKey = "date" | "memo" | "debit" | "credit" | "amount" | "source";

type Props = {
  entries: Entry[];
  density: "comfortable" | "compact";
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  visibleColumns: Record<ColumnKey, boolean>;
  selected: number[];
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onOpenDetails: (entry: Entry) => void;
};

export default function ExpensesTable(props: Props) {
  const { entries, density, page, pageSize, onPage, onPageSize, visibleColumns, selected, onSelect, onSelectAll, onOpenDetails } = props;
  const [sortKey, setSortKey] = React.useState<ColumnKey>("date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => [...entries].sort((a, b) => {
    const factor = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") return (Number(a.amount) - Number(b.amount)) * factor;
    const left = sortKey === "debit" ? a.debit_account : sortKey === "credit" ? a.credit_account : sortKey === "memo" ? (a.memo ?? "") : sortKey === "source" ? a.source_type : a.date;
    const right = sortKey === "debit" ? b.debit_account : sortKey === "credit" ? b.credit_account : sortKey === "memo" ? (b.memo ?? "") : sortKey === "source" ? b.source_type : b.date;
    return left.localeCompare(right) * factor;
  }), [entries, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const boundedPage = Math.min(page, totalPages);
  const paged = sorted.slice((boundedPage - 1) * pageSize, boundedPage * pageSize);
  const rowPadding = density === "compact" ? "py-1.5" : "py-2.5";

  const headerCell = (label: string, key: ColumnKey) => (
    <th className="px-3 py-2 text-left" key={key}>
      <button type="button" className="bedrock-focus inline-flex items-center gap-1" onClick={() => {
        if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
      }}>
        {label}<ArrowUpDown size={14} />
      </button>
    </th>
  );

  return (
    <section className="bedrock-surface overflow-hidden rounded-2xl">
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-black/35 text-xs uppercase tracking-[0.12em] text-[var(--bedrock-muted)]">
            <tr>
              <th className="px-3 py-2"><input aria-label="Select all rows" type="checkbox" checked={paged.length > 0 && paged.every((row) => selected.includes(row.id))} onChange={(e) => onSelectAll(e.target.checked)} /></th>
              {visibleColumns.date && headerCell("Date", "date")}
              {visibleColumns.memo && headerCell("Memo/Payee", "memo")}
              {visibleColumns.debit && headerCell("Debit", "debit")}
              {visibleColumns.credit && headerCell("Credit", "credit")}
              {visibleColumns.amount && <th className="px-3 py-2 text-right">Amount</th>}
              {visibleColumns.source && headerCell("Source", "source")}
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? <tr><td colSpan={8} className="px-3 py-12 text-center text-[var(--bedrock-muted)]">No matching expenses. Refine filters or create a new expense.</td></tr> : paged.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--bedrock-border)]/80 hover:bg-white/5">
                <td className={`px-3 ${rowPadding}`}><input aria-label={`Select expense ${entry.id}`} type="checkbox" checked={selected.includes(entry.id)} onChange={(e) => onSelect(entry.id, e.target.checked)} /></td>
                {visibleColumns.date && <td className={`px-3 ${rowPadding}`}>{entry.date}</td>}
                {visibleColumns.memo && <td className={`px-3 ${rowPadding}`}>{entry.memo || "—"}</td>}
                {visibleColumns.debit && <td className={`px-3 ${rowPadding}`}>{entry.debit_account}</td>}
                {visibleColumns.credit && <td className={`px-3 ${rowPadding}`}>{entry.credit_account}</td>}
                {visibleColumns.amount && <td className={`px-3 text-right ${rowPadding}`}>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(entry.amount))}</td>}
                {visibleColumns.source && <td className={`px-3 ${rowPadding}`}><span className="rounded-full border border-[var(--bedrock-border)] px-2 py-0.5 text-xs">{entry.source_type === "PURCHASE_ORDER" ? "Purchase Order" : "Manual"}</span></td>}
                <td className={`px-3 ${rowPadding}`}>
                  <div className="flex gap-1">
                    <button className="bedrock-focus rounded p-1 hover:bg-white/10" aria-label="View" onClick={() => onOpenDetails(entry)}><Eye size={15} /></button>
                    <button className="bedrock-focus rounded p-1 hover:bg-white/10" aria-label="Edit"><Pencil size={15} /></button>
                    <button className="bedrock-focus rounded p-1 hover:bg-white/10" aria-label="Duplicate"><Files size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-col gap-2 border-t border-[var(--bedrock-border)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[var(--bedrock-muted)]">{sorted.length} total • page {boundedPage} of {totalPages}</p>
        <div className="flex items-center gap-2">
          <select className="bedrock-focus rounded border border-[var(--bedrock-border)] bg-black/20 px-2 py-1" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}/page</option>)}
          </select>
          <button className="bedrock-focus rounded border border-[var(--bedrock-border)] px-2 py-1 disabled:opacity-40" disabled={boundedPage <= 1} onClick={() => onPage(boundedPage - 1)}>Prev</button>
          <button className="bedrock-focus rounded border border-[var(--bedrock-border)] px-2 py-1 disabled:opacity-40" disabled={boundedPage >= totalPages} onClick={() => onPage(boundedPage + 1)}>Next</button>
        </div>
      </footer>
    </section>
  );
}
