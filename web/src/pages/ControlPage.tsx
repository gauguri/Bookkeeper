import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, apiFetch } from "../api";
import EditUserModal from "../components/EditUserModal";
import NewUserModal from "../components/NewUserModal";
import ResetPasswordModal from "../components/ResetPasswordModal";

type Role = "ADMIN" | "EMPLOYEE";

type ControlUser = {
  id: number;
  email: string;
  full_name?: string | null;
  role: Role;
  is_active: boolean;
  permissions: string[];
};

type ControlModulesResponse = { modules: string[] };

type NewUserForm = {
  email: string;
  full_name: string;
  password: string;
  role: Role;
  is_active: boolean;
  permissions: string[];
};

type EditUserForm = {
  full_name: string;
  role: Role;
  is_active: boolean;
  permissions: string[];
};

const EMPTY_NEW_USER: NewUserForm = {
  email: "",
  full_name: "",
  password: "",
  role: "EMPLOYEE",
  is_active: true,
  permissions: []
};

export default function ControlPage() {
  const [users, setUsers] = useState<ControlUser[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<NewUserForm>(EMPTY_NEW_USER);
  const [newUserError, setNewUserError] = useState<string | null>(null);
  const [newUserSaving, setNewUserSaving] = useState(false);

  const [editingUser, setEditingUser] = useState<ControlUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({ full_name: "", role: "EMPLOYEE", is_active: true, permissions: [] });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [resettingUser, setResettingUser] = useState<ControlUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const employeeModules = useMemo(() => modules.filter((module) => module !== "CONTROL"), [modules]);

  const loadControlData = async () => {
    try {
      setError(null);
      const [usersResponse, modulesResponse] = await Promise.all([
        apiFetch<ControlUser[]>("/control/users"),
        apiFetch<ControlModulesResponse>("/control/modules")
      ]);
      setUsers(usersResponse);
      setModules(modulesResponse.modules);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  useEffect(() => {
    void loadControlData();
  }, []);

  const saveNewUser = async () => {
    setNewUserSaving(true);
    setNewUserError(null);
    try {
      await apiFetch<ControlUser>("/control/users", {
        method: "POST",
        body: JSON.stringify({
          email: newUserForm.email.trim(),
          full_name: newUserForm.full_name.trim() || null,
          password: newUserForm.password,
          role: newUserForm.role,
          is_active: newUserForm.is_active,
          permissions: newUserForm.role === "ADMIN" ? [] : newUserForm.permissions
        })
      });
      setNotice("User created.");
      setShowNewUser(false);
      setNewUserForm(EMPTY_NEW_USER);
      await loadControlData();
    } catch (requestError) {
      const err = requestError as ApiRequestError;
      if (err.status === 409) setNewUserError("Email already exists.");
      else setNewUserError(err.message);
    } finally {
      setNewUserSaving(false);
    }
  };

  const openEditModal = (user: ControlUser) => {
    setEditingUser(user);
    setEditError(null);
    setEditForm({
      full_name: user.full_name || "",
      role: user.role,
      is_active: user.is_active,
      permissions: [...user.permissions]
    });
  };

  const saveEditedUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await apiFetch<ControlUser>(`/control/users/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: editForm.full_name.trim() || null,
          role: editForm.role,
          is_active: editForm.is_active,
          permissions: editForm.role === "ADMIN" ? [] : editForm.permissions
        })
      });
      setNotice("User updated.");
      setEditingUser(null);
      await loadControlData();
    } catch (requestError) {
      setEditError((requestError as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const toggleUserActive = async (user: ControlUser) => {
    try {
      await apiFetch<ControlUser>(`/control/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: user.full_name ?? null,
          role: user.role,
          is_active: !user.is_active,
          permissions: user.role === "ADMIN" ? [] : user.permissions
        })
      });
      setNotice(`User ${!user.is_active ? "activated" : "deactivated"}.`);
      await loadControlData();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const saveResetPassword = async () => {
    if (!resettingUser) return;
    if (resetPassword !== resetConfirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }

    setResetSaving(true);
    setResetError(null);
    try {
      await apiFetch<void>(`/control/users/${resettingUser.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: resetPassword })
      });
      setNotice("Password reset.");
      setResettingUser(null);
      setResetPassword("");
      setResetConfirmPassword("");
    } catch (requestError) {
      setResetError((requestError as Error).message);
    } finally {
      setResetSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Control</h2>
        <button className="app-button" onClick={() => setShowNewUser(true)} type="button">+ New user</button>
      </div>
      {notice ? <p className="rounded-lg border border-green-400/40 bg-green-500/10 px-3 py-2 text-sm text-green-500">{notice}</p> : null}
      {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}

      <div className="app-card p-4 space-y-4">
        <p className="text-sm text-muted">Users</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role</th>
                <th className="p-2">Active</th>
                <th className="p-2">Modules</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="p-2">{user.full_name || "—"}</td>
                  <td className="p-2">{user.email}</td>
                  <td className="p-2">{user.role}</td>
                  <td className="p-2">{user.is_active ? "Yes" : "No"}</td>
                  <td className="p-2">{user.role === "ADMIN" ? "All modules" : user.permissions.join(", ") || "—"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="app-button-ghost" onClick={() => openEditModal(user)} type="button">Edit</button>
                      <button className="app-button-ghost" onClick={() => { setResettingUser(user); setResetError(null); }} type="button">Reset password</button>
                      <button className="app-button-ghost" onClick={() => void toggleUserActive(user)} type="button">{user.is_active ? "Deactivate" : "Activate"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-4">
        <p className="text-sm text-muted">Available modules</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {modules.map((module) => (
            <span key={module} className="app-badge">{module}</span>
          ))}
        </div>
      </div>

      <NewUserModal
        open={showNewUser}
        modules={employeeModules}
        form={newUserForm}
        saving={newUserSaving}
        error={newUserError}
        onClose={() => { setShowNewUser(false); setNewUserError(null); }}
        onChange={setNewUserForm}
        onSave={() => void saveNewUser()}
      />

      <EditUserModal
        open={Boolean(editingUser)}
        modules={employeeModules}
        email={editingUser?.email || ""}
        form={editForm}
        saving={editSaving}
        error={editError}
        onClose={() => { setEditingUser(null); setEditError(null); }}
        onChange={setEditForm}
        onSave={() => void saveEditedUser()}
      />

      <ResetPasswordModal
        open={Boolean(resettingUser)}
        email={resettingUser?.email || ""}
        password={resetPassword}
        confirmPassword={resetConfirmPassword}
        saving={resetSaving}
        error={resetError}
        onClose={() => { setResettingUser(null); setResetError(null); }}
        onChangePassword={setResetPassword}
        onChangeConfirmPassword={setResetConfirmPassword}
        onSave={() => void saveResetPassword()}
      />
    </section>
  );
}
