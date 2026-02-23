import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { BankTransaction } from "../../hooks/useBanking";
import { formatCurrency } from "../../utils/formatters";

type Props = {
  rows: BankTransaction[];
  selected: number[];
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onOpen: (row: BankTransaction) => void;
};

const statusStyle: Record<string, string> = {
  new: "bg-warning/20 text-warning",
  categorized: "bg-primary/15 text-primary",
  matched: "bg-success/20 text-success",
  reconciled: "bg-success/20 text-success",
  excluded: "bg-muted/20 text-muted",
};

export default function TransactionsTable({ rows, selected, onSelect, onSelectAll, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: keyof BankTransaction; dir: "asc" | "desc" }>({ key: "posted_date", dir: "desc" });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const first = a[sort.key];
    const second = b[sort.key];
    const aVal = first ?? "";
    const bVal = second ?? "";
    if (aVal === bVal) return 0;
    return aVal > bVal ? (sort.dir === "asc" ? 1 : -1) : (sort.dir === "asc" ? -1 : 1);
  }), [rows, sort]);

  return (
    <div className="app-card overflow-hidden">
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 bg-surface-strong text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-3"><input aria-label="Select all" type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={(event) => onSelectAll(event.target.checked)} /></th>
              {[
                ["posted_date", "Date"], ["description", "Description"], ["category", "Category"], ["status", "Status"], ["amount", "Amount"],
              ].map(([key, label]) => (
                <th key={key} className="px-3 py-3">
                  <button className="inline-flex items-center gap-1" onClick={() => setSort((prev) => ({ key: key as keyof BankTransaction, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))}>{label}{sort.key === key ? (sort.dir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : null}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="app-table-row border-t">
                <td className="px-3 py-2"><input aria-label={`Select ${row.description}`} type="checkbox" checked={selected.includes(row.id)} onChange={(event) => onSelect(row.id, event.target.checked)} /></td>
                <td className="px-3 py-2">{row.posted_date}</td>
                <td className="px-3 py-2"><button className="text-left underline-offset-2 hover:underline" onClick={() => onOpen(row)}>{row.description}</button></td>
                <td className="px-3 py-2">{row.category ? <span className="rounded-full border px-2 py-0.5 text-xs">{row.category}</span> : <span className="text-muted">Uncategorized</span>}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[row.status] || "bg-secondary"}`}>{row.status}</span></td>
                <td className={`px-3 py-2 text-right font-semibold ${row.amount < 0 ? "text-danger" : "text-success"}`}>{formatCurrency(row.amount)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="px-3 py-6 text-center text-muted" colSpan={6}>No transactions found. Adjust filters or import a statement.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
