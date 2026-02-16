type Role = "ADMIN" | "EMPLOYEE";

type NewUserForm = {
  email: string;
  full_name: string;
  password: string;
  role: Role;
  is_active: boolean;
  permissions: string[];
};

type NewUserModalProps = {
  open: boolean;
  modules: string[];
  form: NewUserForm;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (next: NewUserForm) => void;
  onSave: () => void;
};

export default function NewUserModal({ open, modules, form, saving, error, onClose, onChange, onSave }: NewUserModalProps) {
  if (!open) return null;

  const togglePermission = (key: string) => {
    const next = new Set(form.permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...form, permissions: Array.from(next) });
  };

  const selectableModules = modules.filter((module) => module !== "CONTROL");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="app-card w-full max-w-2xl space-y-4 p-6">
        <h3 className="text-lg font-semibold">New user</h3>
        {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <input className="app-input" placeholder="Email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} />
          <input className="app-input" placeholder="Full name" value={form.full_name} onChange={(e) => onChange({ ...form, full_name: e.target.value })} />
          <input className="app-input" type="password" placeholder="Password" value={form.password} onChange={(e) => onChange({ ...form, password: e.target.value })} />
          <select className="app-select" value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value as Role })}>
            <option value="ADMIN">ADMIN</option>
            <option value="EMPLOYEE">EMPLOYEE</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={form.is_active} onChange={(e) => onChange({ ...form, is_active: e.target.checked })} />Active user</label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Module access</p>
          {form.role === "ADMIN" ? (
            <p className="text-sm text-muted">Admins have access to all modules.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectableModules.map((module) => (
                <button key={module} className={form.permissions.includes(module) ? "app-button" : "app-button-ghost"} onClick={() => togglePermission(module)} type="button">
                  {module}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button className="app-button-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="app-button" onClick={onSave} disabled={saving} type="button">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
