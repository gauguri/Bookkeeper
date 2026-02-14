import { useEffect, useState } from "react";
import { apiFetch } from "../api";

type ControlUser = { id: number; email: string; full_name?: string | null; is_admin: boolean; is_active: boolean };
type Module = { key: string; name: string };

export default function ControlPage() {
  const [users, setUsers] = useState<ControlUser[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  useEffect(() => {
    apiFetch<ControlUser[]>("/control/users").then(setUsers);
    apiFetch<Module[]>("/control/modules").then(setModules);
  }, []);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Control</h2>
      <div className="app-card p-4">
        <p className="text-sm text-muted">Users</p>
        <div className="mt-3 space-y-2">
          {users.map((user) => (
            <div key={user.id} className="rounded border p-2 text-sm">
              {user.email} · {user.is_admin ? "Admin" : "Employee"} · {user.is_active ? "Active" : "Inactive"}
            </div>
          ))}
        </div>
      </div>
      <div className="app-card p-4">
        <p className="text-sm text-muted">Available modules</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {modules.map((module) => (
            <span key={module.key} className="app-badge">{module.name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
