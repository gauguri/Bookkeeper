import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

type Kpis = {
  unposted_journals: number;
  failed_posting_batches: number;
  trial_balance_balanced: boolean;
  subledger_posting_complete: boolean;
};

export default function GeneralLedgerCommandCenterPage() {
  const [ledgerId, setLedgerId] = useState<number | null>(null);
  const [kpi, setKpi] = useState<Kpis | null>(null);

  useEffect(() => {
    apiFetch<{ ledger_id: number }>("/gl/bootstrap").then((res) => setLedgerId(res.ledger_id));
  }, []);

  useEffect(() => {
    if (!ledgerId) return;
    const year = new Date().getFullYear();
    const period = new Date().getMonth() + 1;
    apiFetch<Kpis>(`/gl/reports/close-checklist?ledger_id=${ledgerId}&year=${year}&period=${period}`).then(setKpi);
  }, [ledgerId]);

  const tiles = useMemo(
    () => [
      { label: "Unposted Journals", value: kpi?.unposted_journals ?? 0, to: "/accounting/gl/journals" },
      { label: "Posting Exceptions", value: kpi?.failed_posting_batches ?? 0, to: "/accounting/gl/close" },
      { label: "Trial Balance", value: kpi?.trial_balance_balanced ? "Balanced" : "Check", to: "/accounting/gl/reports" },
      { label: "Subledger", value: kpi?.subledger_posting_complete ? "Complete" : "Pending", to: "/accounting/gl/close" }
    ],
    [kpi]
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">General Ledger Command Center</h1>
      <div className="grid gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} to={tile.to} className="rounded-xl border bg-white p-4 shadow-sm hover:shadow">
            <div className="text-xs uppercase text-slate-500">{tile.label}</div>
            <div className="mt-2 text-2xl font-semibold">{tile.value}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Work queues</h2>
          <ul className="space-y-2 text-sm">
            <li>• Draft / Unposted journals: {kpi?.unposted_journals ?? 0}</li>
            <li>• Posting exceptions: {kpi?.failed_posting_batches ?? 0}</li>
            <li>• Period close tasks: {(kpi?.subledger_posting_complete ?? false) ? "ready" : "needs action"}</li>
          </ul>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Quick Actions</h2>
          <div className="flex flex-col gap-2 text-sm">
            <Link className="rounded-md bg-slate-900 px-3 py-2 text-white" to="/accounting/gl/journals">+ New Journal Entry</Link>
            <Link className="rounded-md border px-3 py-2" to="/accounting/gl/close">Run Subledger Posting</Link>
            <Link className="rounded-md border px-3 py-2" to="/accounting/gl/reports">Trial Balance</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
