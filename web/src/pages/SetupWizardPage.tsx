import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError, apiFetch } from "../api";
import { MODULES } from "../constants/modules";

type BootstrapStatus = { needs_bootstrap: boolean };
type ModuleOption = { key: string; name: string };

type AdditionalUser = {
  email: string;
  full_name: string;
  password: string;
  role: "ADMIN" | "EMPLOYEE";
  permissions: string[];
};

type BootstrapUserCreate = {
  email: string;
  full_name?: string;
  password: string;
  role: "ADMIN" | "EMPLOYEE";
  permissions: string[];
};

const MODULE_OPTIONS: ModuleOption[] = [
  { key: MODULES.INVOICES, name: "Invoices" },
  { key: MODULES.SALES_REQUESTS, name: "Sales Requests" },
  { key: MODULES.PURCHASE_ORDERS, name: "Purchase Orders" },
  { key: MODULES.INVENTORY, name: "Inventory" },
  { key: MODULES.SUPPLIERS, name: "Suppliers" },
  { key: MODULES.CHART_OF_ACCOUNTS, name: "Chart of Accounts" },
  { key: MODULES.PAYMENTS, name: "Payments" },
  { key: MODULES.EXPENSES, name: "Expenses" },
  { key: MODULES.REPORTS, name: "Reports" }
];

const EMPTY_USER: AdditionalUser = {
  email: "",
  full_name: "",
  password: "",
  role: "EMPLOYEE",
  permissions: []
};

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [adminEmail, setAdminEmail] = useState("admin@bookkeeper.local");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const [users, setUsers] = useState<AdditionalUser[]>([{ ...EMPTY_USER }]);

  const canCreateAdmin = useMemo(
    () => adminEmail.trim() && adminPassword.length >= 10 && adminPassword === adminConfirmPassword,
    [adminEmail, adminConfirmPassword, adminPassword]
  );

  useEffect(() => {
    apiFetch<BootstrapStatus>("/auth/bootstrap/status")
      .then((status) => {
        if (!status.needs_bootstrap) {
          setError("Bootstrap is already complete. Redirecting to login...");
          window.setTimeout(() => navigate("/login", { replace: true }), 1200);
        }
      })
      .catch((fetchError) => setError((fetchError as Error).message));
  }, [navigate]);

  useEffect(() => {
    if (step !== 1) return;

    const intervalId = window.setInterval(() => {
      apiFetch<BootstrapStatus>("/auth/bootstrap/status")
        .then((status) => {
          if (!status.needs_bootstrap) {
            setError("Bootstrap completed in another session. Redirecting to login...");
            window.setTimeout(() => navigate("/login", { replace: true }), 1200);
          }
        })
        .catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [navigate, step]);

  const createAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateAdmin) {
      setError("Use a valid email, a 10+ character password, and matching confirmation.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{ access_token: string }>("/auth/bootstrap/admin", {
        method: "POST",
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      });
      setAdminToken(response.access_token);
      setStep(2);
    } catch (requestError) {
      const err = requestError as ApiRequestError;
      if (err.status === 409) {
        setError("Bootstrap was already completed by another user. Redirecting to login...");
        window.setTimeout(() => navigate("/login", { replace: true }), 1200);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitAdditionalUsers = async () => {
    if (!adminToken) {
      setError("Missing setup session. Please restart setup.");
      return;
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const candidateUsers = users.filter(
      (user) => user.email.trim().length > 0 || user.password.trim().length > 0 || user.full_name.trim().length > 0
    );

    for (const user of candidateUsers) {
      if (!user.email.trim()) {
        setError("Each additional user must include an email.");
        return;
      }
      if (!EMAIL_REGEX.test(user.email.trim())) {
        setError(`Invalid email format for ${user.email || "a user"}.`);
        return;
      }
      if (!user.password.trim()) {
        setError(`Password is required for ${user.email}.`);
        return;
      }
      if (user.password.length < 8) {
        setError(`Password must be at least 8 characters for ${user.email}.`);
        return;
      }
    }

    const payload: BootstrapUserCreate[] = candidateUsers.map((user) => ({
      email: user.email.trim(),
      full_name: user.full_name.trim() || undefined,
      password: user.password,
      role: user.role,
      permissions: user.role === "ADMIN" ? [] : user.permissions
    }));

    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await apiFetch("/auth/bootstrap/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify([...payload])
      });
      setSuccessMessage("Additional users saved successfully.");
      setStep(3);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateUser = (index: number, patch: Partial<AdditionalUser>) => {
    setUsers((prev) => prev.map((user, userIndex) => (userIndex === index ? { ...user, ...patch } : user)));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="app-card w-full max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">First-run Setup Wizard</h1>
        <p className="text-sm text-muted">Step {step} of 3</p>
        {error ? <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}
        {successMessage ? <p className="rounded-lg border border-green-400/40 bg-green-500/10 px-3 py-2 text-sm text-green-500">{successMessage}</p> : null}

        {step === 1 ? (
          <form className="space-y-4" onSubmit={createAdmin}>
            <h2 className="text-lg font-semibold">Create initial admin user</h2>
            <input className="app-input w-full" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="Admin email" />
            <input
              className="app-input w-full"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Password (10+ characters)"
            />
            <input
              className="app-input w-full"
              type="password"
              value={adminConfirmPassword}
              onChange={(event) => setAdminConfirmPassword(event.target.value)}
              placeholder="Confirm password"
            />
            <button className="app-button-primary" type="submit" disabled={busy || !canCreateAdmin}>
              {busy ? "Creating..." : "Create admin"}
            </button>
          </form>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Create additional users (optional)</h2>
            {users.map((user, index) => (
              <div key={`user-row-${index}`} className="space-y-3 rounded-xl border border-border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="app-input w-full"
                    value={user.email}
                    onChange={(event) => updateUser(index, { email: event.target.value })}
                    placeholder="Email"
                  />
                  <input
                    className="app-input w-full"
                    value={user.full_name}
                    onChange={(event) => updateUser(index, { full_name: event.target.value })}
                    placeholder="Full name"
                  />
                  <input
                    className="app-input w-full"
                    type="password"
                    value={user.password}
                    onChange={(event) => updateUser(index, { password: event.target.value })}
                    placeholder="Password (8+ characters)"
                  />
                  <select className="app-input w-full" value={user.role} onChange={(event) => updateUser(index, { role: event.target.value as "ADMIN" | "EMPLOYEE" })}>
                    <option value="ADMIN">Admin</option>
                    <option value="EMPLOYEE">Employee</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Module access</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {MODULE_OPTIONS.map((option) => (
                      <label className="flex items-center gap-2 text-sm" key={`${option.key}-${index}`}>
                        <input
                          type="checkbox"
                          checked={user.permissions.includes(option.key) || user.role === "ADMIN"}
                          disabled={user.role === "ADMIN"}
                          onChange={(event) => {
                            const next = new Set(user.permissions);
                            if (event.target.checked) {
                              next.add(option.key);
                            } else {
                              next.delete(option.key);
                            }
                            updateUser(index, { permissions: Array.from(next) });
                          }}
                        />
                        {option.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-3">
              <button className="app-button-ghost" onClick={() => setUsers((prev) => [...prev, { ...EMPTY_USER }])} type="button">Add another user</button>
              <button className="app-button-ghost" onClick={() => setStep(3)} type="button">Skip for now</button>
              <button className="app-button-primary" onClick={submitAdditionalUsers} type="button" disabled={busy}>
                {busy ? "Saving..." : "Save users"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Setup complete</h2>
            <p className="text-sm text-muted">Your workspace is ready. Continue to login with the admin credentials you just created.</p>
            <button className="app-button-primary" onClick={() => window.location.assign("/login")} type="button">Go to login</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
