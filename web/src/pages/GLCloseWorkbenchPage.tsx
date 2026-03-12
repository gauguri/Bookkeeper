import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type Checklist = { unposted_journals: number; failed_posting_batches: number; subledger_posting_complete: boolean; trial_balance_balanced: boolean };

export default function GLCloseWorkbenchPage() {
  const [ledgerId, setLedgerId] = useState<number>(0);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const year = new Date().getFullYear();
  const period = new Date().getMonth() + 1;

  useEffect(() => {
    apiFetch<{ ledger_id: number }>("/gl/bootstrap", { method: "POST" }).then((res) => setLedgerId(res.ledger_id));
  }, []);

  useEffect(() => {
    if (!ledgerId) return;
    apiFetch<Checklist>(`/gl/reports/close-checklist?ledger_id=${ledgerId}&year=${year}&period=${period}`).then(setChecklist);
  }, [ledgerId, year, period]);

  const runPosting = async () => {
    await apiFetch(`/gl/posting/run?ledger_id=${ledgerId}&source_module=AR&period=${year}-${String(period).padStart(2, "0")}`, { method: "POST" });
    const refreshed = await apiFetch<Checklist>(`/gl/reports/close-checklist?ledger_id=${ledgerId}&year=${year}&period=${period}`);
    setChecklist(refreshed);
  };

  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Close Workbench</h1>
    <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
      <div>Subledger posting complete: {String(checklist?.subledger_posting_complete ?? false)}</div>
      <div>Unposted journals: {checklist?.unposted_journals ?? 0}</div>
      <div>Posting exceptions: {checklist?.failed_posting_batches ?? 0}</div>
      <div>Trial balance balanced: {String(checklist?.trial_balance_balanced ?? false)}</div>
      <button className="rounded-md bg-slate-900 text-white px-3 py-2" onClick={runPosting}>Run Subledger Posting</button>
    </div>
  </div>;
}
