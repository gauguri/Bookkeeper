import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type Journal = { id: number; document_number: string; posting_date: string; source_module: string; debits: number; credits: number; status: string; reference?: string };

export default function GLJournalsWorkbenchPage() {
  const [items, setItems] = useState<Journal[]>([]);
  useEffect(() => {
    apiFetch<{ items: Journal[] }>("/gl/journals?page=1&page_size=100").then((res) => setItems(res.items));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Journal Entry Workbench</h1>
      <div className="rounded-xl border bg-white p-4 overflow-auto">
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
    </div>
  );
}
