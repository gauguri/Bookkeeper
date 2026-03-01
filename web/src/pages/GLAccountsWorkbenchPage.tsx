import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type Account = { id: number; account_number: string; name: string; account_type: string; normal_balance: string; is_active: boolean };

export default function GLAccountsWorkbenchPage() {
  const [items, setItems] = useState<Account[]>([]);
  useEffect(() => {
    apiFetch<Account[]>("/gl/accounts").then(setItems);
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
      <div className="rounded-xl border bg-white p-4 overflow-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>Account</th><th>Name</th><th>Type</th><th>Normal</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((row) => <tr className="border-t" key={row.id}><td>{row.account_number}</td><td>{row.name}</td><td>{row.account_type}</td><td>{row.normal_balance}</td><td>{row.is_active ? "Active" : "Inactive"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
