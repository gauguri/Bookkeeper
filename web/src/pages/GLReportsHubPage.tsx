import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "../api";

type TbRow = { gl_account_id: number; account_number: string; account_name: string; debit: number; credit: number; balance: number };

export default function GLReportsHubPage() {
  const [ledgerId, setLedgerId] = useState<number>(0);
  const [rows, setRows] = useState<TbRow[]>([]);
  const location = useLocation();
  const year = new Date().getFullYear();
  const period = new Date().getMonth() + 1;

  const title = useMemo(() => (location.pathname.endsWith("/trial-balance") ? "Trial Balance" : "Reports"), [location.pathname]);

  useEffect(() => {
    apiFetch<{ ledger_id: number }>("/gl/bootstrap").then((res) => setLedgerId(res.ledger_id));
  }, []);

  useEffect(() => {
    if (!ledgerId) return;
    apiFetch<TbRow[]>(`/gl/reports/trial-balance?ledger_id=${ledgerId}&year=${year}&period_from=1&period_to=${period}`).then(setRows);
  }, [ledgerId, year, period]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="rounded-xl border bg-white p-4 overflow-auto">
        <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">Trial Balance</h3>
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>Account</th><th>Name</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr className="border-t" key={row.gl_account_id}><td>{row.account_number}</td><td>{row.account_name}</td><td>{row.debit}</td><td>{row.credit}</td><td>{row.balance}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
