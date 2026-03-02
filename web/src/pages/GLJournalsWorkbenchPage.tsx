import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../api";

type Journal = { id: number; document_number: string; posting_date: string; source_module: string; debits: number; credits: number; status: string; reference?: string };

export default function GLJournalsWorkbenchPage() {
  const [items, setItems] = useState<Journal[]>([]);
  const location = useLocation();

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
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="app-button-secondary" onClick={exportJournals}>Export</button>
        <Link className="app-button-secondary" to={`/accounting/gl${location.search}`}>Filters</Link>
      </div>

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
