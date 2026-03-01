import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { apiFetch } from "../api";

type Journal = { id: number; document_number: string; posting_date: string; source_module: string; debits: number; credits: number; status: string; reference?: string };

export default function GLJournalsWorkbenchPage() {
  const [items, setItems] = useState<Journal[]>([]);
  const location = useLocation();

  const tabs = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", to: "/accounting/gl" },
      { key: "journals", label: "Journal Entries", to: "/accounting/gl/journals" },
      { key: "trial", label: "Trial Balance", to: "/accounting/gl/reports/trial-balance" },
      { key: "close", label: "Close", to: "/accounting/gl/close" },
      { key: "reports", label: "Reports", to: "/accounting/gl/reports" },
    ],
    [],
  );

  const exportJournals = () => {
    const rows = [
      ["Doc #", "Posting Date", "Source", "Reference", "Debits", "Credits", "Status"],
      ...items.map((row) => [
        row.document_number,
        row.posting_date,
        row.source_module,
        row.reference ?? "",
        row.debits.toString(),
        row.credits.toString(),
        row.status,
      ]),
    ];
    const csv = rows
      .map((line) => line.map((cell) => `"${cell.split('"').join('""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "journal-entries.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    apiFetch<{ items: Journal[] }>("/gl/journals?page=1&page_size=100").then((res) => setItems(res.items));
  }, []);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Accounting / General Ledger / Journal Entries</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting</p>
          <h1 className="text-2xl font-bold">Journal Entry Workbench</h1>
          <p className="text-sm text-muted">Create, review, and post journal entries.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="app-button" to={`/accounting/gl?createJournal=1${location.search ? `&${location.search.replace("?", "")}` : ""}`}>+ New Journal Entry</Link>
          <button type="button" className="app-button-secondary" onClick={exportJournals}>Export</button>
          <Link className="app-button-secondary" to={`/accounting/gl${location.search}`}>Filters</Link>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="General ledger sections">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={`${tab.to}${location.search}`}
            end={tab.to === "/accounting/gl"}
            className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "border bg-surface text-muted hover:text-foreground"}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-card overflow-auto p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Doc #</th><th>Posting Date</th><th>Source</th><th>Reference</th><th>Debits</th><th>Credits</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t">
                <td>{row.document_number}</td><td>{row.posting_date}</td><td>{row.source_module}</td><td>{row.reference ?? "-"}</td><td>{row.debits}</td><td>{row.credits}</td><td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
