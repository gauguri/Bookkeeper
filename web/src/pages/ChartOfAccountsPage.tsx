import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch } from "../api";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "COGS" | "OTHER";

type ParentSummary = {
  id: number;
  name: string;
  code?: string | null;
};

type ChartAccount = {
  id: number;
  code?: string | null;
  name: string;
  type: AccountType;
  subtype?: string | null;
  description?: string | null;
  is_active: boolean;
  parent_account_id?: number | null;
  parent_account?: ParentSummary | null;
  created_at: string;
  updated_at: string;
};

type AccountForm = {
  name: string;
  code: string;
  type: AccountType;
  subtype: string;
  parent_account_id: string;
  description: string;
  is_active: boolean;
};

const accountTypes: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE", "COGS", "OTHER"];

const emptyForm: AccountForm = {
  name: "",
  code: "",
  type: "ASSET",
  subtype: "",
  parent_account_id: "",
  description: "",
  is_active: true
};

const typeLabel: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COGS: "COGS",
  OTHER: "Other"
};

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "ALL">("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (activeOnly) params.set("active", "true");
      const query = params.toString();
      const data = await apiFetch<ChartAccount[]>(`/chart-of-accounts${query ? `?${query}` : ""}`);
      setAccounts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, activeOnly]);

  const parentOptions = useMemo(
    () => accounts.filter((account) => account.id !== editingId),
    [accounts, editingId]
  );

  const openCreateForm = () => {
    setFormOpen(true);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  };

  const openEditForm = (account: ChartAccount) => {
    setFormOpen(true);
    setEditingId(account.id);
    setForm({
      name: account.name,
      code: account.code ?? "",
      type: account.type,
      subtype: account.subtype ?? "",
      parent_account_id: account.parent_account_id ? String(account.parent_account_id) : "",
      description: account.description ?? "",
      is_active: account.is_active
    });
    setError("");
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      type: form.type,
      subtype: form.subtype.trim() || null,
      parent_account_id: form.parent_account_id ? Number(form.parent_account_id) : null,
      description: form.description.trim() || null,
      is_active: form.is_active
    };

    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await apiFetch<ChartAccount>(`/chart-of-accounts/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch<ChartAccount>("/chart-of-accounts", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      closeForm();
      await loadAccounts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (accountId: number) => {
    setError("");
    try {
      await apiFetch(`/chart-of-accounts/${accountId}`, { method: "DELETE" });
      await loadAccounts();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting</p>
          <h1 className="text-3xl font-semibold">Chart of Accounts</h1>
          <p className="text-muted">Manage your accounting categories and posting accounts.</p>
        </div>
        <button className="app-button" onClick={openCreateForm}>
          <Plus className="h-4 w-4" /> New account
        </button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {formOpen && (
        <form className="app-card space-y-4 p-6" onSubmit={submitForm}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{editingId ? "Edit account" : "New account"}</h2>
            <span className="app-badge border-primary/30 bg-primary/10 text-primary">COA</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Name *</span>
              <input className="app-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Code</span>
              <input className="app-input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Type *</span>
              <select className="app-input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AccountType })}>
                {accountTypes.map((accountType) => (
                  <option key={accountType} value={accountType}>{typeLabel[accountType]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Subtype</span>
              <input className="app-input" value={form.subtype} onChange={(event) => setForm({ ...form, subtype: event.target.value })} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Parent account</span>
              <select className="app-input" value={form.parent_account_id} onChange={(event) => setForm({ ...form, parent_account_id: event.target.value })}>
                <option value="">None</option>
                {parentOptions.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground">Description</span>
              <input className="app-input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Active
          </label>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button className="app-button-secondary" type="button" onClick={closeForm}>Cancel</button>
            <button className="app-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </form>
      )}

      <div className="app-card space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
          <input
            className="app-input"
            placeholder="Search accounts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as AccountType | "ALL")}>
            <option value="ALL">All Types</option>
            {accountTypes.map((accountType) => (
              <option key={accountType} value={accountType}>{typeLabel[accountType]}</option>
            ))}
          </select>
          <button className="app-button-secondary" onClick={() => setActiveOnly((prev) => !prev)}>
            {activeOnly ? "Active only" : "All"}
          </button>
          <button className="app-button-secondary" onClick={() => loadAccounts()}>Search</button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No accounts yet. Create your first account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Subtype</th>
                  <th className="px-3 py-2">Parent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-border/50">
                    <td className="px-3 py-2">{account.code || "—"}</td>
                    <td className="px-3 py-2 font-medium">{account.name}</td>
                    <td className="px-3 py-2">{typeLabel[account.type]}</td>
                    <td className="px-3 py-2">{account.subtype || "—"}</td>
                    <td className="px-3 py-2">{account.parent_account?.name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`app-badge ${account.is_active ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted"}`}>
                        {account.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button className="app-button-secondary" onClick={() => openEditForm(account)}>Edit</button>
                        <button className="app-button-secondary text-danger" onClick={() => deleteAccount(account.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
